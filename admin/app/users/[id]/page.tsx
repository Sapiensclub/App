import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AdminShell } from '@/components/AdminShell';
import { requireAdmin } from '@/lib/auth';
import { supabaseService } from '@/lib/supabase/service';

import { banUser, liftUser, suspendUser } from '../actions';

export const dynamic = 'force-dynamic';

export default async function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await requireAdmin();
  const svc = supabaseService();

  const { data: p } = await svc
    .from('profiles')
    .select(
      'id, display_name, member_since, verified, celestial_stage, unique_helps, total_helps, trust_rating_avg, suspended_until, banned_at, moderation_note',
    )
    .eq('id', id)
    .maybeSingle();
  if (!p) notFound();

  const { data: authUser } = await svc.auth.admin.getUserById(id);
  const email = authUser.user?.email ?? '—';

  const banned = !!p.banned_at;
  const suspended = !!p.suspended_until && new Date(p.suspended_until).getTime() > Date.now();
  const restricted = banned || suspended;

  return (
    <AdminShell email={admin.email}>
      <Link href="/reports" className="text-sm text-[#57534B] hover:text-[#141414]">
        ← Back
      </Link>
      <h1 className="mt-2 text-2xl font-bold">{p.display_name ?? 'Member'}</h1>
      <p className="text-sm text-[#57534B]">{email}</p>

      <div className="mt-4 grid gap-2 rounded-xl border border-[#E7DFCF] bg-white p-5 text-sm">
        <Row label="Member since" value={new Date(p.member_since).toLocaleDateString()} />
        <Row label="Verified" value={p.verified ? 'Yes' : 'No'} />
        <Row label="Stage" value={p.celestial_stage} />
        <Row label="Unique / total helps" value={`${p.unique_helps} / ${p.total_helps}`} />
        <Row label="Trust" value={p.trust_rating_avg != null ? `${p.trust_rating_avg}★` : 'New'} />
      </div>

      <div
        className={`mt-4 rounded-xl border p-4 text-sm ${
          restricted ? 'border-[#C0392B] bg-[#FBE9E7]' : 'border-[#E7DFCF] bg-white'
        }`}
      >
        <div className="font-semibold">
          {banned
            ? 'Banned'
            : suspended
              ? `Suspended until ${new Date(p.suspended_until as string).toLocaleString()}`
              : 'Active — no restrictions'}
        </div>
        {p.moderation_note ? <div className="mt-1 text-[#57534B]">Note: {p.moderation_note}</div> : null}
      </div>

      <section className="mt-8 grid gap-6 sm:grid-cols-2">
        <form action={suspendUser} className="space-y-3 rounded-xl border border-[#E7DFCF] bg-white p-4">
          <h2 className="font-bold">Suspend (temporary)</h2>
          <input type="hidden" name="userId" value={p.id} />
          <label className="block text-sm">
            Days
            <input
              name="days"
              type="number"
              min={1}
              defaultValue={7}
              className="mt-1 block w-full rounded-lg border border-[#E3DACB] px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Reason
            <input name="note" className="mt-1 block w-full rounded-lg border border-[#E3DACB] px-3 py-2" />
          </label>
          <button className="rounded-lg bg-[#B4711A] px-4 py-2 font-semibold text-white">Suspend</button>
        </form>

        <form action={banUser} className="space-y-3 rounded-xl border border-[#E7DFCF] bg-white p-4">
          <h2 className="font-bold">Ban (permanent)</h2>
          <input type="hidden" name="userId" value={p.id} />
          <label className="block text-sm">
            Reason
            <input name="note" className="mt-1 block w-full rounded-lg border border-[#E3DACB] px-3 py-2" />
          </label>
          <button className="rounded-lg bg-[#C0392B] px-4 py-2 font-semibold text-white">Ban</button>
          <p className="text-xs text-[#8A857C]">Blocks raising or offering help, enforced server-side.</p>
        </form>
      </section>

      {restricted ? (
        <form action={liftUser} className="mt-4">
          <input type="hidden" name="userId" value={p.id} />
          <button className="rounded-lg border border-[#2E7D5B] px-4 py-2 font-semibold text-[#2E7D5B] hover:bg-[#E3F1EA]">
            Lift restriction
          </button>
        </form>
      ) : null}
    </AdminShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <div className="w-40 shrink-0 text-xs uppercase tracking-wide text-[#8A857C]">{label}</div>
      <div>{value}</div>
    </div>
  );
}
