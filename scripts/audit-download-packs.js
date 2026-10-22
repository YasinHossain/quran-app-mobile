/* eslint-disable no-console */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const distArgument = process.argv.find((argument) => argument.startsWith('--dist='));
const distRoot = distArgument
  ? path.resolve(process.cwd(), distArgument.slice('--dist='.length))
  : path.join(projectRoot, 'dist');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function checksum(filePath, algorithm) {
  return crypto.createHash(algorithm).update(fs.readFileSync(filePath)).digest('hex');
}

function extractRelativeAssetPath(category, value) {
  const normalized = String(value ?? '').trim().replace(/\\/g, '/');
  if (!normalized) return null;

  if (/^https?:\/\//i.test(normalized)) {
    const pathname = new URL(normalized).pathname;
    const marker = `/${category}/`;
    const markerIndex = pathname.indexOf(marker);
    return markerIndex >= 0 ? pathname.slice(markerIndex + marker.length) : null;
  }

  return normalized.replace(/^\.\//, '').replace(/^\/+/, '');
}

function expectedWordLanguages() {
  const source = fs.readFileSync(path.join(projectRoot, 'lib/i18n/wordLanguages.ts'), 'utf8');
  return Array.from(source.matchAll(/\{\s*code:\s*'([^']+)'/g), (match) => match[1]);
}

function expectedMushafPacks() {
  const source = fs.readFileSync(path.join(projectRoot, 'data/mushaf/options.ts'), 'utf8');
  return Array.from(
    source.matchAll(/packId:\s*'([^']+)',\s*\n\s*version:\s*'([^']+)'/g),
    (match) => `${match[1]}:${match[2]}`
  );
}

function verifyFile({ category, value, sizeBytes, expectedChecksum, algorithm, label }, errors) {
  const relativePath = extractRelativeAssetPath(category, value);
  if (!relativePath) {
    errors.push(`${label}: URL is empty or outside ${category}`);
    return null;
  }

  const filePath = path.join(distRoot, category, relativePath);
  if (!fs.existsSync(filePath)) {
    errors.push(`${label}: missing ${path.relative(projectRoot, filePath)}`);
    return null;
  }

  const stat = fs.statSync(filePath);
  if (typeof sizeBytes === 'number' && stat.size !== sizeBytes) {
    errors.push(`${label}: size ${stat.size} does not match ${sizeBytes}`);
  }
  if (expectedChecksum) {
    const actual = checksum(filePath, algorithm);
    if (actual.toLowerCase() !== String(expectedChecksum).toLowerCase()) {
      errors.push(`${label}: ${algorithm} checksum mismatch`);
    }
  }
  return filePath;
}

// The bundle must be exactly the manifest's asset files concatenated in manifest order.
function verifyAssetBundle(category, entry, manifest, label, errors) {
  const bundlePath = verifyFile(
    {
      category,
      value: entry.assetBundle.url,
      sizeBytes: entry.assetBundle.sizeBytes,
      expectedChecksum: entry.assetBundle.checksum,
      algorithm: 'md5',
      label,
    },
    errors
  );
  if (!bundlePath) return;

  const bundle = fs.readFileSync(bundlePath);
  let offset = 0;
  for (const asset of manifest.assetFiles ?? []) {
    const slice = bundle.subarray(offset, offset + asset.sizeBytes);
    offset += asset.sizeBytes;
    if (crypto.createHash('md5').update(slice).digest('hex') !== String(asset.checksum).toLowerCase()) {
      errors.push(`${label}: bytes for ${asset.file} do not match the manifest`);
      return;
    }
  }
  if (offset !== bundle.length) {
    errors.push(`${label}: size ${bundle.length} does not match the manifest asset total ${offset}`);
  }
}

function auditJsonPacks(config, errors) {
  const catalogPath = path.join(distRoot, config.category, 'catalog.json');
  if (!fs.existsSync(catalogPath)) {
    errors.push(`${config.name}: catalog is missing`);
    return { name: config.name, expected: config.expectedKeys.length, found: 0, bytes: 0 };
  }

  const catalog = readJson(catalogPath);
  const packs = Array.isArray(catalog.packs) ? catalog.packs : [];
  const byKey = new Map(packs.map((entry) => [config.key(entry), entry]));
  const expectedKeySet = new Set(config.expectedKeys);
  for (const key of config.expectedKeys) {
    if (!byKey.has(key)) errors.push(`${config.name}: missing catalog entry ${key}`);
  }
  for (const key of byKey.keys()) {
    if (!expectedKeySet.has(key)) errors.push(`${config.name}: unexpected catalog entry ${key}`);
  }

  let bytes = 0;
  for (const key of config.expectedKeys) {
    const entry = byKey.get(key);
    if (!entry) continue;
    const label = `${config.name} ${key}`;
    const payloadPath = verifyFile(
      {
        category: config.category,
        value: entry.downloadUrl,
        sizeBytes: entry.sizeBytes,
        expectedChecksum: entry.checksum,
        algorithm: 'md5',
        label: `${label} payload`,
      },
      errors
    );
    const manifestPath = verifyFile(
      {
        category: config.category,
        value: entry.manifestUrl,
        sizeBytes: entry.manifestSizeBytes,
        expectedChecksum: entry.manifestChecksum,
        algorithm: 'md5',
        label: `${label} manifest`,
      },
      errors
    );
    bytes += Number(entry.sizeBytes) || 0;

    if (payloadPath && config.payloadCountField) {
      const payload = readJson(payloadPath);
      const rows = payload[config.payloadCountField];
      if (!Array.isArray(rows) || rows.length !== entry.totalVerses) {
        errors.push(`${label}: payload row count does not match catalog`);
      }
    }

    if (manifestPath && config.category === 'mushaf-packs') {
      const manifest = readJson(manifestPath);
      for (const asset of manifest.assetFiles ?? []) {
        const base = path.posix.dirname(extractRelativeAssetPath(config.category, entry.manifestUrl));
        verifyFile(
          {
            category: config.category,
            value: path.posix.join(base, asset.file),
            sizeBytes: asset.sizeBytes,
            expectedChecksum: asset.checksum,
            algorithm: 'md5',
            label: `${label} asset ${asset.file}`,
          },
          errors
        );
        bytes += Number(asset.sizeBytes) || 0;
      }
      if (entry.assetBundle) {
        verifyAssetBundle(config.category, entry, manifest, `${label} asset bundle`, errors);
      }
    }
  }

  return { name: config.name, expected: config.expectedKeys.length, found: byKey.size, bytes };
}

function auditDatabasePacks(config, errors) {
  const catalogPath = path.join(distRoot, config.category, 'catalog.json');
  if (!fs.existsSync(catalogPath)) {
    errors.push(`${config.name}: catalog is missing`);
    return { name: config.name, expected: 0, found: 0, bytes: 0 };
  }

  const catalog = readJson(catalogPath);
  const packs = Array.isArray(catalog.packs) ? catalog.packs : [];
  let bytes = 0;
  for (const entry of packs) {
    const label = `${config.name} ${entry.packId}`;
    verifyFile(
      {
        category: config.category,
        value: entry.manifestUrl,
        algorithm: 'sha256',
        label: `${label} manifest`,
      },
      errors
    );
    verifyFile(
      {
        category: config.category,
        value: entry.databaseUrl,
        sizeBytes: entry.databaseSizeBytes,
        expectedChecksum: entry.databaseChecksumSha256,
        algorithm: 'sha256',
        label: `${label} database`,
      },
      errors
    );
    bytes += Number(entry.databaseSizeBytes) || 0;
  }

  if (packs.length < config.minimumCount) {
    errors.push(`${config.name}: expected at least ${config.minimumCount} packs, found ${packs.length}`);
  }
  return { name: config.name, expected: config.minimumCount, found: packs.length, bytes };
}

function formatMiB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function main() {
  const translations = readJson(path.join(projectRoot, 'src/data/translations.json'));
  const tafsirs = readJson(path.join(projectRoot, 'src/data/tafsirs.json'));
  const errors = [];
  const summaries = [
    auditJsonPacks(
      {
        name: 'Translations',
        category: 'translation-packs',
        expectedKeys: translations.map((entry) => entry.id),
        key: (entry) => entry.translationId,
        payloadCountField: 'verses',
      },
      errors
    ),
    auditJsonPacks(
      {
        name: 'Word-by-word languages',
        category: 'word-translation-packs',
        expectedKeys: expectedWordLanguages(),
        key: (entry) => entry.languageCode,
        payloadCountField: 'verses',
      },
      errors
    ),
    auditJsonPacks(
      {
        name: 'Tafsirs',
        category: 'tafsir-packs',
        expectedKeys: tafsirs.map((entry) => entry.id),
        key: (entry) => entry.tafsirId,
        payloadCountField: 'verses',
      },
      errors
    ),
    auditJsonPacks(
      {
        name: 'Mushaf packs',
        category: 'mushaf-packs',
        expectedKeys: expectedMushafPacks(),
        key: (entry) => `${entry.packId}:${entry.version}`,
      },
      errors
    ),
    auditDatabasePacks(
      { name: 'Word Study Essentials', category: 'word-study-packs', minimumCount: 1 },
      errors
    ),
    auditDatabasePacks(
      { name: 'Word grammar', category: 'word-grammar-packs', minimumCount: 1 },
      errors
    ),
    auditDatabasePacks(
      { name: 'Dictionaries', category: 'word-reference-packs', minimumCount: 2 },
      errors
    ),
  ];

  for (const summary of summaries) {
    console.log(
      `${summary.name}: ${summary.found} catalog entries; ${summary.expected} required; ${formatMiB(summary.bytes)}`
    );
  }

  const totalBytes = summaries.reduce((total, summary) => total + summary.bytes, 0);
  console.log(`Total referenced payload/database/font bytes: ${formatMiB(totalBytes)}`);

  if (errors.length > 0) {
    console.error(`\nDownload pack audit failed with ${errors.length} issue(s):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log('\nDownload pack audit passed.');
}

main();
