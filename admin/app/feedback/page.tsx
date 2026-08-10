import { AdminShell } from '@/components/AdminShell';
import { requireAdmin } from '@/lib/auth';
import { supabaseService } from '@/lib/supabase/service';

import { setFeedbackStatus } from './actions';

export const dynamic = 'force-dynamic';

export default async function FeedbackPage() {
  const admin = await requireAdmin();
  const svc = supabaseService();

  // Open items first (new → seen), recently-done at the bottom for context.
  const { data: rows } = await svc
    .from('feedback')
    .select('id, user_id, text, context, status, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  const items = rows ?? [];

  const userIds = Array.from(new Set(items.map((f) => f.user_id)));
  const nameOf = new Map<string, string | null>();
  if (userIds.length) {
    const { data: profs } = await svc.from('profiles').select('id, display_name').in('id', userIds);
    for (const p of profs ?? []) nameOf.set(p.id, p.display_name as string | null);
  }

  const open = items.filter((f) => f.status !== 'done');
  const done = items.filter((f) => f.status === 'done');

  return (
    <AdminShell email={admin.email}>
      <h1 className="text-2xl font-bold">Feedback</h1>
      <p className="mt-1 text-sm text-[#57534B]">
        Notes members sent from the You tab. Mark seen while triaging; done when handled.
      </p>

      {open.length === 0 ? (
        <p className="mt-8 rounded-xl border border-[#E7DFCF] bg-white p-6 text-[#57534B]">
          Nothing waiting. 🎉
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {open.map((f) => (
            <FeedbackCard key={f.id} f={f} name={nameOf.get(f.user_id) ?? 'Member'} />
          ))}
        </ul>
      )}

      {done.length > 0 ? (
        <>
          <h2 className="mt-10 text-lg font-bold text-[#57534B]">Done</h2>
          <ul className="mt-3 space-y-2 opacity-70">
            {done.slice(0, 20).map((f) => (
              <li key={f.id} className="rounded-xl border border-[#E7DFCF] bg-white p-3 text-sm">
                <span className="font-semibold">{nameOf.get(f.user_id) ?? 'Member'}: </span>
                {f.text}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </AdminShell>
  );
}

function FeedbackCard({
  f,
  name,
}: {
  f: {
    id: string;
    text: string;
    context: { platform?: string; version?: string | null } | null;
    status: string;
    created_at: string;
  };
  name: string;
}) {
  const ctx = f.context ?? {};
  return (
    <li className="rounded-xl border border-[#E7DFCF] bg-white p-4">
      <div className="flex items-center gap-2 text-xs text-[#8A857C]">
        <span>{new Date(f.created_at).toLocaleString()}</span>
        <span>· {ctx.platform ?? '?'}</span>
        {ctx.version ? <span>· v{ctx.version}</span> : null}
        <span
          className={
            f.status === 'new'
              ? 'ml-auto rounded-full bg-[#F59E2D] px-2 py-0.5 font-semibold text-[#141414]'
              : 'ml-auto rounded-full bg-[#E7DFCF] px-2 py-0.5 font-semibold text-[#57534B]'
          }
        >
          {f.status}
        </span>
      </div>
      <div className="mt-2">
        <span className="font-semibold">{name}: </span>
        <span className="whitespace-pre-wrap">{f.text}</span>
      </div>
      <div className="mt-3 flex gap-2">
        {f.status === 'new' ? (
          <form action={setFeedbackStatus}>
            <input type="hidden" name="id" value={f.id} />
            <input type="hidden" name="status" value="seen" />
            <button className="rounded-lg border border-[#E7DFCF] px-3 py-1.5 text-sm font-medium hover:bg-[#F7F4EC]">
              Mark seen
            </button>
          </form>
        ) : null}
        <form action={setFeedbackStatus}>
          <input type="hidden" name="id" value={f.id} />
          <input type="hidden" name="status" value="done" />
          <button className="rounded-lg bg-[#2E7D5B] px-3 py-1.5 text-sm font-semibold text-white">
            Done
          </button>
        </form>
      </div>
    </li>
  );
}
