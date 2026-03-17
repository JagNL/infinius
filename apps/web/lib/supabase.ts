/**
 * supabase.ts
 *
 * Browser-side Supabase client. Uses @supabase/ssr's createBrowserClient so
 * the session is stored in cookies — the same cookies that the Edge middleware
 * reads via createServerClient. This keeps auth state consistent between the
 * browser and the middleware without any extra setup.
 */

import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

// Keep the API-client token in sync with the Supabase session.
supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.access_token) {
    localStorage.setItem('infinius:token', session.access_token);
  } else {
    localStorage.removeItem('infinius:token');
  }
});

export type { User, Session as SupabaseSession } from '@supabase/supabase-js';
