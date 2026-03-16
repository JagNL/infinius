/**
 * middleware.ts — Next.js Edge Middleware
 *
 * Protects all routes except /login, /signup, and /api/* by checking for a
 * valid Supabase session cookie.  Unauthenticated users are redirected to
 * /login with a `next` query param so they can be returned after signing in.
 *
 * Uses the lightweight @supabase/ssr createServerClient helper which reads
 * the session from cookies (set by the browser client on sign-in).
 *
 * Configuration:
 *   NEXT_PUBLIC_SUPABASE_URL       — your Supabase project URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY  — your Supabase anon/public key
 *
 * NOTE: This middleware runs on every matched request at the Edge, so it
 * must stay lightweight.  Never import heavy Node.js libraries here.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Routes that don't require authentication
const PUBLIC_PATHS = ['/login', '/signup', '/api'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow public routes
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Build a mutable response we can attach cookie updates to
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Refresh the session (rotates tokens if needed)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Not authenticated — redirect to /login
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  // Run on all routes except static assets and Next.js internals
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
