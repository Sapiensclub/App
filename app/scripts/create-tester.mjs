// DEV tool: create a pre-confirmed tester account (admin API, service key).
// The owner's chosen closed-test flow: accounts are created centrally and
// credentials handed to testers — no signup emails involved, full control.
// (Auto-confirmed regardless of the "Confirm email" auth setting.)
//
// Run from app/:  node scripts/create-tester.mjs tester@example.com TheirPass123
// NEVER deploy this script; it uses the service key (like all scripts/ here).
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

const [email, password] = process.argv.slice(2);
if (!email || !password || password.length < 6) {
  console.error('Usage: node scripts/create-tester.mjs <email> <password (6+ chars)>');
  process.exit(1);
}

async function main() {
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // pre-confirmed: works even with "Confirm email" ON
  });
  if (error) {
    console.error(`Could not create ${email}: ${error.message}`);
    process.exit(1);
  }
  console.log(`Tester created and confirmed: ${data.user.email}`);
  console.log('They can sign in immediately (profile + helper prefs auto-created).');
  console.log('Remind them: verify in-app, pick Ways-I-help, allow notifications.');
}
main().catch((e) => {
  console.error('ERR', e.message ?? e);
  process.exit(1);
});
