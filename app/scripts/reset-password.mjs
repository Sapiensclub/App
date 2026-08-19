// DEV tool: set a member's password directly via the admin API (service key).
// Why it exists: Supabase's built-in mailer no longer allows customizing email
// templates, so the in-app "Forgot password" 6-digit-code flow stays dormant
// until custom SMTP is configured (see docs/PRELAUNCH_CHECKLIST.md). Until
// then, unblock a locked-out tester with this.
//
// Run from app/:  node scripts/reset-password.mjs tester@example.com NewPass123
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

const [email, newPassword] = process.argv.slice(2);
if (!email || !newPassword || newPassword.length < 6) {
  console.error('Usage: node scripts/reset-password.mjs <email> <new-password (6+ chars)>');
  process.exit(1);
}

async function main() {
  const { data: list, error: listError } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;
  const user = list.users.find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase());
  if (!user) {
    console.error(`No account found for ${email}. (Have they signed up?)`);
    process.exit(1);
  }
  const { error } = await sb.auth.admin.updateUserById(user.id, { password: newPassword });
  if (error) throw error;
  console.log(`Password updated for ${email}. They can sign in with it right away.`);
}
main().catch((e) => {
  console.error('ERR', e.message ?? e);
  process.exit(1);
});
