import Link from 'next/link';

import { AdminShell } from '@/components/AdminShell';
import { requireAdmin } from '@/lib/auth';
import { supabaseService } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

const STATUS_STYLE: Record<string, string> = {
  open: 'bg-[#FBE9E7] text-[#C0392B]',
  reviewing: 'bg-[#FDECD3] text-[#B4711A]',
  actioned: 'bg-[#E3F1EA] text-[#2E7D5B]',
  dismissed: 'bg-[#EFECE4] text-[#57534B]',
};

export default async function ReportsPage() {
  const admin = await requireAdmin();
  const svc = supabaseService();

  const { data: reports } = await svc
    .from('reports')
    .select('id, reporter_id, reported_id, context, reason, status, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  const ids = Array.from(
    new Set((reports ?? []).flatMap((r) => [r.reporter_id, r.reported_id])),
  );
  const { data: profs } = await svc.from('profiles').select('id, display_name').in('id', ids);
  const nameOf = new Map((profs ?? []).map((p) => [p.id, p.display_name as string | null]));

  return (
    <AdminShell email={admin.email}>
      <h1 className="text-2xl font-bold">Reports</h1>
      <p className="mt-1 text-sm text-[#57534B]">Most recent first.</p>

      {!reports || reports.length === 0 ? (
        <p className="mt-8 rounded-xl border border-[#E7DFCF] bg-white p-6 text-[#57534B]">
          No reports. A calm community is a good sign.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {reports.map((r) => (
            <li key={r.id}>
              <Link
                href={`/reports/${r.id}`}
                className="block rounded-xl border border-[#E7DFCF] bg-white p-4 transition hover:border-[#F59E2D]"
              >
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status] ?? ''}`}>
                    {r.status}
                  </span>
                  <span className="text-xs uppercase tracking-wide text-[#8A857C]">{r.context}</span>
                  <span className="ml-auto text-xs text-[#8A857C]">
                    {new Date(r.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="mt-2 text-sm">
                  <span className="font-semibold">{nameOf.get(r.reporter_id) ?? 'Someone'}</span>
                  <span className="text-[#57534B]"> reported </span>
                  <span className="font-semibold">{nameOf.get(r.reported_id) ?? 'a member'}</span>
                </div>
                <div className="mt-1 line-clamp-2 text-sm text-[#57534B]">{r.reason}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
