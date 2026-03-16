/**
 * supabase.ts
 *
 * Browser-side Supabase client used for auth only.  All data access goes
 * through the Fastify API (which uses a service-role client server-side).
 *
 * Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env.local and fill in the values.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Persist the session in localStorage so the API client can pick up the
    // JWT via `infinius:token` (set in the onAuthStateChange listener below).
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // handles OAuth redirect callbacks
  },
});

// Keep the API-client token in sync with the Supabase session.
supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.access_token) {
    localStorage.setItem('infinius:token', session.access_token);
  } else {
    localStorage.removeItem('infinius:token');
  }
});

export type { User, Session as SupabaseSession } from '@supabase/supabase-js';
