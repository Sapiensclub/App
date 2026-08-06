import Link from 'next/link';
import type { ReactNode } from 'react';

import { signOut } from '@/app/login/actions';

// The dashboard chrome: header, nav, sign-out. Rendered by every gated page.
export function AdminShell({ email, children }: { email: string | null; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F7F4EC] text-[#141414]">
      <header className="border-b border-[#E7DFCF] bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-3">
          <Link href="/" className="text-lg font-bold">
            Sapiens Admin
          </Link>
          <nav className="flex gap-4 text-sm font-medium text-[#57534B]">
            <Link href="/reports" className="hover:text-[#141414]">
              Reports
            </Link>
            <Link href="/users" className="hover:text-[#141414]">
              Members
            </Link>
            <Link href="/suggestions" className="hover:text-[#141414]">
              Suggestions
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-[#57534B]">
            <span>{email}</span>
            <form action={signOut}>
              <button className="rounded-md border border-[#E7DFCF] px-3 py-1 hover:bg-[#F7F4EC]">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
