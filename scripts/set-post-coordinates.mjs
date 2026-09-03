/**
 * Manually set (or correct) the coordinates and geofence radius of an
 * operational post.
 *
 * Usage
 * -----
 *   # List every post with its current coordinates
 *   node scripts/set-post-coordinates.mjs --list
 *
 *   # Set coordinates by matching part of the post name (case-insensitive)
 *   node scripts/set-post-coordinates.mjs --post "grand restaurant" --lat 20.462836 --lng 85.883731
 *
 *   # Also set the geofence radius in metres
 *   node scripts/set-post-coordinates.mjs --post "nishamani" --lat 20.45325 --lng 85.88948 --radius 75
 *
 *   # Set by exact post id instead of name
 *   node scripts/set-post-coordinates.mjs --id f7c5e06f-... --lat 20.46 --lng 85.88
 *
 * Getting coordinates: open Google Maps, right-click the exact spot, and click
 * the lat/lng at the top of the menu to copy it.
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// ─── Arg parsing ─────────────────────────────────────────────────────────────
function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}
const LIST   = process.argv.includes('--list');
const POST   = arg('post');
const ID     = arg('id');
const LAT    = arg('lat');
const LNG    = arg('lng');
const RADIUS = arg('radius');

// ─── Env ─────────────────────────────────────────────────────────────────────
function loadEnv() {
  const env = {};
  try {
    const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    console.error('Could not read .env.local');
    process.exit(1);
  }
  return env;
}
const env = loadEnv();
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── India bounds sanity check ───────────────────────────────────────────────
const inIndia = (lat, lng) =>
  lat >= 6.5 && lat <= 35.7 && lng >= 68.1 && lng <= 97.4;

// ─── List mode ───────────────────────────────────────────────────────────────
if (LIST || (!POST && !ID)) {
  const { data, error } = await supabase
    .from('operational_posts')
    .select('id, post_name, location')
    .eq('status', 'active')
    .order('post_name');

  if (error) { console.error(error.message); process.exit(1); }

  console.log(`\n${data.length} active posts:\n`);
  for (const p of data) {
    const l = p.location ?? {};
    const coords = (typeof l.latitude === 'number' && typeof l.longitude === 'number')
      ? `${l.latitude.toFixed(6)}, ${l.longitude.toFixed(6)}`
      : '— no coordinates —';
    const radius = l.geofenceRadius ? `${l.geofenceRadius} m` : '50 m (default)';
    console.log(`  ${p.post_name}`);
    console.log(`     ${coords}   fence ${radius}`);
    console.log(`     id: ${p.id}`);
    console.log(`     address: ${l.address ?? ''}\n`);
  }
  if (!POST && !ID && !LIST) {
    console.log('Pass --post "<name fragment>" --lat <n> --lng <n> to set coordinates.');
  }
  process.exit(0);
}

// ─── Update mode ─────────────────────────────────────────────────────────────
if (!LAT || !LNG) {
  console.error('Both --lat and --lng are required when setting coordinates.');
  process.exit(1);
}
const lat = parseFloat(LAT);
const lng = parseFloat(LNG);
if (!isFinite(lat) || !isFinite(lng)) {
  console.error('--lat / --lng must be valid numbers.');
  process.exit(1);
}
if (!inIndia(lat, lng)) {
  console.error(`Refusing: ${lat}, ${lng} is outside India's bounding box.`);
  process.exit(1);
}

// Find the target post
let query = supabase.from('operational_posts').select('id, post_name, location');
query = ID ? query.eq('id', ID) : query.ilike('post_name', `%${POST}%`);
const { data: matches, error: findErr } = await query;

if (findErr) { console.error(findErr.message); process.exit(1); }
if (!matches?.length) {
  console.error(`No post matched ${ID ? `id "${ID}"` : `name containing "${POST}"`}.`);
  process.exit(1);
}
if (matches.length > 1) {
  console.error(`"${POST}" matched ${matches.length} posts — be more specific:`);
  matches.forEach((m) => console.error(`   • ${m.post_name}   (id ${m.id})`));
  process.exit(1);
}

const target = matches[0];
const prev = target.location ?? {};
const nextLocation = { ...prev, latitude: lat, longitude: lng };
if (RADIUS) {
  const r = parseInt(RADIUS, 10);
  if (!isFinite(r) || r < 10 || r > 5000) {
    console.error('--radius must be between 10 and 5000 metres.');
    process.exit(1);
  }
  nextLocation.geofenceRadius = r;
}

const { error: upErr } = await supabase
  .from('operational_posts')
  .update({ location: nextLocation, updated_at: new Date().toISOString() })
  .eq('id', target.id);

if (upErr) { console.error(`Write failed: ${upErr.message}`); process.exit(1); }

const before = (typeof prev.latitude === 'number')
  ? `${prev.latitude.toFixed(6)}, ${prev.longitude.toFixed(6)}`
  : 'none';

console.log(`\nUpdated  ${target.post_name}`);
console.log(`  before : ${before}`);
console.log(`  after  : ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
console.log(`  fence  : ${nextLocation.geofenceRadius ?? 50} m`);
console.log('\nRefresh the fleet map to see the change.\n');
