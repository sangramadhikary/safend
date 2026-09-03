#!/usr/bin/env node
/**
 * Secret-scanning control (Requirement 4.8).
 *
 * Blocks the introduction of a hardcoded Secret and reports the offending file.
 * Runs in two modes:
 *
 *   --staged   Scan only the files staged for commit (pre-commit hook mode).
 *   (default)  Scan every git-tracked text file (CI mode).
 *
 * Detected Secret types (per Requirement 4.1): the Supabase Service_Role_Key
 * and anon key (JWTs), Cloudflare R2 access keys, Firebase keys, and generic
 * high-entropy credential assignments.
 *
 * Exit code 0 when no Secret is found; exit code 1 (with a per-file report)
 * when at least one Secret is found, so a CI build or commit is blocked with
 * no waiver.
 *
 * Implementation note: ESM (the repo's package.json declares "type": "module").
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';

/** Files/paths that legitimately contain placeholder or documented examples. */
const PATH_ALLOWLIST = [
  /(^|\/)\.env\.example$/,
  /(^|\/)AUDIT_REPORT\.md$/,
  /(^|\/)README\.md$/,
  /(^|\/)\.kiro\//,
  /(^|\/)scripts\/ci\/scan-secrets\.mjs$/,
  /(^|\/)package-lock\.json$/,
];

/** Extensions worth scanning; binary/asset files are skipped. */
const SKIP_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico',
  '.mp3', '.mp4', '.wav', '.ogg', '.woff', '.woff2', '.ttf', '.eot',
  '.pdf', '.zip', '.gz', '.tgz', '.lock', '.map',
]);

/**
 * Placeholder markers. A match whose surrounding value contains one of these
 * is treated as a non-secret example (e.g. `your-supabase-service-role-key`).
 */
const PLACEHOLDER_MARKERS = [
  'your-', 'your_', 'example', 'placeholder', 'changeme', 'change-me',
  'xxxx', 'dummy', 'sample', 'redacted', 'mock', 'test', 'fake', 'demo',
  '<', '${', 'process.env',
  // Obvious fake/sequential fillers used in demo UI fixtures.
  '0123456789', '1234567890', 'abcdefghij', 'qwerty', 'deadbeef',
];

/**
 * Detect obviously synthetic values (long ascending or repeating sequences)
 * that demo/mock fixtures use, so they are not reported as real secrets.
 */
function looksSynthetic(value) {
  const lower = value.toLowerCase();
  // Long ascending hex/alpha run, e.g. "0123456789abcdef" or "abcdefghijkl".
  const seq = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  if (lower.includes('0123456789') || lower.includes('123456789')) return true;
  if (lower.includes('9876543210') || lower.includes('987654321')) return true;
  // Ascending or descending alphabet runs.
  const revSeq = [...seq].reverse().join('');
  for (let i = 0; i + 8 <= seq.length; i++) {
    if (lower.includes(seq.slice(i, i + 8))) return true;
    if (lower.includes(revSeq.slice(i, i + 8))) return true;
  }
  // A short fragment repeated to fill length, e.g. "abcdefabcdefabcdef".
  const half = Math.floor(lower.length / 2);
  if (half >= 6 && lower.slice(0, half) === lower.slice(half, half * 2)) return true;
  // Mostly a single repeated character.
  if (/(.)\1{7,}/.test(lower)) return true;
  void digits;
  return false;
}

/**
 * Secret detection rules. Each rule has a stable id, a human-readable Secret
 * type, and a RegExp that matches the literal Secret form (not env reads).
 */
const RULES = [
  {
    id: 'supabase-jwt',
    type: 'Supabase JWT (service-role or anon key)',
    // Supabase keys are JWTs beginning with the standard header `eyJ`.
    regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  },
  {
    id: 'r2-secret-access-key',
    type: 'Cloudflare R2 / AWS secret access key assignment',
    regex: /(?:R2_SECRET_ACCESS_KEY|R2_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY)\s*[:=]\s*['"][A-Za-z0-9/+_-]{20,}['"]/g,
  },
  {
    id: 'firebase-api-key',
    type: 'Firebase / Google API key',
    regex: /AIza[0-9A-Za-z_-]{35}/g,
  },
  {
    id: 'private-key-block',
    type: 'PEM private key block',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
  },
  {
    id: 'generic-secret-assignment',
    type: 'Hardcoded credential assignment',
    // `secret`/`token`/`password`/`apikey` assigned a long literal string.
    regex: /(?:secret|token|password|passwd|api[_-]?key|access[_-]?key)["']?\s*[:=]\s*['"][^'"\s]{16,}['"]/gi,
  },
];

function isAllowlistedPath(file) {
  return PATH_ALLOWLIST.some((re) => re.test(file));
}

function looksLikePlaceholder(snippet) {
  const lower = snippet.toLowerCase();
  if (PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker))) return true;
  return looksSynthetic(snippet);
}

function gitFiles(stagedOnly) {
  const args = stagedOnly
    ? ['diff', '--cached', '--name-only', '--diff-filter=ACM']
    : ['ls-files'];
  const out = execFileSync('git', args, { encoding: 'utf8' });
  return out.split('\n').map((l) => l.trim()).filter(Boolean);
}

function shouldScan(file) {
  if (isAllowlistedPath(file)) return false;
  const dot = file.lastIndexOf('.');
  const ext = dot >= 0 ? file.slice(dot).toLowerCase() : '';
  if (SKIP_EXTENSIONS.has(ext)) return false;
  if (!existsSync(file)) return false;
  try {
    if (statSync(file).size > 2 * 1024 * 1024) return false; // skip >2MB
  } catch {
    return false;
  }
  return true;
}

function scanFile(file) {
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const lines = content.split('\n');
  const hits = [];
  for (const rule of RULES) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      rule.regex.lastIndex = 0;
      let m;
      while ((m = rule.regex.exec(line)) !== null) {
        if (looksLikePlaceholder(line)) continue;
        hits.push({ rule, line: i + 1, snippet: m[0].slice(0, 24) });
        break; // one report per rule per line is enough
      }
    }
  }
  return hits;
}

function main() {
  const stagedOnly = process.argv.includes('--staged');
  const files = gitFiles(stagedOnly).filter(shouldScan);

  const findings = [];
  for (const file of files) {
    for (const hit of scanFile(file)) {
      findings.push({ file, ...hit });
    }
  }

  if (findings.length === 0) {
    console.log(
      `Secret scan passed: no hardcoded secrets in ${files.length} ${stagedOnly ? 'staged ' : ''}file(s).`,
    );
    process.exit(0);
  }

  console.error('\nSecret scan FAILED — hardcoded secret(s) detected:\n');
  for (const f of findings) {
    console.error(
      `  ${f.file}:${f.line}  [${f.rule.type}]  match: ${f.snippet}...`,
    );
  }
  console.error(
    '\nRemove the secret, read it from an environment variable instead, and ' +
      'rotate it if it was ever committed. This control has no waiver.',
  );
  process.exit(1);
}

main();
