const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');

const TOTAL_SURAHS = 114;
const PER_PAGE = 300;
const REQUEST_DELAY_MS = 200;
const API_BASE_URL = 'https://api.quran.com/api/v4';
const DEFAULT_OUTPUT_DIR = path.join(__dirname, '..', 'dist', 'tafsir-packs');

function parseArgs(argv) {
  const options = {
    outputDir: DEFAULT_OUTPUT_DIR,
    tafsirIds: [169],
    version: new Date().toISOString().slice(0, 10),
    baseUrl: null,
  };

  for (const arg of argv) {
    if (arg.startsWith('--tafsirs=')) {
      const value = arg.slice('--tafsirs='.length);
      const ids = value
        .split(',')
        .map((part) => Number.parseInt(part.trim(), 10))
        .filter((id) => Number.isFinite(id) && id > 0);
      if (ids.length > 0) {
        options.tafsirIds = Array.from(new Set(ids));
      }
      continue;
    }

    if (arg.startsWith('--output=')) {
      const value = arg.slice('--output='.length).trim();
      if (value) options.outputDir = path.resolve(process.cwd(), value);
      continue;
    }

    if (arg.startsWith('--version=')) {
      const value = arg.slice('--version='.length).trim();
      if (value) options.version = value;
      continue;
    }

    if (arg.startsWith('--base-url=')) {
      const value = arg.slice('--base-url='.length).trim();
      if (value) {
        options.baseUrl = value.endsWith('/') ? value : `${value}/`;
      }
    }
  }

  return options;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            accept: 'application/json',
            'x-client': 'quran-app-mobile-tafsir-pack-generator',
          },
        },
        (response) => {
          let body = '';
          response.setEncoding('utf8');
          response.on('data', (chunk) => {
            body += chunk;
          });
          response.on('end', () => {
            if ((response.statusCode ?? 500) >= 400) {
              reject(
                new Error(`Request failed for ${url}: ${response.statusCode}\n${body.slice(0, 400)}`)
              );
              return;
            }

            try {
              resolve(JSON.parse(body));
            } catch (error) {
              reject(error);
            }
          });
        }
      )
      .on('error', reject);
  });
}

function buildApiUrl(pathname, searchParams) {
  const url = new URL(pathname.replace(/^\/+/, ''), `${API_BASE_URL}/`);
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'string' && value.length > 0) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function computeMd5(filePath) {
  const hash = crypto.createHash('md5');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function toCatalogUrl(relativePath, baseUrl) {
  const normalizedRelativePath = relativePath.replace(/\\/g, '/');
  if (!baseUrl) return normalizedRelativePath;
  return new URL(normalizedRelativePath, baseUrl).toString();
}

async function loadTafsirResources() {
  const response = await fetchJson(
    buildApiUrl('/resources/tafsirs', {
      per_page: '200',
      page: '1',
    })
  );

  const byId = new Map();
  for (const tafsir of response.tafsirs ?? []) {
    const id = Number.parseInt(String(tafsir.id), 10);
    if (!Number.isFinite(id) || id <= 0) continue;
    byId.set(id, {
      id,
      name: String(tafsir.name ?? '').trim() || `Tafsir ${id}`,
      authorName: String(tafsir.author_name ?? '').trim() || 'Unknown',
      languageName: String(tafsir.language_name ?? '').trim() || 'Unknown',
    });
  }

  return byId;
}

async function fetchTafsirVerses(tafsirId) {
  const verses = [];

  for (let surahId = 1; surahId <= TOTAL_SURAHS; surahId += 1) {
    console.log(`  Surah ${surahId}/${TOTAL_SURAHS}`);
    const response = await fetchJson(
      buildApiUrl(`/tafsirs/${tafsirId}/by_chapter/${surahId}`, {
        per_page: String(PER_PAGE),
        page: '1',
      })
    );

    for (const tafsir of response.tafsirs ?? []) {
      const resourceId = Number.parseInt(String(tafsir.resource_id ?? tafsirId), 10);
      const verseKey = String(tafsir.verse_key ?? '').trim();
      const html = typeof tafsir.text === 'string' ? tafsir.text : String(tafsir.text ?? '');

      if (resourceId !== tafsirId || !verseKey) {
        continue;
      }

      verses.push({
        verseKey,
        html,
      });
    }

    await sleep(REQUEST_DELAY_MS);
  }

  return verses;
}

function writeJsonFile(filePath, value, pretty = false) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, pretty ? `${JSON.stringify(value, null, 2)}\n` : JSON.stringify(value));
}

