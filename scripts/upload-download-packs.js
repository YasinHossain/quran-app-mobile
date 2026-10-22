/* eslint-disable no-console */
// Uploads the catalog-referenced files under dist/*-packs to Cloudflare R2 with rclone.
// Versioned assets are uploaded first with immutable caching, then the catalogs with a
// short cache, so a published catalog never points at a file that is not there yet.
//
// Usage: npm run upload:download-packs -- [--dry-run]
// Env:   R2_REMOTE (rclone remote name, default "r2"), R2_BUCKET (default "quran-packs")
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const distRoot = path.join(projectRoot, 'dist');
const remote = process.env.R2_REMOTE || 'r2';
const bucket = process.env.R2_BUCKET || 'quran-packs';
const dryRun = process.argv.includes('--dry-run');

const publicCategories = [
  'translation-packs',
  'word-translation-packs',
  'tafsir-packs',
  'mushaf-packs',
  'word-study-packs',
  'word-grammar-packs',
  'word-reference-packs',
  'verb-reference-packs',
];
const urlFields = ['downloadUrl', 'manifestUrl', 'databaseUrl'];

function referencedAssets(category) {
  const catalog = JSON.parse(fs.readFileSync(path.join(distRoot, category, 'catalog.json'), 'utf8'));
  const assets = new Set();
  for (const pack of catalog.packs ?? []) {
    for (const field of urlFields) {
      const value = pack[field];
      if (!value) continue;
      if (/^https?:\/\//i.test(value)) {
        throw new Error(`${category}: ${value} is absolute; run npm run normalize:download-pack-urls`);
      }
      assets.add(path.posix.join(category, value));
    }
    if (pack.assetBundle?.url) {
      assets.add(path.posix.join(category, pack.assetBundle.url));
    }
    if (category === 'mushaf-packs' && pack.manifestUrl) {
      const manifestPath = path.join(distRoot, category, pack.manifestUrl);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const base = path.posix.dirname(pack.manifestUrl);
      for (const asset of manifest.assetFiles ?? []) {
        assets.add(path.posix.join(category, base, asset.file));
      }
    }
  }
  return [...assets];
}

function rcloneCopy(files, cacheControl) {
  const listPath = path.join(os.tmpdir(), `r2-upload-${process.pid}-${Date.now()}.txt`);
  fs.writeFileSync(listPath, `${files.join('\n')}\n`);
  const args = [
    'copy',
    distRoot,
    `${remote}:${bucket}`,
    '--files-from-raw',
    listPath,
    '--header-upload',
    `Cache-Control: ${cacheControl}`,
    '--transfers',
    '16',
    '--checkers',
    '32',
    '--s3-no-check-bucket',
    '--stats-one-line',
    '--stats',
    '15s',
    '-v',
  ];
  if (dryRun) args.push('--dry-run');
  const result = spawnSync('rclone', args, { stdio: 'inherit' });
  fs.rmSync(listPath, { force: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const assets = [];
for (const category of publicCategories) {
  const files = referencedAssets(category);
  const missing = files.filter((file) => !fs.existsSync(path.join(distRoot, file)));
  if (missing.length > 0) {
    throw new Error(`${category}: ${missing.length} referenced file(s) missing, e.g. ${missing[0]}`);
  }
  console.log(`${category}: ${files.length} referenced file(s)`);
  assets.push(...files);
}

console.log(`\nUploading ${assets.length} versioned asset(s) to ${remote}:${bucket}${dryRun ? ' (dry run)' : ''}`);
rcloneCopy(assets, 'public, max-age=31536000, immutable');

console.log('\nUploading catalogs');
rcloneCopy(
  publicCategories.map((category) => `${category}/catalog.json`),
  'public, max-age=300'
);
