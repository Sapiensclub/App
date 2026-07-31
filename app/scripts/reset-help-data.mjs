// ============================================================================
// Sapiens — reset help data (dev tool)
// ============================================================================
// Wipes all transactional "help" rows and resets reputation counters (via the
// admin_reset_help_data function, which TRUNCATEs past the append-only ledger),
// while KEEPING profiles, helper_preferences (Ways I help), and trusted_contacts.
// Also removes leftover @sapiens.test seed accounts.
//
// Requires the 20260731150000_dev_reset_function migration.
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

async function main() {
  console.log('=== Resetting help data (profiles kept) ===\n');

  const { error } = await sb.rpc('admin_reset_help_data');
  if (error) {
    console.log('FAILED:', error.message);
    console.log('(Did you push the 20260731150000_dev_reset_function migration?)');
    return;
  }
  console.log('Cleared all requests, matches, chats, ledger, ratings, connections,');
  console.log('blocks, etc. Reset reputation counters + helper locations.');

  // Remove leftover seed/harness test accounts (email @sapiens.test).
  const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
  let removed = 0;
  for (const u of list?.users ?? []) {
    if (u.email?.endsWith('@sapiens.test')) {
      try {
        await sb.auth.admin.deleteUser(u.id);
        removed++;
      } catch {}
    }
  }
  console.log(`Removed ${removed} leftover @sapiens.test test accounts.`);
  console.log('\n=== done — real profiles, Ways I help, and trusted contacts kept ===');
}

main().catch((e) => console.error('RESET ERROR:', e.message ?? e));
