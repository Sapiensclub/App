import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AdminShell } from '@/components/AdminShell';
import { requireAdmin } from '@/lib/auth';
import { supabaseService } from '@/lib/supabase/service';

import { resolveReport } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ReportDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await requireAdmin();
  const svc = supabaseService();

  const { data: report } = await svc.from('reports').select('*').eq('id', id).maybeSingle();
  if (!report) notFound();

  const { data: profs } = await svc
    .from('profiles')
    .select('id, display_name')
    .in('id', [report.reporter_id, report.reported_id]);
  const nameOf = new Map((profs ?? []).map((p) => [p.id, p.display_name as string | null]));

  // Flagged chat evidence (PRD 6.2): active-request chats are server-readable.
  let messages: {
    id: string;
    sender_id: string;
    body: string | null;
    type: string;
    media_url: string | null;
    created_at: string;
  }[] = [];
  const senderName = new Map<string, string | null>(nameOf);
  const signedMedia = new Map<string, string>();
  if (report.context === 'chat' && report.evidence_chat_id) {
    const { data: msgs } = await svc
      .from('messages')
      .select('id, sender_id, body, type, media_url, created_at')
      .eq('chat_id', report.evidence_chat_id)
      .order('created_at');
    messages = msgs ?? [];
    const senderIds = Array.from(new Set(messages.map((m) => m.sender_id)));
    const missing = senderIds.filter((sid) => !senderName.has(sid));
    if (missing.length) {
      const { data: more } = await svc.from('profiles').select('id, display_name').in('id', missing);
      for (const p of more ?? []) senderName.set(p.id, p.display_name as string | null);
    }
    // Photo evidence lives in the private chat-media bucket; the service role
    // signs short-lived URLs so reviewers can see it (an hour is plenty).
    const paths = messages.filter((m) => m.type === 'photo' && m.media_url).map((m) => m.media_url!);
    if (paths.length) {
      const { data: urls } = await svc.storage.from('chat-media').createSignedUrls(paths, 3600);
      for (const u of urls ?? []) {
        if (u.path && u.signedUrl) signedMedia.set(u.path, u.signedUrl);
      }
    }
  }

  const resolved = report.status === 'actioned' || report.status === 'dismissed';

  return (
    <AdminShell email={admin.email}>
      <Link href="/reports" className="text-sm text-[#57534B] hover:text-[#141414]">
        ← Reports
      </Link>

      <h1 className="mt-2 text-2xl font-bold">Report</h1>
      <div className="mt-4 grid gap-4 rounded-xl border border-[#E7DFCF] bg-white p-5 text-sm">
        <Row label="Reporter" value={nameOf.get(report.reporter_id) ?? report.reporter_id} />
        <Row label="Reported" value={nameOf.get(report.reported_id) ?? report.reported_id} />
        <Row label="Context" value={report.context} />
        <Row label="Status" value={report.status} />
        <Row label="Filed" value={new Date(report.created_at).toLocaleString()} />
        <div>
          <div className="text-xs uppercase tracking-wide text-[#8A857C]">Reason</div>
          <div className="mt-1 whitespace-pre-wrap">{report.reason}</div>
        </div>
        {report.resolution ? (
          <div>
            <div className="text-xs uppercase tracking-wide text-[#8A857C]">Resolution</div>
            <div className="mt-1 whitespace-pre-wrap">{report.resolution}</div>
          </div>
        ) : null}
        <Link
          href={`/users/${report.reported_id}`}
          className="mt-1 font-semibold text-[#C0392B] underline"
        >
          Review reported member →
        </Link>
      </div>

      {report.context === 'chat' ? (
        <section className="mt-8">
          <h2 className="text-lg font-bold">Flagged conversation</h2>
          {messages.length === 0 ? (
            <p className="mt-2 text-sm text-[#57534B]">No messages found for this chat.</p>
          ) : (
            <div className="mt-3 space-y-2 rounded-xl border border-[#E7DFCF] bg-white p-4">
              {messages.map((m) => (
                <div key={m.id} className="text-sm">
                  <span className="font-semibold">{senderName.get(m.sender_id) ?? 'Member'}: </span>
                  <span>{m.type === 'text' ? m.body : m.type === 'photo' ? '' : `[${m.type}]`}</span>
                  <span className="ml-2 text-xs text-[#8A857C]">
                    {new Date(m.created_at).toLocaleTimeString()}
                  </span>
                  {m.type === 'photo' ? (
                    m.media_url && signedMedia.get(m.media_url) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={signedMedia.get(m.media_url)}
                        alt="Photo sent in the flagged chat"
                        className="mt-1 max-h-64 rounded-lg border border-[#E7DFCF]"
                      />
                    ) : (
                      <span className="italic text-[#8A857C]">[photo unavailable]</span>
                    )
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-lg font-bold">Resolve</h2>
        {resolved ? (
          <p className="mt-2 text-sm text-[#57534B]">
            This report is <span className="font-semibold">{report.status}</span>. You can still
            update it below.
          </p>
        ) : null}
        <form action={resolveReport} className="mt-3 space-y-3 rounded-xl border border-[#E7DFCF] bg-white p-4">
          <input type="hidden" name="reportId" value={report.id} />
          <label className="block text-sm font-medium">
            Outcome
            <select
              name="status"
              defaultValue="actioned"
              className="mt-1 block w-full rounded-lg border border-[#E3DACB] px-3 py-2"
            >
              <option value="reviewing">Reviewing</option>
              <option value="actioned">Actioned</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </label>
          <label className="block text-sm font-medium">
            Note (what you did and why)
            <textarea
              name="resolution"
              rows={3}
              defaultValue={report.resolution ?? ''}
              className="mt-1 block w-full rounded-lg border border-[#E3DACB] px-3 py-2"
            />
          </label>
          <button className="rounded-lg bg-[#F59E2D] px-4 py-2 font-semibold text-[#141414]">
            Save resolution
          </button>
        </form>
        <p className="mt-3 text-xs text-[#8A857C]">
          Suspending or banning the reported member arrives in the next chunk.
        </p>
      </section>
    </AdminShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <div className="w-24 shrink-0 text-xs uppercase tracking-wide text-[#8A857C]">{label}</div>
      <div>{value}</div>
    </div>
  );
}
