// ============================================================================
// Sapiens — preview the Celestial Journey at any unique-help count (dev tool)
// ============================================================================
// Sets a profile's cached counters so you can SEE the moon/sun + meters at a
// given stage on the You tab. DEV ONLY — this writes counters directly, it does
// not go through the ledger. Reset it back to 0 when done.
//
//   node scripts/preview-journey.mjs <email> <uniqueCount>
//   e.g.  node scripts/preview-journey.mjs test2@example.com 55
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

const [, , email, uniqueArg] = process.argv;
if (!email || uniqueArg === undefined) {
  console.log('Usage: node scripts/preview-journey.mjs <email> <uniqueCount>');
  process.exit(1);
}
const unique = parseInt(uniqueArg, 10);

const env = parseEnv('../admin/.env.local');
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function stageFor(u) {
  if (u >= 1000) return 'golden_sun';
  if (u >= 500) return 'sunrise';
  if (u >= 100) return 'full_moon';
  if (u >= 50) return 'half_moon';
  if (u >= 10) return 'crescent';
  return 'new_moon';
}

async function main() {
  const { data: list, error } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    console.log(`No account found for ${email}`);
    return;
  }
  const goodness = Math.round(100 * (1 - Math.exp(-unique / 280)) * 100) / 100;
  const { error: e2 } = await sb
    .from('profiles')
    .update({
      unique_helps: unique,
      total_helps: Math.max(unique, 0),
      moneta_lifetime: unique,
      moneta_balance: unique,
      celestial_stage: stageFor(unique),
      goodness_score: goodness,
    })
    .eq('id', user.id);
  if (e2) throw e2;
  console.log(`Set ${email} → unique ${unique}, stage ${stageFor(unique)}, goodness ${goodness}.`);
  console.log('Open the You tab (or switch tabs and back) to see it. Run with 0 to reset.');
}

main().catch((e) => console.error('ERROR:', e.message ?? e));
