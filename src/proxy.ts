import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE_NAME, verifySessionCookie } from '@/lib/auth/session-cookie'
import { assertValidSupabaseUrl } from '@/lib/supabase-env'
import {
  MARKDOWN_CONTENT_TYPE,
  MARKDOWN_TWINS,
  isAiAgentUserAgent,
  isSignedInSection,
  notFoundMarkdown,
  prefersMarkdown,
} from '@/lib/agent-web'
import { SITE_URL } from '@/lib/site-url'
import { bearerChallenge } from '@/lib/oauth/oauth-core'
import { safeRedirect } from '@/lib/auth/safe-redirect'

type CookieToSet = { name: string; value: string; options: CookieOptions }

/**
 * Routes reachable without a session.
 *
 * `/` is matched exactly - the previous implementation prefix-matched every
 * entry, and because `'/'` is a prefix of every path, `startsWith` made the
 * whole application public and the redirect below unreachable.
 */
const EXACT_PUBLIC_ROUTES = new Set([
  '/oauth/agent/identity',
  '/',
  // Container and load-balancer probes cannot authenticate (TODO.md §12).
  // The endpoint reports status only - no secrets, no counts.
  '/api/health',
  // Local-storage objects carry their own authorisation: an HMAC over
  // bucket + path + expiry that only the server can mint. Bouncing these to
  // the login page made every signed URL unusable. The route verifies the
  // signature itself and 403s without it.
  '/api/storage',
  // Search engine crawlers (and this app's own robots.ts/sitemap.ts routes
  // advertising themselves) never carry a session cookie - without these,
  // every crawler request was bounced to /auth/login instead of getting the
  // actual file, so the site was effectively unindexable.
  '/robots.txt',
  '/sitemap.xml',
  // Structured-data feeds for agents (NLWeb Schema Feeds), named in robots.txt.
  '/schemamap.xml',
  '/feeds/site.jsonl',
  // Browsers fetch the web app manifest without cookies (no crossorigin
  // credentials), so "Add to Home Screen" got the login page instead and fell
  // back to a page screenshot as the icon.
  '/manifest.webmanifest',
  // The MCP endpoint (Claude Code and other MCP clients) authenticates with
  // the same `Authorization: Bearer` API key as /api/v1 - it checks the key
  // itself and 401s without one - and never carries a session cookie, so the
  // login redirect below would make it unreachable. Exact match: it is a
  // single POST-only route with no sub-paths.
  '/api/mcp',
  // The API's base URL describes itself (src/app/api/v1/route.ts).
  '/api/v1',
  // Its server card (public description) and the public docs MCP server.
  '/api/mcp/server-card',
  '/api/mcp/docs',
  '/api/mcp/docs/server-card',
  // GitHub App webhook - GitHub never carries a session cookie; the route
  // verifies the X-Hub-Signature-256 HMAC itself and 401s without it.
  '/api/github/webhook',
  // Stripe webhook - same reasoning: Stripe never carries a session cookie,
  // the route verifies the Stripe-Signature header itself.
  '/api/stripe/webhook',
  // Landing-page sign-up button counter (migration 096) - anonymous by design,
  // only a known button name is accepted.
  '/api/funnel/cta',
  // Machine-readable descriptions of the site for AI agents: the llms.txt
  // guide (public/llms.txt) and the homepage as Markdown (src/app/index.md).
  '/llms.txt',
  '/index.md',
  // Developer docs and machine-readable descriptions of the API (OpenAPI,
  // pricing as Markdown) - public by nature: they describe the API, they
  // grant nothing.
  '/developers',
  '/developers.md',
  '/developers/llms.txt',
  '/openapi.json',
  '/pricing.md',
  // OAuth 2.1 endpoints MCP clients call without a session (src/app/oauth):
  // each authenticates on its own terms (PKCE code, refresh token) or is
  // open by design (dynamic client registration). /oauth/authorize is not
  // here - it is the consent screen and needs a signed-in person.
  '/oauth/token',
  '/oauth/register',
  '/oauth/revoke',
  // How agents get credentials, as Markdown (src/app/auth.md).
  '/auth.md',
  // NLWeb question endpoint over the public docs (src/app/ask).
  '/ask',
  // Who runs Guidon and how to reach them, plus their Markdown twins.
  '/about',
  '/brand',
  '/about.md',
  '/contact',
  '/contact.md',
  // The sandbox explained (src/app/sandbox) - /sandbox/start needs a session.
  '/sandbox',
  '/sandbox.md',
  // The MCP manifest, also under /.well-known/ (src/app/.well-known/mcp.json).
  '/mcp.json',
  // Webhook retry worker (src/app/api/cron/webhooks) - authenticates with
  // CRON_SECRET, not a session.
  '/api/cron/webhooks',
  // A2A docs agent (src/app/api/a2a) - public like the docs MCP server.
  '/api/a2a',
  // Onboarding before the account exists (app/start) - the questions come
  // first, signing up last. /start/finish needs a session and isn't listed.
  '/start',
])
// "Public" here means "authenticates itself, doesn't need a session cookie" -
// /api/v1 is the AI Task API (route-guard.ts's guardApiRequest): every
// external caller (an AI agent, not a browser) authenticates with
// `Authorization: Bearer guidon_...`, never a session cookie. Without this
// prefix, every /api/v1 request with no session cookie - which is the ONLY
// way this API is meant to be called - was redirected to /auth/login before
// the route handler's own API-key check ever ran, making the whole AI Task
// API unreachable by its actual callers.
// /legal/ (Terms, Privacy Policy) must be readable by a visitor who hasn't
// signed up yet - deciding whether to sign up is exactly when someone reads
// them - and by search engines/link previews with no session at all.
// /downloads/plugins/ holds the editor plugins' zips and manifest.json
// (scripts/build-plugin-zips.mjs) - open-source code, nothing user-specific,
// and Guidon Desktop's plugin installer fetches them without a browser
// session. Signing in is still what the plugins themselves need to do anything.
// /widget/ holds the embeddable bug-report widget (public/widget/report.js),
// loaded by other people's websites with no Guidon session.
// /.well-known/ holds discovery documents (RFC 9727 API catalog) for agents.
const PUBLIC_ROUTE_PREFIXES = ['/auth/', '/api/v1/', '/legal/', '/downloads/plugins/', '/widget/', '/.well-known/']

