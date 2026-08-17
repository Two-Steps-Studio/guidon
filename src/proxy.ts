import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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
])
const PUBLIC_ROUTE_PREFIXES = ['/auth/']

/** Signed-in users are bounced away from these. */
const AUTH_ENTRY_ROUTES = new Set(['/auth/login', '/auth/signup'])

function isPublicRoute(pathname: string): boolean {
  if (EXACT_PUBLIC_ROUTES.has(pathname)) return true
  return PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export async function proxy(request: NextRequest) {
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
