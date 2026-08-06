import Link from 'next/link';

import { AdminShell } from '@/components/AdminShell';
import { requireAdmin } from '@/lib/auth';
import { supabaseService } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const admin = await requireAdmin();
  const svc = supabaseService();

  const [openReports, pendingSuggestions, members] = await Promise.all([
    svc.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    svc.from('category_suggestions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    svc.from('profiles').select('id', { count: 'exact', head: true }),
  ]);

  return (
    <AdminShell email={admin.email}>
      <h1 className="text-2xl font-bold">Overview</h1>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Open reports" value={openReports.count ?? 0} href="/reports" />
        <Stat label="Pending suggestions" value={pendingSuggestions.count ?? 0} href="/suggestions" />
        <Stat label="Members" value={members.count ?? 0} href="/users" />
      </div>

      <p className="mt-8 text-sm text-[#57534B]">
        Start with the{' '}
        <Link href="/reports" className="font-semibold text-[#C0392B] underline">
          reports queue
        </Link>
        .
      </p>
    </AdminShell>
  );
}

function Stat({ label, value, href }: { label: string; value: number; href?: string }) {
  const inner = (
    <div className="rounded-xl border border-[#E7DFCF] bg-white p-5">
      <div className="text-3xl font-bold">{value}</div>
      <div className="mt-1 text-sm text-[#57534B]">{label}</div>
    </div>
  );
  return href ? (
    <Link href={href} className="block transition hover:border-[#F59E2D]">
      {inner}
    </Link>
  ) : (
    inner
  );
}
