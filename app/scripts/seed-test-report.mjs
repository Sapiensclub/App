// Seed a sample Trust & Safety report so the admin dashboard has something to
// review (dev tool). Does NOT block anyone — it only inserts a reports row.
// Run from app/:  node scripts/seed-test-report.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

function parseEnv(p) {
  const o = {};
  for (const l of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) o[m[1]] = m[2].trim();
  }
  return o;
}
const env = parseEnv('../admin/.env.local');
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const REPORTER = 'pragamankumar@gmail.com';
const REPORTED = 'sapiensclub1@gmail.com';

async function main() {
  const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
  const byEmail = Object.fromEntries(list.users.map((u) => [u.email, u.id]));
  const reporter = byEmail[REPORTER];
  const reported = byEmail[REPORTED];
  if (!reporter || !reported) {
    console.error('Could not find both accounts. Have both logged in at least once?');
    return;
  }

  // Attach the most recent chat between them as evidence, if any exists.
  const { data: chats } = await sb
    .from('chats')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(1);
  const evidence = chats?.[0]?.id ?? null;

  const { data, error } = await sb
    .from('reports')
    .insert({
      reporter_id: reporter,
      reported_id: reported,
      context: evidence ? 'chat' : 'match',
      evidence_chat_id: evidence,
      reason: 'Test report: helper sent inappropriate messages during the help.',
      status: 'open',
    })
    .select('id')
    .single();
  if (error) throw error;
  console.log(`Seeded report ${data.id} (${REPORTER} → ${REPORTED})${evidence ? ' with chat evidence' : ''}.`);
  console.log('Open the admin dashboard → Reports to review it.');
}
main().catch((e) => console.error('ERR', e.message ?? e));
