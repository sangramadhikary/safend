import sharp from 'sharp';
import { stat, mkdir, rename, access } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'public');
const OUT_DIR = path.join(ROOT, 'Images');
const BACKUP_DIR = path.resolve(process.cwd(), 'design-assets', 'source-images');

/**
 * Source image -> { out: optimised webp name, maxSide: cap longest edge }
 * Names are recognised from the original filenames and mapped to clean,
 * kebab-case slugs that match the service ids used across the site.
 */
const JOBS = [
  { src: 'Images/Unarmed_Guards.png',         out: 'unarmed-guards.webp', maxSide: 1280 },
  { src: 'Images/Armed_Guards.png',           out: 'armed-guards.webp',   maxSide: 1280 },
  { src: 'Images/PSO.png',                    out: 'pso.webp',            maxSide: 1280 },
  { src: 'Images/eventguardandbouncers.png',  out: 'event-guards.webp',   maxSide: 1280 },
  { src: 'Images/Dog_Sqard.png',              out: 'dog-squad.webp',      maxSide: 1280 },
  { src: 'Images/allguards.png',              out: 'all-guards.webp',     maxSide: 1600 },
  { src: 'Images/Nepaliandpunjabi_Guards.png', out: 'guards-group.webp',  maxSide: 1280 },
  { src: 'services_hero_section.png',         out: 'services-hero.webp',  maxSide: 1920 },
];

const QUALITY = 80;

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(BACKUP_DIR, { recursive: true });

  let beforeTotal = 0;
  let afterTotal = 0;

  for (const job of JOBS) {
    const srcPath = path.join(ROOT, job.src);
    if (!(await exists(srcPath))) {
      console.log(`SKIP (missing): ${job.src}`);
      continue;
    }
    const outPath = path.join(OUT_DIR, job.out);

    const meta = await sharp(srcPath).metadata();
    const before = (await stat(srcPath)).size;
    beforeTotal += before;

    const longest = Math.max(meta.width ?? 0, meta.height ?? 0);
    const pipeline = sharp(srcPath);
    if (longest > job.maxSide) {
      pipeline.resize({
        width: meta.width >= meta.height ? job.maxSide : undefined,
        height: meta.height > meta.width ? job.maxSide : undefined,
        withoutEnlargement: true,
      });
    }
    await pipeline.webp({ quality: QUALITY, effort: 6 }).toFile(outPath);

    const after = (await stat(outPath)).size;
    afterTotal += after;

    // Move the heavy original out of /public so it isn't deployed, but keep it.
    const backupPath = path.join(BACKUP_DIR, path.basename(job.src));
    await rename(srcPath, backupPath);

    const pct = (100 - (after / before) * 100).toFixed(1);
    console.log(
      `${job.out.padEnd(20)} ${(before / 1024 / 1024).toFixed(2)}MB -> ${(after / 1024).toFixed(0)}KB  (-${pct}%)`
    );
  }

  console.log(
    `\nTOTAL  ${(beforeTotal / 1024 / 1024).toFixed(2)}MB -> ${(afterTotal / 1024 / 1024).toFixed(2)}MB`
  );
  console.log(`Originals preserved in: ${path.relative(process.cwd(), BACKUP_DIR)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
