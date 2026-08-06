import Link from 'next/link';

import { AdminShell } from '@/components/AdminShell';
import { requireAdmin } from '@/lib/auth';
import { supabaseService } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const admin = await requireAdmin();
  const svc = supabaseService();

  const query = (q ?? '').trim();
  let results: { id: string; display_name: string | null; banned_at: string | null; suspended_until: string | null }[] = [];
  if (query) {
    const { data } = await svc
      .from('profiles')
      .select('id, display_name, banned_at, suspended_until')
      .ilike('display_name', `%${query}%`)
      .limit(50);
    results = data ?? [];
  }

  return (
    <AdminShell email={admin.email}>
      <h1 className="text-2xl font-bold">Members</h1>
      <form className="mt-4 flex gap-2">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search by name"
          className="w-full max-w-sm rounded-lg border border-[#E3DACB] px-3 py-2"
        />
        <button className="rounded-lg bg-[#F59E2D] px-4 py-2 font-semibold text-[#141414]">Search</button>
      </form>

      {query && results.length === 0 ? (
        <p className="mt-6 text-sm text-[#57534B]">No members match “{query}”.</p>
      ) : null}

      <ul className="mt-6 space-y-2">
        {results.map((r) => {
          const restricted = !!r.banned_at || (!!r.suspended_until && new Date(r.suspended_until).getTime() > Date.now());
          return (
            <li key={r.id}>
              <Link
                href={`/users/${r.id}`}
                className="flex items-center gap-3 rounded-xl border border-[#E7DFCF] bg-white p-3 hover:border-[#F59E2D]"
              >
                <span className="font-medium">{r.display_name ?? 'Member'}</span>
                {restricted ? (
                  <span className="rounded-full bg-[#FBE9E7] px-2 py-0.5 text-xs font-semibold text-[#C0392B]">
                    restricted
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </AdminShell>
  );
}