function readExistingCatalog(outputDir) {
  const catalogPath = path.join(outputDir, 'catalog.json');
  if (!fs.existsSync(catalogPath)) {
    return { generatedAt: undefined, packs: [] };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    return {
      generatedAt: typeof parsed.generatedAt === 'string' ? parsed.generatedAt : undefined,
      packs: Array.isArray(parsed.packs) ? parsed.packs : [],
    };
  } catch (_error) {
    return { generatedAt: undefined, packs: [] };
  }
}

async function generatePack({
  tafsirId,
  version,
  outputDir,
  baseUrl,
  resourceById,
}) {
  const resource = resourceById.get(tafsirId);
  const name = resource?.name || `Tafsir ${tafsirId}`;
  const authorName = resource?.authorName || 'Unknown';
  const languageName = resource?.languageName || 'Unknown';

  console.log(`Generating tafsir pack ${tafsirId} (${name})`);
  const verses = await fetchTafsirVerses(tafsirId);
  if (verses.length === 0) {
    throw new Error(`No verses found for tafsir ${tafsirId}`);
  }

  const relativeDir = path.join('tafsirs', String(tafsirId), version);
  const absoluteDir = path.join(outputDir, relativeDir);
  const manifestPath = path.join(absoluteDir, 'manifest.json');
  const payloadPath = path.join(absoluteDir, 'payload.json');

  const payload = {
    tafsirId,
    version,
    format: 'tafsir-json-v1',
    verses,
  };

  writeJsonFile(payloadPath, payload, false);

  const payloadSizeBytes = fs.statSync(payloadPath).size;
  const payloadChecksum = computeMd5(payloadPath);

  const manifest = {
    tafsirId,
    name,
    authorName,
    languageName,
    version,
    bundled: false,
    format: 'tafsir-json-v1',
    payloadFile: 'payload.json',
    payloadChecksum,
    payloadSizeBytes,
    totalVerses: verses.length,
    generatedAt: new Date().toISOString(),
    source: `${API_BASE_URL}/tafsirs/${tafsirId}/by_chapter/{surahId}?per_page=${PER_PAGE}`,
  };

  writeJsonFile(manifestPath, manifest, true);

  const manifestSizeBytes = fs.statSync(manifestPath).size;
  const manifestChecksum = computeMd5(manifestPath);

  return {
    tafsirId,
    name,
    authorName,
    languageName,
    version,
    downloadUrl: toCatalogUrl(path.posix.join(relativeDir.replace(/\\/g, '/'), 'payload.json'), baseUrl),
    checksum: payloadChecksum,
    sizeBytes: payloadSizeBytes,
    totalVerses: verses.length,
    manifestUrl: toCatalogUrl(path.posix.join(relativeDir.replace(/\\/g, '/'), 'manifest.json'), baseUrl),
    manifestChecksum,
    manifestSizeBytes,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.outputDir, { recursive: true });

  const existingCatalog = readExistingCatalog(options.outputDir);
  const resourceById = await loadTafsirResources();
  const generatedEntries = [];

  for (const tafsirId of options.tafsirIds) {
    const entry = await generatePack({
      tafsirId,
      version: options.version,
      outputDir: options.outputDir,
      baseUrl: options.baseUrl,
      resourceById,
    });
    generatedEntries.push(entry);
  }

  const mergedByKey = new Map();
  for (const existing of existingCatalog.packs) {
    const key = `${existing.tafsirId}:${existing.version}`;
    mergedByKey.set(key, existing);
  }
  for (const entry of generatedEntries) {
    const key = `${entry.tafsirId}:${entry.version}`;
    mergedByKey.set(key, entry);
  }

  const catalog = {
    generatedAt: new Date().toISOString(),
    packs: Array.from(mergedByKey.values()).sort((left, right) => {
      if (left.languageName !== right.languageName) {
        return String(left.languageName).localeCompare(String(right.languageName));
      }
      return Number(left.tafsirId) - Number(right.tafsirId);
    }),
  };

  writeJsonFile(path.join(options.outputDir, 'catalog.json'), catalog, true);

  console.log(`Wrote catalog: ${path.join(options.outputDir, 'catalog.json')}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
