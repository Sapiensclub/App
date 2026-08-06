import { AdminShell } from '@/components/AdminShell';
import { requireAdmin } from '@/lib/auth';
import { supabaseService } from '@/lib/supabase/service';

import { approveSuggestion, rejectSuggestion } from './actions';

export const dynamic = 'force-dynamic';

export default async function SuggestionsPage() {
  const admin = await requireAdmin();
  const svc = supabaseService();

  const [{ data: suggestions }, { data: cats }] = await Promise.all([
    svc
      .from('category_suggestions')
      .select('id, text, user_id, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    svc.from('categories').select('id, label').eq('enabled', true).order('label'),
  ]);

  const categories = cats ?? [];

  return (
    <AdminShell email={admin.email}>
      <h1 className="text-2xl font-bold">Category suggestions</h1>
      <p className="mt-1 text-sm text-[#57534B]">
        Approving adds a live category members can request. Rejecting closes it quietly.
      </p>

      {!suggestions || suggestions.length === 0 ? (
        <p className="mt-8 rounded-xl border border-[#E7DFCF] bg-white p-6 text-[#57534B]">
          No pending suggestions.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {suggestions.map((s) => (
            <li key={s.id} className="rounded-xl border border-[#E7DFCF] bg-white p-4">
              <div className="text-xs text-[#8A857C]">
                Suggested {new Date(s.created_at).toLocaleDateString()}
              </div>
              <div className="mt-1 text-lg font-semibold">“{s.text}”</div>

              <form action={approveSuggestion} className="mt-3 grid gap-3 sm:grid-cols-4 sm:items-end">
                <input type="hidden" name="id" value={s.id} />
                <label className="text-sm sm:col-span-2">
                  Category name
                  <input
                    name="label"
                    defaultValue={s.text}
                    className="mt-1 block w-full rounded-lg border border-[#E3DACB] px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  Parent
                  <select
                    name="parent"
                    defaultValue=""
                    className="mt-1 block w-full rounded-lg border border-[#E3DACB] px-3 py-2"
                  >
                    <option value="">— none (top level) —</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Icon (optional)
                  <input
                    name="icon"
                    placeholder="e.g. paw-outline"
                    className="mt-1 block w-full rounded-lg border border-[#E3DACB] px-3 py-2"
                  />
                </label>
                <div className="flex gap-2 sm:col-span-4">
                  <button className="rounded-lg bg-[#2E7D5B] px-4 py-2 font-semibold text-white">
                    Approve
                  </button>
                </div>
              </form>

              <form action={rejectSuggestion} className="mt-2">
                <input type="hidden" name="id" value={s.id} />
                <button className="text-sm font-medium text-[#C0392B] hover:underline">Reject</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