/** Signed-in users are bounced away from these. */
const AUTH_ENTRY_ROUTES = new Set(['/auth/login', '/auth/signup'])

function isPublicRoute(pathname: string): boolean {
  if (EXACT_PUBLIC_ROUTES.has(pathname)) return true
  return PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

function redirectToLogin(request: NextRequest, pathname: string) {
  // API callers can't follow a redirect to an HTML login form - they get a
  // JSON 401 they can parse instead.
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    // The challenge tells an agent where the OAuth metadata is (RFC 9728).
    return NextResponse.json(
      { error: 'Authentication required.', code: 'unauthorized' },
      { status: 401, headers: { 'WWW-Authenticate': bearerChallenge(SITE_URL, '/api/v1') } }
    )
  }
  const redirectUrl = new URL('/auth/login', request.url)
  // Keep the query string: pages like /discord/link carry a signed token in
  // it, and dropping it would send the user back to the page without it.
  // safeRedirect() still only accepts same-site paths.
  redirectUrl.searchParams.set('redirect', pathname + request.nextUrl.search)
  return NextResponse.redirect(redirectUrl)
}

/**
 * A signed-in user opening the login/signup page goes where that page would
 * have sent them after signing in - e.g. the pricing section's "upgrade"
 * link (/auth/signup?redirect=/upgrade?plan=pro) - instead of always the
 * dashboard.
 */
function redirectSignedIn(request: NextRequest) {
  const target = new URL(safeRedirect(request.nextUrl.searchParams.get('redirect')), request.url)
  if (target.origin !== request.nextUrl.origin) return NextResponse.redirect(new URL('/dashboard', request.url))
  return NextResponse.redirect(target)
}

/**
 * Answers that don't depend on who is asking, decided before any session
 * lookup (see src/lib/agent-web.ts):
 * - `/` and other pages in MARKDOWN_TWINS are served their Markdown twin
 *   for `Accept: text/markdown`, `?mode=agent` or an AI user agent, with
 *   `Vary: Accept, User-Agent`. The HTML page can't carry that header too - Next
 *   overwrites `Vary` on every app-router page - but this runs before the
 *   page cache, so the two never share a cache entry here; browsers never
 *   ask for Markdown.
 * - A path that is neither public nor under a signed-in section has no page,
 *   so it must get a real 404 - redirecting it to the login page told agents
 *   every path exists. Next renders the 404 page; agents asking for Markdown
 *   get a Markdown 404 straight from here.
 */
