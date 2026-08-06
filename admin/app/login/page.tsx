'use client';

import { useActionState } from 'react';

import { signIn, type LoginState } from './actions';

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, null);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F7F4EC] p-6">
      <form
        action={action}
        className="w-full max-w-sm rounded-2xl border border-[#E7DFCF] bg-white p-8 shadow-sm"
      >
        <h1 className="text-2xl font-bold text-[#141414]">Sapiens Admin</h1>
        <p className="mt-1 text-sm text-[#57534B]">Trust &amp; Safety sign in</p>

        <label className="mt-6 block text-sm font-medium text-[#141414]">
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className="mt-1 w-full rounded-lg border border-[#E3DACB] px-3 py-2 text-[#141414] outline-none focus:border-[#F59E2D]"
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-[#141414]">
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="mt-1 w-full rounded-lg border border-[#E3DACB] px-3 py-2 text-[#141414] outline-none focus:border-[#F59E2D]"
          />
        </label>

        {state?.error ? (
          <p className="mt-4 rounded-lg bg-[#FBE9E7] px-3 py-2 text-sm text-[#C0392B]">{state.error}</p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="mt-6 w-full rounded-lg bg-[#F59E2D] py-2.5 font-semibold text-[#141414] disabled:opacity-60"
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
