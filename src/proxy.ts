import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE_NAME, verifySessionCookie } from '@/lib/auth/session-cookie'

type CookieToSet = { name: string; value: string; options: CookieOptions }

/**
 * Routes reachable without a session.
 *
 * `/` is matched exactly — the previous implementation prefix-matched every
 * entry, and because `'/'` is a prefix of every path, `startsWith` made the
 * whole application public and the redirect below unreachable.
 */
const EXACT_PUBLIC_ROUTES = new Set([
  '/',
  // Container and load-balancer probes cannot authenticate (TODO.md §12).
  // The endpoint reports status only — no secrets, no counts.
  '/api/health',
  // Local-storage objects carry their own authorisation: an HMAC over
  // bucket + path + expiry that only the server can mint. Bouncing these to
  // the login page made every signed URL unusable. The route verifies the
  // signature itself and 403s without it.
  '/api/storage',
])
const PUBLIC_ROUTE_PREFIXES = ['/auth/']

/** Signed-in users are bounced away from these. */
const AUTH_ENTRY_ROUTES = new Set(['/auth/login', '/auth/signup'])

function isPublicRoute(pathname: string): boolean {
  if (EXACT_PUBLIC_ROUTES.has(pathname)) return true
  return PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

function redirectToLogin(request: NextRequest, pathname: string) {
  const redirectUrl = new URL('/auth/login', request.url)
  redirectUrl.searchParams.set('redirect', pathname)
  return NextResponse.redirect(redirectUrl)
}

/**
 * Self-hosted branch: no Supabase software is assumed to exist, so identity
 * comes from the signed session cookie (src/lib/auth/local-auth.ts) instead
 * of asking GoTrue. Verification is a local HMAC check — no database round
 * trip, no network call — which is why this can run on every request without
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

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
    redirectUrl.searchParams.set('redirect', pathname)
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
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
