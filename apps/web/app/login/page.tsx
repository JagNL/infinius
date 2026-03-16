/**
 * /login — Email + password login page.
 *
 * Uses Supabase Auth.  On success, the onAuthStateChange listener in
 * lib/supabase.ts stores the JWT in localStorage and we redirect to /.
 *
 * Also offers Google OAuth (add more providers in supabase.ts as needed).
 */

'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.push('/');
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-neutral-100">infinius</h1>
          <p className="mt-1 text-sm text-neutral-500">Sign in to your account</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-neutral-400" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 outline-none focus:border-blue-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-neutral-400" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 outline-none focus:border-blue-500"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-950/40 px-3 py-2 text-xs text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {/* Divider */}
        <div className="my-4 flex items-center gap-3">
          <hr className="flex-1 border-neutral-800" />
          <span className="text-xs text-neutral-600">or</span>
          <hr className="flex-1 border-neutral-800" />
        </div>

        {/* OAuth */}
        <button
          type="button"
          onClick={handleGoogle}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-700 bg-neutral-800 py-2.5 text-sm text-neutral-200 transition hover:bg-neutral-700"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
            <path
              fill="currentColor"
              d="M12 11.645v2.91h4.98c-.21 1.14-.84 2.1-1.785 2.745l2.88 2.235c1.68-1.545 2.65-3.825 2.65-6.525 0-.63-.06-1.23-.165-1.815H12z"
            />
            <path
              fill="currentColor"
              d="M5.265 14.295l-.645.495-2.28 1.77C3.87 18.645 7.71 21 12 21c2.97 0 5.46-.975 7.275-2.655l-2.88-2.235c-.975.66-2.22 1.05-4.395 1.05-3.39 0-6.27-2.295-7.305-5.4l-.43.535z"
            />
            <path
              fill="currentColor"
              d="M2.34 6.435C1.485 8.07 3 9.93 4.5 9.93c1.335 0 2.31-.9 2.625-2.1l-2.22-1.71C4.245 6.57 3.255 6.84 2.34 6.435z"
            />
            <path
              fill="currentColor"
              d="M12 4.5c1.695 0 3.21.585 4.41 1.725l2.625-2.625C17.46 1.755 14.97.75 12 .75 7.71.75 3.87 3.105 2.34 6.435l2.88 2.235C6.255 6.795 8.61 4.5 12 4.5z"
            />
          </svg>
          Continue with Google
        </button>

        <p className="mt-6 text-center text-xs text-neutral-600">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-blue-400 hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
