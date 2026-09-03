/**
 * Re-derive every operational post's service configuration from its work order.
 *
 * Why this exists
 * ---------------
 * Two defects in the old work-order -> post sync left stored post configuration
 * permanently wrong:
 *
 *   1. It copied the work order's single contract-wide `serviceInstances` map onto
 *      EVERY post, ignoring `perPostServiceInstances`. Posts on a multi-post
 *      contract all ended up with the same configuration.
 *   2. Its idempotency check compared only the NUMBER of posts, so once posts were
 *      written they were never corrected — not when the work order was edited, and
 *      not when a combined work order was later split one-per-post.
 *
 * Both are fixed in the live sync, but the sync only runs on a work-order status
 * transition. Posts belonging to work orders that are already 'completed' would
 * stay wrong forever, so they need this one-off correction.
 *
 * This imports the SAME resolution module the application uses
 * (src/modules/shared/workOrderPostConfig.ts) so the backfill cannot compute
 * anything different from the live sync.
 *
 * Usage
 * -----
 *   node scripts/maintenance/resync-post-config.mjs            # dry run (default)
 *   node scripts/maintenance/resync-post-config.mjs --apply    # write changes
 *
 * Only `service_instances`, `total_guards` and `shift_type` are touched. Posts are
 * updated in place — never deleted and recreated — so rota assignments survive.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import {
  derivePostConfig,
  buildPostConfigFingerprint,
  describeServiceInstances,
  findPostIndex,
  workOrderLocations,
} from '../../src/modules/shared/workOrderPostConfig.ts';

const APPLY = process.argv.includes('--apply');

function loadEnv(path = '.env.local') {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    while (v.length >= 2 && ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'"))) {
      v = v.slice(1, -1).trim();
    }
    out[m[1]] = v;
  }
  return out;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

const [{ data: posts, error: postErr }, { data: workOrders, error: woErr }] = await Promise.all([
  db.from('operational_posts')
    .select('id, post_name, client_name, work_order_id, total_guards, shift_type, service_instances, status')
    .eq('status', 'active')
    .order('client_name'),
  db.from('work_orders').select('id, work_order_id, status, quotation_id, description'),
]);
if (postErr) { console.error('operational_posts query failed:', postErr.message); process.exit(1); }
if (woErr) { console.error('work_orders query failed:', woErr.message); process.exit(1); }

// Work orders keep their rich data as JSON in `description`.
const woById = new Map();
for (const wo of workOrders ?? []) {
  let detail = {};
  try { detail = JSON.parse(wo.description || '{}'); } catch { detail = {}; }
  woById.set(wo.id, { ...wo, ...detail });
}

// Quotations are the fallback config source when a work order carries none.
const quotationIds = [...new Set((workOrders ?? []).map((w) => w.quotation_id).filter(Boolean))];
const quotationById = new Map();
if (quotationIds.length > 0) {
  const { data: quotes } = await db.from('quotations').select('*').in('id', quotationIds);
  for (const q of quotes ?? []) {
    quotationById.set(q.id, {
      ...q,
      serviceInstances: q.service_instances,
      securityServices: q.security_services,
      shiftType: q.shift_type,
    });
  }
}

const planned = [];
const skipped = [];

for (const post of posts ?? []) {
  const wo = post.work_order_id ? woById.get(post.work_order_id) : null;
  if (!wo) {
    skipped.push({ post, reason: 'no linked work order' });
    continue;
  }
  const postIndex = findPostIndex(wo, post.post_name);
  if (postIndex < 0) {
    // Cannot prove which location this post is; guessing could write another
    // post's configuration, which is the bug being fixed.
    skipped.push({
      post,
      reason: `post name not found among ${workOrderLocations(wo).length} work order location(s)`,
    });
    continue;
  }

  const location = workOrderLocations(wo)[postIndex];
  const quotation = wo.quotation_id ? quotationById.get(wo.quotation_id) : null;
  const desired = derivePostConfig(wo, quotation, postIndex, post.post_name, location);

  const currentPrint = buildPostConfigFingerprint(
    post.post_name, post.total_guards || 0, post.shift_type || '8H', post.service_instances || {}
  );
  if (currentPrint === desired.fingerprint) continue;

  planned.push({ post, wo, desired, postIndex });
}

console.log(`Mode: ${APPLY ? 'APPLY (writes changes)' : 'DRY RUN (no changes)'}`);
console.log(`Active posts: ${posts?.length ?? 0}`);
console.log(`  already correct : ${(posts?.length ?? 0) - planned.length - skipped.length}`);
console.log(`  need correction : ${planned.length}`);
console.log(`  skipped         : ${skipped.length}`);

if (skipped.length > 0) {
  console.log('\n--- SKIPPED (left untouched) ---');
  for (const s of skipped) {
    console.log(`  [${s.post.client_name}] "${s.post.post_name}" — ${s.reason}`);
  }
}

if (planned.length > 0) {
  console.log('\n--- CHANGES ---');
  for (const p of planned) {
    console.log(`\n[${p.post.client_name}] "${p.post.post_name}"  (WO ${p.wo.work_order_id}, location #${p.postIndex})`);
    console.log(`   services  before: ${describeServiceInstances(p.post.service_instances)}`);
    console.log(`   services  after : ${describeServiceInstances(p.desired.serviceInstances)}`);
    if ((p.post.total_guards || 0) !== p.desired.totalGuards) {
      console.log(`   guards    ${p.post.total_guards ?? 0} -> ${p.desired.totalGuards}`);
    }
    if ((p.post.shift_type || '8H') !== p.desired.shiftType) {
      console.log(`   shiftType ${p.post.shift_type ?? '8H'} -> ${p.desired.shiftType}`);
    }
  }
}

// Corrections can remove a service type a post no longer staffs. Any rota
// assignment or salary rate for a removed type becomes stranded, so report it
// rather than silently leaving inconsistent downstream rows.
if (planned.length > 0) {
  const affectedIds = planned.map((p) => p.post.id);
  const { data: rota } = await db
    .from('rota_assignments')
    .select('post_id, post_name, service_type_key, shift_key, rota_date, employee_name')
    .in('post_id', affectedIds);

  // An assignment is stranded when the corrected configuration no longer staffs
  // that service type AT ALL, or no longer staffs it on that particular shift.
  // Checking the service type alone would miss a post that drops its day shift.
  const stranded = [];
  for (const r of rota ?? []) {
    const plan = planned.find((p) => p.post.id === r.post_id);
    if (!plan) continue;
    const instances = plan.desired.serviceInstances[r.service_type_key];
    const list = Array.isArray(instances) ? instances : (instances ? [instances] : []);
    if (list.length === 0) {
      stranded.push({ ...r, why: 'service type no longer configured' });
      continue;
    }
    const shiftStillStaffed = list.some((inst) => {
      const shift = inst?.shifts?.[r.shift_key];
      return Boolean(shift?.enabled) && (Number(shift?.quantity) || 0) > 0;
    });
    if (!shiftStillStaffed) {
      stranded.push({ ...r, why: `${r.shift_key} shift no longer staffed` });
    }
  }
  console.log(`\n--- DOWNSTREAM IMPACT ---`);
  console.log(`rota assignments on affected posts: ${rota?.length ?? 0}`);
  console.log(`  stranded by the correction: ${stranded.length}`);
  for (const s of stranded) {
    console.log(`    ${s.rota_date} "${s.post_name}" ${s.service_type_key}/${s.shift_key} — ${s.employee_name ?? 'unassigned'} (${s.why})`);
  }
  console.log('  (stranded rota rows are reported only — this script does not delete them)');
}

if (!APPLY) {
  console.log('\nDry run complete. Re-run with --apply to write these changes.');
  process.exit(0);
}

let updated = 0;
const failures = [];
for (const p of planned) {
  const { error } = await db
    .from('operational_posts')
    .update({
      service_instances: p.desired.serviceInstances,
      total_guards: p.desired.totalGuards,
      shift_type: p.desired.shiftType,
    })
    .eq('id', p.post.id);
  if (error) failures.push(`${p.post.post_name}: ${error.message}`);
  else updated++;
}

console.log(`\nUpdated ${updated}/${planned.length} post(s).`);
if (failures.length > 0) {
  console.log('Failures:');
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
