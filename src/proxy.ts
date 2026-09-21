import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE_NAME, verifySessionCookie } from '@/lib/auth/session-cookie'
import { assertValidSupabaseUrl } from '@/lib/supabase-env'

type CookieToSet = { name: string; value: string; options: CookieOptions }

/**
 * Routes reachable without a session.
 *
 * `/` is matched exactly - the previous implementation prefix-matched every
 * entry, and because `'/'` is a prefix of every path, `startsWith` made the
 * whole application public and the redirect below unreachable.
 */
const EXACT_PUBLIC_ROUTES = new Set([
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
  // The MCP endpoint (Claude Code and other MCP clients) authenticates with
  // the same `Authorization: Bearer` API key as /api/v1 - it checks the key
  // itself and 401s without one - and never carries a session cookie, so the
  // login redirect below would make it unreachable. Exact match: it is a
  // single POST-only route with no sub-paths.
  '/api/mcp',
])
// "Public" here means "authenticates itself, doesn't need a session cookie" -
// /api/v1 is the AI Task API (route-guard.ts's guardApiRequest): every
// external caller (an AI agent, not a browser) authenticates with
// `Authorization: Bearer guidon_...`, never a session cookie. Without this
// prefix, every /api/v1 request with no session cookie - which is the ONLY
// way this API is meant to be called - was redirected to /auth/login before
// the route handler's own API-key check ever ran, making the whole AI Task
// API unreachable by its actual callers.
const PUBLIC_ROUTE_PREFIXES = ['/auth/', '/api/v1/']

/** Signed-in users are bounced away from these. */
const AUTH_ENTRY_ROUTES = new Set(['/auth/login', '/auth/signup'])

function isPublicRoute(pathname: string): boolean {
  if (EXACT_PUBLIC_ROUTES.has(pathname)) return true
  return PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

function redirectToLogin(request: NextRequest, pathname: string) {
  const redirectUrl = new URL('/auth/login', request.url)
  // Keep the query string: pages like /discord/link carry a signed token in
  // it, and dropping it would send the user back to the page without it.
  // safeRedirect() still only accepts same-site paths.
  redirectUrl.searchParams.set('redirect', pathname + request.nextUrl.search)
  return NextResponse.redirect(redirectUrl)
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
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next({ request })
}

export async function proxy(request: NextRequest) {
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
    const redirectUrl = new URL('/auth/login', request.url)
    redirectUrl.searchParams.set('redirect', pathname + request.nextUrl.search)
    return NextResponse.redirect(redirectUrl)
  }

  if (user && AUTH_ENTRY_ROUTES.has(pathname)) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
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
     */
    '/((?!_next/static|_next/image|favicon.ico|monaco-editor/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