function agentResponse(request: NextRequest): NextResponse | null {
  const { pathname, searchParams } = request.nextUrl
  const wantsMarkdown = prefersMarkdown(request.headers.get('accept'))

  // Pages with a Markdown twin hand it to agents: by Accept header, by
  // `?mode=agent`, or to AI crawlers/assistants by User-Agent.
  const twin = MARKDOWN_TWINS[pathname]
  if (twin) {
    const forAgent =
      wantsMarkdown || searchParams.get('mode') === 'agent' || isAiAgentUserAgent(request.headers.get('user-agent'))
    if (!forAgent) return null
    const response = NextResponse.rewrite(new URL(twin, request.url))
    response.headers.set('Vary', 'Accept, User-Agent')
    return response
  }
  if (isPublicRoute(pathname) || isSignedInSection(pathname)) return null

  if (wantsMarkdown) {
    return new NextResponse(notFoundMarkdown(pathname, SITE_URL), {
      status: 404,
      headers: { 'Content-Type': MARKDOWN_CONTENT_TYPE, Vary: 'Accept' },
    })
  }
  return NextResponse.next({ request })
}

/**
 * Self-hosted branch: no Supabase software is assumed to exist, so identity
 * comes from the signed session cookie (src/lib/auth/local-auth.ts) instead
 * of asking GoTrue. Verification is a local HMAC check - no database round
 * trip, no network call - which is why this can run on every request without
 * the latency concern a DB-backed session would have.
 *
 * Same detection as the migration runner and getCurrentUser(): DATABASE_URL
 * set means this process is a self-hosted install.
 */
async function proxyLocal(request: NextRequest) {
  const { pathname } = request.nextUrl
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const userId = await verifySessionCookie(cookie)

  if (!userId && !isPublicRoute(pathname)) {
    return redirectToLogin(request, pathname)
  }

  if (userId && AUTH_ENTRY_ROUTES.has(pathname)) {
    return redirectSignedIn(request)
  }

  return NextResponse.next({ request })
}

export async function proxy(request: NextRequest) {
  const early = agentResponse(request)
  if (early) return early

  if (process.env.DATABASE_URL) {
    return proxyLocal(request)
  }

  // The response is created up-front so refreshed auth cookies can be written
  // onto it; returning a different response would drop the rotated session.
  let response = NextResponse.next({ request })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    )
  }
  // This middleware matches nearly every route (see config.matcher below), so
  // an unvalidated malformed value here doesn't fail one page the way a bad
  // APP_URL did - createServerClient's SDK throws ERR_INVALID_URL deep inside
  // its own fetch layer on the first request, taking down every request.
  // Validating up front turns that into one clear, diagnosable error instead.
  assertValidSupabaseUrl(supabaseUrl)

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }

          response = NextResponse.next({ request })

          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    }
  )

  // getUser() revalidates the token with Supabase; getSession() would trust
  // whatever the cookie claims.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (!user && !isPublicRoute(pathname)) {
    // Same as self-hosted: API callers get a JSON 401, not a 307 to an HTML
    // login form they can't follow.
    return redirectToLogin(request, pathname)
  }

  if (user && AUTH_ENTRY_ROUTES.has(pathname)) {
    return redirectSignedIn(request)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - static image assets
     * - monaco-editor (scripts/copy-monaco-assets.mjs's ~150 static .js/.css
     *   files served from public/monaco-editor/vs - none of the extensions
     *   excluded above cover them, so every one of them used to pay for a
     *   full auth check same as a real page: a Supabase auth.getUser()
     *   network round trip per file in hosted mode, or a session-cookie
     *   verify in self-hosted. Opening the code editor fires dozens of these
     *   requests at once, none of which need or benefit from that check -
     *   they're public, static, unauthenticated by design.
     * - opengraph-image (src/app/opengraph-image.tsx, Next's file-convention
     *   OG image route) - it serves image/png but the URL itself has no
     *   file extension for the pattern above to match, so it was falling
     *   through to the same auth check and redirecting a link-preview bot
     *   (Slack/Discord/Twitter unfurling a shared link) to /auth/login
     *   instead of the image - those bots never carry a session cookie.
     */
    '/((?!_next/static|_next/image|favicon.ico|monaco-editor/|opengraph-image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
