#!/usr/bin/env node
/**
 * Dependency-audit gate with base-branch baseline (Requirements 4.8 support,
 * 14.3).
 *
 * Runs `npm audit --json` against the current `package.json` / `package-lock.json`
 * and fails the build when any High or Critical advisory is present that is NOT
 * already in the base-branch baseline. There is no override, waiver, or
 * grace-period exception (Requirement 14.3).
 *
 * The baseline is the set of High/Critical advisory identifiers produced by the
 * same audit run on the base branch. It is provided to this script via the
 * BASELINE_FILE environment variable (a JSON array of advisory ids) or the
 * `--baseline <path>` argument. When no baseline is supplied, the baseline is
 * empty and ANY High/Critical advisory fails the build.
 *
 * Modes:
 *   --emit-baseline   Print the current High/Critical advisory ids as a JSON
 *                     array to stdout (used to capture the base-branch baseline)
 *                     and always exit 0.
 *   (default)         Compare current advisories against the baseline and exit
 *                     1 if any new High/Critical advisory is found.
 *
 * Implementation note: ESM (the repo's package.json declares "type": "module").
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const BLOCKING_SEVERITIES = new Set(['high', 'critical']);

/** Run `npm audit --json`; npm exits non-zero when advisories exist, so capture stdout regardless. */
function runAudit() {
  try {
    const out = execSync('npm audit --json', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(out);
  } catch (err) {
    // npm audit returns a non-zero exit code when vulnerabilities are found,
    // but still writes the JSON report to stdout.
    if (err && typeof err.stdout === 'string' && err.stdout.trim()) {
      try {
        return JSON.parse(err.stdout);
      } catch (parseErr) {
        console.error('Failed to parse npm audit JSON output:', parseErr.message);
        process.exit(2);
      }
    }
    console.error('Failed to run npm audit:', err.message);
    process.exit(2);
  }
}

/**
 * Extract blocking (High/Critical) advisories from an npm audit report.
 * Supports the npm v7+ `vulnerabilities` schema. Returns a Map of a stable
 * advisory key -> descriptive record.
 */
function extractBlocking(report) {
  const blocking = new Map();
  const vulns = report.vulnerabilities ?? {};
  for (const [pkgName, info] of Object.entries(vulns)) {
    const severity = String(info.severity ?? '').toLowerCase();
    if (!BLOCKING_SEVERITIES.has(severity)) continue;

    const via = Array.isArray(info.via) ? info.via : [];
    const advisories = via.filter((v) => v && typeof v === 'object');

    if (advisories.length === 0) {
      // Transitive-only entry with no direct advisory object: key by package.
      const key = `pkg:${pkgName}@${severity}`;
      blocking.set(key, { key, package: pkgName, severity, title: '(transitive)' });
      continue;
    }

    for (const adv of advisories) {
      const id = adv.source ?? adv.url ?? adv.title ?? `${pkgName}`;
      const key = `adv:${id}`;
      blocking.set(key, {
        key,
        package: adv.name ?? pkgName,
        severity: String(adv.severity ?? severity).toLowerCase(),
        title: adv.title ?? '(no title)',
        url: adv.url,
      });
    }
  }
  return blocking;
}

function loadBaseline() {
  const argIdx = process.argv.indexOf('--baseline');
  const path =
    argIdx >= 0 ? process.argv[argIdx + 1] : process.env.BASELINE_FILE;
  if (!path) return new Set();
  if (!existsSync(path)) {
    console.warn(`Baseline file "${path}" not found; treating baseline as empty.`);
    return new Set();
  }
  try {
    const raw = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (err) {
    console.warn(`Could not parse baseline "${path}": ${err.message}; treating as empty.`);
    return new Set();
  }
}

function main() {
  const report = runAudit();
  const blocking = extractBlocking(report);

  if (process.argv.includes('--emit-baseline')) {
    // Emit the current High/Critical advisory keys as the baseline.
    process.stdout.write(JSON.stringify([...blocking.keys()]));
    process.exit(0);
  }

  const baseline = loadBaseline();
  const newAdvisories = [...blocking.values()].filter((a) => !baseline.has(a.key));

  if (newAdvisories.length === 0) {
    console.log(
      `Dependency audit passed: ${blocking.size} High/Critical advisory(ies) found, ` +
        `all present in the base-branch baseline (${baseline.size} baselined).`,
    );
    process.exit(0);
  }

  console.error('\nDependency audit FAILED — new High/Critical advisory(ies) not in baseline:\n');
  for (const a of newAdvisories) {
    console.error(`  [${a.severity.toUpperCase()}] ${a.package} — ${a.title}${a.url ? ` (${a.url})` : ''}`);
  }
  console.error(
    `\n${newAdvisories.length} new advisory(ies). Resolve them (upgrade/replace the dependency) ` +
      'before merging. This control has no waiver.',
  );
  process.exit(1);
}

main();
