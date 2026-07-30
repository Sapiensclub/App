// ============================================================================
// Sapiens — reset help data (dev tool)
// ============================================================================
// Deletes all transactional "help" rows (requests, matches, chats, messages,
// dispatch, responses, ratings, moneta, reports, blocks, connections, moments,
// sos, notifications) while KEEPING profiles, helper_preferences (Ways I help
// + location), trusted_contacts, categories, and config.
//
// Run from app/:  node scripts/reset-help-data.mjs
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

const ZERO = '00000000-0000-0000-0000-000000000000';

// (table, id-column) — order respects the non-cascading foreign keys
// (reports -> chats, moneta_ledger -> matches must go first).
const STEPS = [
  ['reports', 'id'],
  ['moneta_ledger', 'id'],
  ['ratings', 'id'],
  ['messages', 'id'],
  ['matches', 'id'],
  ['dispatch_targets', 'id'],
  ['request_responses', 'id'],
  ['chats', 'id'],
  ['requests', 'id'],
  ['blocks', 'blocker_id'],
  ['connections', 'id'],
  ['appreciations', 'moment_id'],
  ['moments', 'id'],
  ['sos_events', 'id'],
  ['notifications', 'id'],
];

async function main() {
  console.log('=== Resetting help data (profiles kept) ===\n');
  for (const [table, col] of STEPS) {
    const { count } = await sb.from(table).select('*', { count: 'exact', head: true });
    const { error } = await sb.from(table).delete().neq(col, ZERO);
    if (error) console.log(`  FAIL  ${table.padEnd(20)} ${error.message}`);
    else console.log(`  cleared ${table.padEnd(20)} (${count ?? 0} rows)`);
  }
  // Clear each helper's last location so nobody is "findable" from stale data.
  await sb
    .from('helper_preferences')
    .update({ last_location: null, location_updated_at: null })
    .neq('user_id', ZERO);
  console.log('\nCleared stale helper locations too.');
  console.log('\n=== done — profiles, Ways I help, and trusted contacts kept ===');
}

main().catch((e) => console.error('RESET ERROR:', e.message ?? e));
