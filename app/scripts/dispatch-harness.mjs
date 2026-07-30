// ============================================================================
// Sapiens — dispatch engine seeded-data test harness (dev tool)
// ============================================================================
// Creates a seeker + a set of helpers at known distances/attributes around a
// point, raises requests, and prints exactly who the engine pinged in each
// wave — proving eligibility, radius growth, fairness ordering, and
// prefer-women BEFORE any helper UI exists. Cleans up after itself.
//
// Run from the app/ directory:  node scripts/dispatch-harness.mjs
// Reads Supabase URL + service key from ../admin/.env.local (never printed).
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

// Move `distM` metres from center along `bearingDeg`.
function offset(center, distM, bearingDeg) {
  const R = 6371000;
  const br = (bearingDeg * Math.PI) / 180;
  const lat1 = (center.lat * Math.PI) / 180;
  const lng1 = (center.lng * Math.PI) / 180;
  const dr = distM / R;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(dr) + Math.cos(lat1) * Math.sin(dr) * Math.cos(br),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(br) * Math.sin(dr) * Math.cos(lat1),
      Math.cos(dr) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}

const HELPERS = [
  { key: 'H1 near-200m',    dist: 200,  bearing: 0,   verified: true,  cat: 'food',   gender: 'male',   radius: 8000 },
  { key: 'H2 near-500m ♀',  dist: 500,  bearing: 90,  verified: true,  cat: 'food',   gender: 'female', radius: 8000 },
  { key: 'H3 near-900m ♀',  dist: 900,  bearing: 180, verified: true,  cat: 'food',   gender: 'female', radius: 8000 },
  { key: 'H4 mid-3.5km',    dist: 3500, bearing: 270, verified: true,  cat: 'food',   gender: 'male',   radius: 8000 },
  { key: 'H5 far-4km',      dist: 4000, bearing: 45,  verified: true,  cat: 'food',   gender: 'male',   radius: 8000 },
  { key: 'H6 wrong-cat',    dist: 300,  bearing: 120, verified: true,  cat: 'travel', gender: 'male',   radius: 8000 },
  { key: 'H7 unverified',   dist: 300,  bearing: 200, verified: false, cat: 'food',   gender: 'male',   radius: 8000 },
  { key: 'H8 blocked',      dist: 300,  bearing: 300, verified: true,  cat: 'food',   gender: 'male',   radius: 8000, block: true },
  { key: 'H9 far-6km',      dist: 6000, bearing: 60,  verified: true,  cat: 'food',   gender: 'male',   radius: 8000 },
  { key: 'H10 own-cap-500', dist: 900,  bearing: 150, verified: true,  cat: 'food',   gender: 'male',   radius: 500 },
];

const created = []; // user ids to clean up
const idToKey = new Map();
let savedWaveSize, savedWaveInterval;

async function createUser(email) {
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password: PW,
    email_confirm: true,
  });
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

async function raiseRequest({ seeker, catId, preferWomen }) {
  const { data, error } = await sb
    .from('requests')
    .insert({
      seeker_id: seeker,
      category_id: catId,
      description: 'harness test',
      timing: 'now',
      urgency: 'everyday',
      meetpoint_lat: CENTER.lat,
      meetpoint_lng: CENTER.lng,
      approx_area: 'Test Area',
      prefer_women: !!preferWomen,
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

function printPings(title, rows) {
  console.log(`\n${title}`);
  if (!rows.length) {
    console.log('   (none)');
    return;
  }
  for (const row of rows) {
    console.log(`   wave ${row.wave_number}  →  ${idToKey.get(row.helper_id) ?? row.helper_id}`);
  }
}

async function main() {
  console.log('=== Sapiens dispatch-engine harness ===');

  // category ids
  const { data: cats } = await sb.from('categories').select('id, slug').in('slug', ['food', 'travel']);
  const catId = Object.fromEntries(cats.map((c) => [c.slug, c.id]));

  // save tunables we will temporarily change
  savedWaveSize = await getConfig('wave_size');
  savedWaveInterval = await getConfig('wave_interval_minutes');

  // seeker
  const seeker = await createUser(`seed-seeker-${Date.now()}@sapiens.test`);
  idToKey.set(seeker, 'SEEKER');

  // helpers
  for (const h of HELPERS) {
    const id = await createUser(`seed-${h.key.split(' ')[0].toLowerCase()}-${Date.now()}@sapiens.test`);
    idToKey.set(id, h.key);
    await sb.from('profiles').update({ verified: h.verified, gender: h.gender }).eq('id', id);
    await sb
      .from('helper_preferences')
      .update({ categories: [catId[h.cat]], radius_max_m: h.radius })
      .eq('user_id', id);
    const pt = offset(CENTER, h.dist, h.bearing);
    await sb.rpc('admin_set_helper_location', { p_user: id, p_lat: pt.lat, p_lng: pt.lng });
    if (h.block) await sb.from('blocks').insert({ blocker_id: seeker, blocked_id: id });
  }

  console.log('\nSeeded 1 seeker + 10 helpers around Pune center.');
  console.log('Expected excluded: H6 (wrong category), H7 (unverified), H8 (blocked), H10 (own 500m cap).');

  // ── Test A: waves + radius growth ─────────────────────────────────────────
  const reqA = await raiseRequest({ seeker, catId: catId.food, preferWomen: false });
  await sleep(600); // let the after-insert trigger finish
  printPings('TEST A — wave 1 (auto on create, everyday radius 3 km):', await pingsFor(reqA));
  console.log('   expect: H1, H2, H3 (near + food + verified). NOT H6/H7/H8/H10.');

  // widen: interval 0 so each tick advances the next wave immediately
  await setConfig('wave_interval_minutes', { casual: 0, everyday: 0, urgent: 0, sos: 0 });
  for (let i = 0; i < 3; i++) {
    await sb.rpc('dispatch_tick');
    await sleep(400);
  }
  printPings('TEST A — after ticks (radius widens 5 km, 7 km …):', await pingsFor(reqA));
  console.log('   expect: wave 2 adds H4, H5; wave 3 adds H9. H10 still excluded (own cap).');
  await setConfig('wave_interval_minutes', savedWaveInterval);

  // ── Test B: prefer-women reorders ahead of distance ───────────────────────
  await setConfig('wave_size', { casual: 3, everyday: 2, urgent: 6, sos: 25 });

  const reqC = await raiseRequest({ seeker, catId: catId.food, preferWomen: false });
  await sleep(600);
  printPings('TEST B — wave 1, prefer_women OFF, wave size 2:', await pingsFor(reqC));
  console.log('   expect nearest two: H1 (200 m), H2 (500 m).');

  const reqB = await raiseRequest({ seeker, catId: catId.food, preferWomen: true });
  await sleep(600);
  printPings('TEST B — wave 1, prefer_women ON, wave size 2:', await pingsFor(reqB));
  console.log('   expect women first: H2 ♀, H3 ♀ — H1 (nearest, male) is bumped.');

  await setConfig('wave_size', savedWaveSize);

  console.log('\n=== harness done ===');
}

async function cleanup() {
  try {
    if (savedWaveSize) await setConfig('wave_size', savedWaveSize);
    if (savedWaveInterval) await setConfig('wave_interval_minutes', savedWaveInterval);
  } catch {}
  for (const id of created) {
    try {
      await sb.auth.admin.deleteUser(id);
    } catch {}
  }
  console.log(`\nCleaned up ${created.length} test users (cascades to their requests/pings).`);
}

main()
  .catch((e) => console.error('HARNESS ERROR:', e.message ?? e))
  .finally(cleanup);
