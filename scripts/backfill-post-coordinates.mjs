/**
 * Backfill operational_posts.location.latitude / longitude by geocoding the
 * address fields that are already stored on each post.
 *
 * Why this exists
 * ---------------
 * `operational_posts.location` is only ever written by the work-order → post
 * sync. Posts created before map-pinning existed have address text but no
 * coordinates, so they cannot appear on the fleet tracking map. This script
 * resolves those addresses once and writes the coordinates back.
 *
 * Usage:
 *   node scripts/backfill-post-coordinates.mjs           # dry run, prints only
 *   node scripts/backfill-post-coordinates.mjs --apply   # writes to the DB
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');

// ─── Load env from .env.local ────────────────────────────────────────────────
function loadEnv() {
  const env = {};
  try {
    const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    console.error('Could not read .env.local');
    process.exit(1);
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL  = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY   = env.SUPABASE_SERVICE_ROLE_KEY;
const MAPS_KEY      = env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

for (const [name, val] of Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  NEXT_PUBLIC_GOOGLE_MAPS_KEY: MAPS_KEY,
})) {
  if (!val) {
    console.error(`Missing ${name} in .env.local`);
    process.exit(1);
  }
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── India bounding box sanity check ─────────────────────────────────────────
const IN_BOUNDS = { minLat: 6.5, maxLat: 35.7, minLng: 68.1, maxLng: 97.4 };
const inIndia = (lat, lng) =>
  lat >= IN_BOUNDS.minLat && lat <= IN_BOUNDS.maxLat &&
  lng >= IN_BOUNDS.minLng && lng <= IN_BOUNDS.maxLng;

// ─── Geocode one address string ──────────────────────────────────────────────
async function geocode(query) {
  const url =
    'https://maps.googleapis.com/maps/api/geocode/json' +
    `?address=${encodeURIComponent(query)}&region=in&key=${MAPS_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.status !== 'OK' || !data.results?.length) return null;
  const { lat, lng } = data.results[0].geometry.location;
  return { lat, lng, formatted: data.results[0].formatted_address };
}

function buildQuery(loc, postName) {
  const parts = [];
  if (loc.address && loc.address.trim()) parts.push(loc.address.trim());
  if (loc.city && loc.city.trim())       parts.push(loc.city.trim());
  if (loc.state && loc.state.trim())     parts.push(loc.state.trim());
  if (loc.pincode && String(loc.pincode).trim()) parts.push(String(loc.pincode).trim());
  if (parts.length === 0 && postName) parts.push(postName);
  if (parts.length === 0) return null;
  parts.push('India');
  return parts.join(', ');
}

// ─── Main ────────────────────────────────────────────────────────────────────
const { data: posts, error } = await supabase
  .from('operational_posts')
  .select('id, post_name, location, status')
  .eq('status', 'active');

if (error) {
  console.error('Fetch failed:', error.message);
  process.exit(1);
}

console.log(`Found ${posts.length} active posts.`);
console.log(APPLY ? 'Mode: APPLY (will write)\n' : 'Mode: DRY RUN (no writes)\n');

let resolved = 0, skipped = 0, failed = 0;

for (const post of posts) {
  const loc = post.location ?? {};
  const hasCoords =
    typeof loc.latitude === 'number' && typeof loc.longitude === 'number' &&
    isFinite(loc.latitude) && isFinite(loc.longitude) &&
    !(loc.latitude === 0 && loc.longitude === 0);

  if (hasCoords) {
    console.log(`  SKIP  ${post.post_name} — already has ${loc.latitude}, ${loc.longitude}`);
    skipped++;
    continue;
  }

  const query = buildQuery(loc, post.post_name);
  if (!query) {
    console.log(`  FAIL  ${post.post_name} — no address data to geocode`);
    failed++;
    continue;
  }

  const hit = await geocode(query);
  if (!hit) {
    console.log(`  FAIL  ${post.post_name} — geocoder returned nothing for "${query}"`);
    failed++;
    continue;
  }
  if (!inIndia(hit.lat, hit.lng)) {
    console.log(`  FAIL  ${post.post_name} — result outside India (${hit.lat}, ${hit.lng})`);
    failed++;
    continue;
  }

  console.log(`  OK    ${post.post_name}`);
  console.log(`        query : ${query}`);
  console.log(`        result: ${hit.lat}, ${hit.lng}  (${hit.formatted})`);

  if (APPLY) {
    const nextLocation = { ...loc, latitude: hit.lat, longitude: hit.lng };
    const { error: upErr } = await supabase
      .from('operational_posts')
      .update({ location: nextLocation, updated_at: new Date().toISOString() })
      .eq('id', post.id);
    if (upErr) {
      console.log(`        WRITE FAILED: ${upErr.message}`);
      failed++;
      continue;
    }
  }
  resolved++;

  // Stay well under Google's rate limit.
  await new Promise((r) => setTimeout(r, 120));
}

console.log(`\nResolved: ${resolved}   Skipped: ${skipped}   Failed: ${failed}`);
if (!APPLY && resolved > 0) {
  console.log('\nRe-run with --apply to write these coordinates to the database.');
}
