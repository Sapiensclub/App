// Test the connect_offer flow end-to-end as two real users (dev tool).
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
const admin = parseEnv('../admin/.env.local');
const app = parseEnv('.env.local');
const URL = admin.NEXT_PUBLIC_SUPABASE_URL;
const svc = createClient(URL, admin.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const PW = 'seed-Passw0rd!';
const created = [];

async function mkUser(tag) {
  const { data } = await svc.auth.admin.createUser({ email: `seed-${tag}-${Date.now()}@sapiens.test`, password: PW, email_confirm: true });
  created.push(data.user.id);
  return data.user;
}
async function userClient(email) {
  const c = createClient(URL, app.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw error;
  return c;
}

async function main() {
  const { data: cat } = await svc.from('categories').select('id').eq('slug', 'food').single();
  const A = await mkUser('conna');
  const B = await mkUser('connb');
  // completed match A(helper) ↔ B(seeker)
  const { data: req } = await svc.from('requests').insert({ seeker_id: B.id, category_id: cat.id, timing: 'now', urgency: 'everyday' }).select('id').single();
  const { data: match } = await svc.from('matches').insert({ request_id: req.id, helper_id: A.id, seeker_id: B.id, status: 'confirmed', confirmed_at: new Date().toISOString() }).select('id').single();
  await svc.from('matches').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', match.id);

  const ca = await userClient(A.email);
  const cb = await userClient(B.email);

  console.log('A taps Connect:');
  const r1 = await ca.rpc('connect_offer', { p_match: match.id });
  console.log('  result:', r1.data, '| error:', r1.error?.message ?? 'none');

  console.log('B taps Connect:');
  const r2 = await cb.rpc('connect_offer', { p_match: match.id });
  console.log('  result:', r2.data, '| error:', r2.error?.message ?? 'none');

  const { data: conn } = await svc.from('connections').select('status, a_accepted, b_accepted').eq('formed_from_request', req.id).maybeSingle();
  console.log('\nconnection row:', conn, '(expect status active, both accepted)');
}

async function cleanup() {
  try { await svc.rpc('admin_reset_help_data'); } catch {}
  for (const id of created) { try { await svc.auth.admin.deleteUser(id); } catch {} }
  console.log('\ncleaned up.');
}

main().catch((e) => console.error('ERR', e.message ?? e)).finally(cleanup);
