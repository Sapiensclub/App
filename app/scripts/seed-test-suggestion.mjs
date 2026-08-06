// Seed a pending category suggestion so the admin dashboard has one to review.
// Run from app/:  node scripts/seed-test-suggestion.mjs
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
  const user = list.users.find((u) => u.email === 'pragamankumar@gmail.com') ?? list.users[0];
  if (!user) return console.error('No users found.');

  const { data, error } = await sb
    .from('category_suggestions')
    .insert({ user_id: user.id, text: 'Walking someone home safely at night', status: 'pending' })
    .select('id')
    .single();
  if (error) throw error;
  console.log(`Seeded pending suggestion ${data.id}. Open the dashboard → Suggestions.`);
}
main().catch((e) => console.error('ERR', e.message ?? e));
