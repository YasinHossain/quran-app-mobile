const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');

const TOTAL_SURAHS = 114;
const PER_PAGE = 300;
const REQUEST_DELAY_MS = 200;
const API_BASE_URL = 'https://api.quran.com/api/v4';
const DEFAULT_OUTPUT_DIR = path.join(__dirname, '..', 'dist', 'translation-packs');

function parseArgs(argv) {
  const options = {
    outputDir: DEFAULT_OUTPUT_DIR,
    translationIds: [20],
    version: new Date().toISOString().slice(0, 10),
    baseUrl: null,
  };

  for (const arg of argv) {
    if (arg.startsWith('--translations=')) {
      const value = arg.slice('--translations='.length);
      const ids = value
        .split(',')
        .map((part) => Number.parseInt(part.trim(), 10))
        .filter((id) => Number.isFinite(id) && id > 0);
      if (ids.length > 0) {
        options.translationIds = Array.from(new Set(ids));
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
            'x-client': 'quran-app-mobile-translation-pack-generator',
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

function stripHtml(input) {
  return String(input ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
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

async function loadTranslationResources() {
  const response = await fetchJson(
    buildApiUrl('/resources/translations', {
      language: 'en',
    })
  );

  const byId = new Map();
  for (const translation of response.translations ?? []) {
    const id = Number.parseInt(String(translation.id), 10);
    if (!Number.isFinite(id) || id <= 0) continue;
    byId.set(id, {
      id,
      name: String(translation.translated_name?.name ?? translation.name ?? '').trim(),
      authorName: String(translation.author_name ?? '').trim(),
      languageName: String(translation.language_name ?? '').trim() || 'Unknown',
    });
  }

  return byId;
}

async function fetchTranslationVerses(translationId) {
  const verses = [];

  for (let surahId = 1; surahId <= TOTAL_SURAHS; surahId += 1) {
    console.log(`  Surah ${surahId}/${TOTAL_SURAHS}`);
    const response = await fetchJson(
      buildApiUrl(`/verses/by_chapter/${surahId}`, {
        language: 'en',
        words: 'false',
        translations: String(translationId),
        fields: 'text_uthmani',
        per_page: String(PER_PAGE),
        page: '1',
      })
    );

    for (const verse of response.verses ?? []) {
      const translations = Array.isArray(verse.translations) ? verse.translations : [];
      const matching = translations.find((item) => Number(item.resource_id) === translationId);
      const text = stripHtml(matching?.text ?? translations[0]?.text ?? '');
      const verseKey = String(verse.verse_key ?? '').trim();
      const ayahNumber = Number.parseInt(String(verse.verse_number ?? 0), 10);
      const arabicUthmani = String(verse.text_uthmani ?? '').trim();

      if (!verseKey || !Number.isFinite(ayahNumber) || ayahNumber <= 0 || !arabicUthmani) {
        continue;
      }

      verses.push({
        verseKey,
        surahId,
        ayahNumber,
        arabicUthmani,
        text,
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
  translationId,
  version,
  outputDir,
  baseUrl,
  resourceById,
}) {
  const resource = resourceById.get(translationId);
  const name = resource?.name || `Translation ${translationId}`;
  const authorName = resource?.authorName || 'Unknown';
  const languageName = resource?.languageName || 'Unknown';

  console.log(`Generating translation pack ${translationId} (${name})`);
  const verses = await fetchTranslationVerses(translationId);
  if (verses.length === 0) {
    throw new Error(`No verses found for translation ${translationId}`);
  }

  const relativeDir = path.join('translations', String(translationId), version);
  const absoluteDir = path.join(outputDir, relativeDir);
  const manifestPath = path.join(absoluteDir, 'manifest.json');
  const payloadPath = path.join(absoluteDir, 'payload.json');

  const payload = {
    translationId,
    version,
    format: 'translation-json-v1',
    verses,
  };

  writeJsonFile(payloadPath, payload, false);

  const payloadSizeBytes = fs.statSync(payloadPath).size;
  const payloadChecksum = computeMd5(payloadPath);

  const manifest = {
    translationId,
    name,
    authorName,
    languageName,
    version,
    bundled: false,
    format: 'translation-json-v1',
    payloadFile: 'payload.json',
    payloadChecksum,
    payloadSizeBytes,
    totalVerses: verses.length,
    generatedAt: new Date().toISOString(),
    source: `${API_BASE_URL}/verses/by_chapter/{surahId}?translations=${translationId}&per_page=${PER_PAGE}`,
  };

  writeJsonFile(manifestPath, manifest, true);

  const manifestSizeBytes = fs.statSync(manifestPath).size;
  const manifestChecksum = computeMd5(manifestPath);

  return {
    translationId,
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
  const resourceById = await loadTranslationResources();
  const generatedEntries = [];

  for (const translationId of options.translationIds) {
    const entry = await generatePack({
      translationId,
      version: options.version,
      outputDir: options.outputDir,
      baseUrl: options.baseUrl,
      resourceById,
    });
    generatedEntries.push(entry);
  }

  const mergedByKey = new Map();
  for (const existing of existingCatalog.packs) {
    const key = `${existing.translationId}:${existing.version}`;
    mergedByKey.set(key, existing);
  }
  for (const entry of generatedEntries) {
    const key = `${entry.translationId}:${entry.version}`;
    mergedByKey.set(key, entry);
  }

  const catalog = {
    generatedAt: new Date().toISOString(),
    packs: Array.from(mergedByKey.values()).sort((left, right) => {
      if (left.languageName !== right.languageName) {
        return String(left.languageName).localeCompare(String(right.languageName));
      }
      return Number(left.translationId) - Number(right.translationId);
    }),
  };

  writeJsonFile(path.join(options.outputDir, 'catalog.json'), catalog, true);

  console.log(`Wrote catalog: ${path.join(options.outputDir, 'catalog.json')}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
