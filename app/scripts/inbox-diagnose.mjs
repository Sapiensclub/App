// Read-only diagnostic: why can't inbox messages send? (dev tool)
// Checks the connection, the inbox chat, its participants, and closed_at.
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

  console.log('=== CONNECTIONS ===');
  const { data: conns } = await sb
    .from('connections')
    .select('id, user_a, user_b, status, a_accepted, b_accepted, active_at');
  if (!conns?.length) console.log('  none');
  for (const c of conns ?? []) {
    console.log(
      `  [${c.status}] ${email[c.user_a]} <-> ${email[c.user_b]}  ` +
        `a_acc=${c.a_accepted} b_acc=${c.b_accepted} active_at=${c.active_at ?? 'null'}  id=${c.id}`,
    );
  }

  console.log('\n=== INBOX CHATS ===');
  const { data: chats } = await sb
    .from('chats')
    .select('id, kind, connection_id, request_id, closed_at')
    .eq('kind', 'inbox');
  if (!chats?.length) console.log('  NONE — no inbox chat exists yet');
  for (const ch of chats ?? []) {
    console.log(`  chat ${ch.id}  connection=${ch.connection_id}  closed_at=${ch.closed_at ?? 'null (OPEN)'}`);

    const { data: parts } = await sb
      .from('chat_participants')
      .select('user_id, left_at')
      .eq('chat_id', ch.id);
    console.log(`    participants (${parts?.length ?? 0}):`);
    for (const p of parts ?? [])
      console.log(`      - ${email[p.user_id] ?? p.user_id}  left_at=${p.left_at ?? 'null'}`);

    const { count } = await sb
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('chat_id', ch.id);
    console.log(`    messages: ${count ?? 0}`);
  }

  console.log('\n=== BLOCKS ===');
  const { data: blocks } = await sb.from('blocks').select('blocker_id, blocked_id');
  if (!blocks?.length) console.log('  none');
  for (const b of blocks ?? []) console.log(`  ${email[b.blocker_id]} blocked ${email[b.blocked_id]}`);
}
main().catch((e) => console.error('ERR', e.message ?? e));
