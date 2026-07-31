// Read-only diagnostic: why aren't requests matching / cancelling? (dev tool)
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

async function main() {
  const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
  const email = Object.fromEntries(list.users.map((u) => [u.id, u.email]));

  console.log('=== BLOCKS (permanently prevent matching) ===');
  const { data: blocks } = await sb.from('blocks').select('blocker_id, blocked_id');
  if (!blocks?.length) console.log('  none');
  for (const b of blocks ?? []) console.log(`  ${email[b.blocker_id]} blocked ${email[b.blocked_id]}`);

  console.log('\n=== MATCHES by status (non-terminal = helper stuck mid-help) ===');
  const { data: matches } = await sb.from('matches').select('status, helper_id, seeker_id');
  const byStatus = {};
  for (const m of matches ?? []) byStatus[m.status] = (byStatus[m.status] || 0) + 1;
  console.log(' ', byStatus);
  for (const m of matches ?? []) {
    if (['confirmed', 'on_the_way', 'arrived'].includes(m.status))
      console.log(`  ACTIVE: helper ${email[m.helper_id]} ↔ seeker ${email[m.seeker_id]} (${m.status})`);
  }

  console.log('\n=== REQUESTS by status ===');
  const { data: reqs } = await sb.from('requests').select('status');
  const rs = {};
  for (const r of reqs ?? []) rs[r.status] = (rs[r.status] || 0) + 1;
  console.log(' ', rs);

  console.log('\n=== HELPERS with a synced location (findable) ===');
  const { data: hp } = await sb.from('helper_preferences').select('user_id, last_location, categories, radius_max_m');
  for (const h of hp ?? []) {
    console.log(`  ${email[h.user_id]}: location ${h.last_location ? 'SET' : 'null'}, categories ${(h.categories || []).length}, radius ${h.radius_max_m}m`);
  }

  console.log('\n=== VERIFIED ===');
  const { data: profs } = await sb.from('profiles').select('id, verified');
  for (const p of profs ?? []) console.log(`  ${email[p.id]}: ${p.verified ? 'verified' : 'NOT verified'}`);
}
main().catch((e) => console.error('ERR', e.message ?? e));
