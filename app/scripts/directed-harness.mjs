// ============================================================================
// Sapiens — directed requests + connections wave harness (dev tool)
// ============================================================================
// Proves Phase 4 Chunk 3:
//   1. A DIRECTED request pings ONLY the named connection (even with a nearer
//      stranger available).
//   2. After the fallback window + a tick, it OPENS UP to everyone (opened_at
//      set; strangers get pinged).
//   3. A NORMAL request pings CONNECTIONS FIRST (wave 1 = the connection only),
//      strangers only on the next wave.
//
// Run from app/:  node scripts/directed-harness.mjs
// Reads Supabase URL + service key from ../admin/.env.local (never printed).
// Seeds temp @sapiens.test users and cleans up after itself.
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

const CENTER = { lat: 18.5204, lng: 73.8567 }; // Pune
const PW = 'seed-Passw0rd!';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function offset(center, distM, bearingDeg) {
  const R = 6371000;
  const br = (bearingDeg * Math.PI) / 180;
  const lat1 = (center.lat * Math.PI) / 180;
  const lng1 = (center.lng * Math.PI) / 180;
  const dr = distM / R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dr) + Math.cos(lat1) * Math.sin(dr) * Math.cos(br));
  const lng2 = lng1 + Math.atan2(Math.sin(br) * Math.sin(dr) * Math.cos(lat1), Math.cos(dr) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}

const created = [];
const idToKey = new Map();
let savedInterval, savedFallback;

async function createUser(email) {
  const { data, error } = await sb.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw error;
  created.push(data.user.id);
  return data.user.id;
}
async function getConfig(key) {
  const { data } = await sb.from('dispatch_config').select('value').eq('key', key).single();
  return data.value;
}
async function setConfig(key, value) {
  await sb.from('dispatch_config').update({ value }).eq('key', key);
}
async function raiseRequest({ seeker, catId, directedTo }) {
  const { data, error } = await sb
    .from('requests')
    .insert({
      seeker_id: seeker,
      category_id: catId,
      description: 'directed harness',
      timing: 'now',
      urgency: 'everyday',
      meetpoint_lat: CENTER.lat,
      meetpoint_lng: CENTER.lng,
      approx_area: 'Test Area',
      is_directed: !!directedTo,
      directed_to: directedTo ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}
async function pingsFor(reqId) {
  const { data } = await sb
    .from('dispatch_targets')
    .select('helper_id, wave_number, pinged_at')
    .eq('request_id', reqId)
    .order('wave_number')
    .order('pinged_at');
  return data ?? [];
}
async function openedAt(reqId) {
  const { data } = await sb.from('requests').select('opened_at').eq('id', reqId).single();
  return data.opened_at;
}
function printPings(title, rows) {
  console.log(`\n${title}`);
  if (!rows.length) return console.log('   (none)');
  for (const row of rows) console.log(`   wave ${row.wave_number}  →  ${idToKey.get(row.helper_id) ?? row.helper_id}`);
}

async function main() {
  console.log('=== Sapiens directed + connections-wave harness ===');

  const { data: cats } = await sb.from('categories').select('id, slug').eq('slug', 'food');
  const foodId = cats[0].id;

  savedInterval = await getConfig('wave_interval_minutes');
  savedFallback = await getConfig('directed_fallback_minutes');

  // Seeker + three helpers: one CONNECTION (900 m), one nearer STRANGER (200 m),
  // one far STRANGER (3 km). All verified + opted into food.
  const seeker = await createUser(`seed-seeker-${Date.now()}@sapiens.test`);
  idToKey.set(seeker, 'SEEKER');

  const mk = async (key, dist, bearing) => {
    const id = await createUser(`seed-${key}-${Date.now()}@sapiens.test`);
    idToKey.set(id, key);
    await sb.from('profiles').update({ verified: true }).eq('id', id);
    await sb.from('helper_preferences').update({ categories: [foodId], radius_max_m: 8000 }).eq('user_id', id);
    const pt = offset(CENTER, dist, bearing);
    await sb.rpc('admin_set_helper_location', { p_user: id, p_lat: pt.lat, p_lng: pt.lng });
    return id;
  };
  const CONN = await mk('CONNECTION-900m', 900, 0);
  const NEAR = await mk('stranger-NEAR-200m', 200, 90);
  const FAR = await mk('stranger-FAR-3km', 3000, 180);

  // Make CONN an active connection of the seeker.
  const [a, b] = seeker < CONN ? [seeker, CONN] : [CONN, seeker];
  await sb.from('connections').insert({
    user_a: a, user_b: b, status: 'active',
    a_accepted: true, b_accepted: true, offered_at: new Date().toISOString(), active_at: new Date().toISOString(),
  });

  console.log('\nSeeded SEEKER + CONNECTION (900 m) + nearer stranger (200 m) + far stranger (3 km).');

  // ── Test 1 — directed: only the named connection is pinged ────────────────
  const reqD = await raiseRequest({ seeker, catId: foodId, directedTo: CONN });
  await sleep(700);
  printPings('TEST 1 — directed "Ask CONNECTION for help", wave 1:', await pingsFor(reqD));
  console.log('   EXPECT: only CONNECTION-900m — NOT the nearer stranger.');

  // ── Test 2 — fallback: after the window + a tick, it opens to everyone ─────
  await setConfig('directed_fallback_minutes', 0);
  await setConfig('wave_interval_minutes', { casual: 0, everyday: 0, urgent: 0, sos: 0 });
  await sb.rpc('dispatch_tick');
  await sleep(500);
  printPings('TEST 2 — after fallback tick:', await pingsFor(reqD));
  console.log(`   opened_at is now: ${(await openedAt(reqD)) ? 'SET ✓' : 'null ✗'}`);
  console.log('   EXPECT: strangers NEAR + FAR now pinged (a later wave).');
  await sb.from('requests').update({ status: 'cancelled' }).eq('id', reqD);

  // ── Test 3 — connections wave on a NORMAL request ─────────────────────────
  const reqN = await raiseRequest({ seeker, catId: foodId });
  await sleep(700);
  printPings('TEST 3 — normal request, wave 1 (connections wave):', await pingsFor(reqN));
  console.log('   EXPECT: only CONNECTION-900m — strangers held for the next wave.');

  await sb.rpc('dispatch_tick');
  await sleep(500);
  printPings('TEST 3 — after one tick (strangers now):', await pingsFor(reqN));
  console.log('   EXPECT: NEAR + FAR added as wave 2.');
  await sb.from('requests').update({ status: 'cancelled' }).eq('id', reqN);

  console.log('\n=== harness done ===');
}

async function cleanup() {
  try {
    if (savedInterval) await setConfig('wave_interval_minutes', savedInterval);
    if (savedFallback) await setConfig('directed_fallback_minutes', savedFallback);
  } catch {}
  for (const id of created) {
    try {
      await sb.auth.admin.deleteUser(id);
    } catch {}
  }
  console.log(`\nCleaned up ${created.length} test users (cascades to requests/pings/connections).`);
}

main()
  .catch((e) => console.error('HARNESS ERROR:', e.message ?? e))
  .finally(cleanup);
