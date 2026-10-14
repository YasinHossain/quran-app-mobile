/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const catalogDirectories = [
  'translation-packs',
  'word-translation-packs',
  'tafsir-packs',
  'mushaf-packs',
  'word-study-packs',
  'word-grammar-packs',
  'word-reference-packs',
];
const urlFields = ['downloadUrl', 'manifestUrl', 'databaseUrl'];

function relativeUrl(category, value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return value;
  const pathname = new URL(value).pathname;
  const marker = `/${category}/`;
  const index = pathname.indexOf(marker);
  if (index < 0) {
    throw new Error(`${value} is not hosted below /${category}/`);
  }
  return decodeURIComponent(pathname.slice(index + marker.length));
}

for (const category of catalogDirectories) {
  const catalogPath = path.join(projectRoot, 'dist', category, 'catalog.json');
  if (!fs.existsSync(catalogPath)) continue;

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const packs = Array.isArray(catalog.packs) ? catalog.packs : [];
  let changes = 0;

  for (const pack of packs) {
    for (const field of urlFields) {
      const current = pack[field];
      const normalized = relativeUrl(category, current);
      if (normalized !== current) {
        pack[field] = normalized;
        changes += 1;
      }
    }
  }

  if (changes > 0) {
    fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  }
  console.log(`${category}: normalized ${changes} URL(s)`);
}
