// ============================================================================
// Sapiens — Moneta engine harness (dev tool). Proves the unique-help rule.
// ============================================================================
// Creates a helper + two seekers, completes helps, and prints the helper's
// counters after each — showing that a REPEAT help earns no Moneta and no new
// unique help, but still counts toward the steadfast total. Cleans up after.
//
// Run from app/:  node scripts/moneta-harness.mjs   (after the migration)
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

function parseEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const env = parseEnv('../admin/.env.local');
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const created = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newUser(tag) {
  const { data, error } = await sb.auth.admin.createUser({
    email: `seed-${tag}-${Date.now()}@sapiens.test`,
    password: 'seed-Passw0rd!',
    email_confirm: true,
  });
  if (error) throw error;
  created.push(data.user.id);
  return data.user.id;
}

// Create a request + a match, then complete it (fires the award trigger).
async function completeHelp(seeker, helper, catId) {
  const { data: req, error: e1 } = await sb
    .from('requests')
    .insert({ seeker_id: seeker, category_id: catId, timing: 'now', urgency: 'everyday' })
    .select('id')
    .single();
  if (e1) throw e1;
  const { data: match, error: e2 } = await sb
    .from('matches')
    .insert({ request_id: req.id, helper_id: helper, seeker_id: seeker, status: 'confirmed', confirmed_at: new Date().toISOString() })
    .select('id')
    .single();
  if (e2) throw e2;
  // The trigger fires on the transition into 'completed'.
  const { error: e3 } = await sb.from('matches').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', match.id);
  if (e3) throw e3;
}

async function counters(id) {
  const { data } = await sb
    .from('profiles')
    .select('unique_helps, total_helps, moneta_lifetime, moneta_balance, celestial_stage, goodness_score')
    .eq('id', id)
    .single();
  return data;
}

async function main() {
  console.log('=== Moneta engine harness ===\n');
  const { data: cat } = await sb.from('categories').select('id').eq('slug', 'food').single();

  const helper = await newUser('helper');
  const seekerA = await newUser('seekerA');
  const seekerB = await newUser('seekerB');

  console.log('helper start:', await counters(helper));

  await completeHelp(seekerA, helper, cat.id);
  await sleep(300);
  console.log('\nafter help #1 (new person A):', await counters(helper));
  console.log('  expect unique 1, total 1, moneta 1');

  await completeHelp(seekerA, helper, cat.id);
  await sleep(300);
  console.log('\nafter help #2 (REPEAT person A):', await counters(helper));
  console.log('  expect unique 1 (unchanged), total 2, moneta 1 (unchanged)');

  await completeHelp(seekerB, helper, cat.id);
  await sleep(300);
  console.log('\nafter help #3 (new person B):', await counters(helper));
  console.log('  expect unique 2, total 3, moneta 2');

  const { count: ledgerRows } = await sb
    .from('moneta_ledger')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', helper)
    .eq('type', 'earned');
  console.log(`\nledger earned rows for helper: ${ledgerRows} (expect 2 — one per unique pair)`);

  console.log('\nseekerA (was helped, never helped):', await counters(seekerA));
  console.log('  expect all zeros — receiving help is not a reward event');

  console.log('\n=== harness done ===');
}

async function cleanup() {
  for (const id of created) {
    try { await sb.from('moneta_ledger').delete().eq('user_id', id); } catch {}
  }
  for (const id of created) {
    try { await sb.auth.admin.deleteUser(id); } catch {}
  }
  console.log(`\nCleaned up ${created.length} test users.`);
}

main().catch((e) => console.error('HARNESS ERROR:', e.message ?? e)).finally(cleanup);
