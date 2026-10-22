const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');

const TOTAL_SURAHS = 114;
const PER_PAGE = 300;
const REQUEST_DELAY_MS = 200;
const API_BASE_URL = 'https://api.quran.com/api/v4';
const DEFAULT_OUTPUT_DIR = path.join(__dirname, '..', 'dist', 'word-translation-packs');

const WORD_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'bn', name: 'Bangla' },
  { code: 'ur', name: 'Urdu' },
  { code: 'hi', name: 'Hindi' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'fa', name: 'Persian' },
  { code: 'tr', name: 'Turkish' },
  { code: 'ta', name: 'Tamil' },
];

function parseArgs(argv) {
  const options = {
    outputDir: DEFAULT_OUTPUT_DIR,
    languages: WORD_LANGUAGES.map((item) => item.code),
    version: new Date().toISOString().slice(0, 10),
    baseUrl: null,
  };

  for (const arg of argv) {
    if (arg.startsWith('--languages=')) {
      const value = arg.slice('--languages='.length);
      const codes = value
        .split(',')
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean);
      if (codes.length > 0) options.languages = Array.from(new Set(codes));
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
      if (value) options.baseUrl = value.endsWith('/') ? value : `${value}/`;
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
            'x-client': 'quran-app-mobile-word-pack-generator',
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
    if (typeof value === 'string' && value.length > 0) url.searchParams.set(key, value);
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

function writeJsonFile(filePath, value, pretty = false) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, pretty ? `${JSON.stringify(value, null, 2)}\n` : JSON.stringify(value));
}

function readExistingCatalog(outputDir) {
  const catalogPath = path.join(outputDir, 'catalog.json');
  if (!fs.existsSync(catalogPath)) return { generatedAt: undefined, packs: [] };

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

function normalizeWord(word) {
  const uthmani = String(word.text_uthmani ?? word.text ?? '').trim();
  if (!uthmani) return null;

  const normalized = {
    id: Number(word.id),
    uthmani,
  };

  const translationText = String(word.translation?.text ?? '').trim();
  if (translationText) normalized.translationText = translationText;
  if (typeof word.char_type_name === 'string') normalized.charTypeName = word.char_type_name;
  if (typeof word.position === 'number') normalized.position = word.position;
  if (typeof word.code_v2 === 'string' && word.code_v2.trim()) normalized.codeV2 = word.code_v2;
  if (typeof word.page_number === 'number' && Number.isFinite(word.page_number)) {
    normalized.pageNumber = word.page_number;
  }

  return normalized;
}

async function fetchWordVerses(languageCode) {
  const verses = [];

  for (let surahId = 1; surahId <= TOTAL_SURAHS; surahId += 1) {
    console.log(`  ${languageCode}: Surah ${surahId}/${TOTAL_SURAHS}`);
    const response = await fetchJson(
      buildApiUrl(`/verses/by_chapter/${surahId}`, {
        language: languageCode,
        words: 'true',
        word_fields: 'text_uthmani,char_type_name,position,code_v2,page_number',
        word_translation_language: languageCode,
        fields: 'text_uthmani',
        per_page: String(PER_PAGE),
        page: '1',
      })
    );

    for (const verse of response.verses ?? []) {
      const verseKey = String(verse.verse_key ?? '').trim();
      const ayahNumber = Number.parseInt(String(verse.verse_number ?? 0), 10);
      const arabicUthmani = String(verse.text_uthmani ?? '').trim();
      const words = Array.isArray(verse.words)
        ? verse.words.map(normalizeWord).filter((word) => word !== null)
        : [];

      if (!verseKey || !Number.isFinite(ayahNumber) || ayahNumber <= 0 || !arabicUthmani || words.length === 0) {
        continue;
      }

      verses.push({ verseKey, surahId, ayahNumber, arabicUthmani, words });
    }

    await sleep(REQUEST_DELAY_MS);
  }

  return verses;
}

async function generatePack({ languageCode, version, outputDir, baseUrl }) {
  const language = WORD_LANGUAGES.find((item) => item.code === languageCode);
  const name = language?.name || languageCode;

  console.log(`Generating word translation pack ${languageCode} (${name})`);
  const verses = await fetchWordVerses(languageCode);
  if (verses.length === 0) throw new Error(`No verses found for word language ${languageCode}`);

  const relativeDir = path.join('languages', languageCode, version);
  const absoluteDir = path.join(outputDir, relativeDir);
  const manifestPath = path.join(absoluteDir, 'manifest.json');
  const payloadPath = path.join(absoluteDir, 'payload.json');

  const payload = {
    languageCode,
    version,
    format: 'word-translation-json-v1',
    verses,
  };

  writeJsonFile(payloadPath, payload, false);

  const payloadSizeBytes = fs.statSync(payloadPath).size;
  const payloadChecksum = computeMd5(payloadPath);

  const manifest = {
    languageCode,
    name,
    version,
    bundled: false,
    format: 'word-translation-json-v1',
    payloadFile: 'payload.json',
    payloadChecksum,
    payloadSizeBytes,
    totalVerses: verses.length,
    generatedAt: new Date().toISOString(),
    source: `${API_BASE_URL}/verses/by_chapter/{surahId}?words=true&word_translation_language=${languageCode}`,
  };

  writeJsonFile(manifestPath, manifest, true);

  const manifestSizeBytes = fs.statSync(manifestPath).size;
  const manifestChecksum = computeMd5(manifestPath);

  return {
    languageCode,
    name,
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
  const generatedEntries = [];

  for (const languageCode of options.languages) {
    const entry = await generatePack({
      languageCode,
      version: options.version,
      outputDir: options.outputDir,
      baseUrl: options.baseUrl,
    });
    generatedEntries.push(entry);
  }

  const mergedByKey = new Map();
  for (const existing of existingCatalog.packs) {
    const key = `${existing.languageCode}:${existing.version}`;
    mergedByKey.set(key, existing);
  }
  for (const entry of generatedEntries) {
    const key = `${entry.languageCode}:${entry.version}`;
    mergedByKey.set(key, entry);
  }

  const catalog = {
    generatedAt: new Date().toISOString(),
    packs: Array.from(mergedByKey.values()).sort((left, right) => {
      return String(left.languageCode).localeCompare(String(right.languageCode));
    }),
  };

  writeJsonFile(path.join(options.outputDir, 'catalog.json'), catalog, true);
  console.log(`Wrote catalog: ${path.join(options.outputDir, 'catalog.json')}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
