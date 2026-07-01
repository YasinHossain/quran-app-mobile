const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');

const API_BASE_URL = 'https://api.quran.com/api/v4';
const DEFAULT_OUTPUT_DIR = path.join(__dirname, '..', 'dist', 'mushaf-packs');
const REQUEST_DELAY_MS = 80;
const PAGE_WORD_FIELDS = [
  'verse_key',
  'verse_id',
  'page_number',
  'line_number',
  'location',
  'text_uthmani',
  'text_indopak',
  'text_qpc_hafs',
  'code_v1',
  'code_v2',
  'char_type_name',
];
const PAGE_FIELDS = [
  'chapter_id',
  'hizb_number',
  'rub_el_hizb_number',
  'text_uthmani',
  'text_indopak',
  'text_uthmani_tajweed',
];

const PACKS = {
  'qcf-madani-v1': {
    packId: 'qcf-madani-v1',
    version: 'v1',
    renderer: 'webview',
    script: 'uthmani',
    lines: 15,
    totalPages: 604,
    apiMushafId: 1,
    qcfVersion: 'v1',
    sourceLabel: 'Quran.com official page-data API and Quran Foundation font CDN',
    pageFontBaseUrl: 'https://verses.quran.foundation/fonts/quran/hafs/v1/woff2',
  },
  'qcf-madani-v2': {
    packId: 'qcf-madani-v2',
    version: 'v2',
    renderer: 'webview',
    script: 'uthmani',
    lines: 15,
    totalPages: 604,
    apiMushafId: 1,
    qcfVersion: 'v2',
    sourceLabel: 'Quran.com official page-data API and Quran Foundation font CDN',
    pageFontBaseUrl: 'https://verses.quran.foundation/fonts/quran/hafs/v2/woff2',
  },
};

function parseArgs(argv) {
  const options = {
    outputDir: DEFAULT_OUTPUT_DIR,
    packIds: ['qcf-madani-v1'],
    versionByPackId: new Map(),
    baseUrl: null,
  };

  for (const arg of argv) {
    if (arg.startsWith('--packs=')) {
      const value = arg.slice('--packs='.length);
      const packIds = value
        .split(',')
        .map((part) => part.trim())
        .filter((packId) => Boolean(PACKS[packId]));
      if (packIds.length > 0) {
        options.packIds = Array.from(new Set(packIds));
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
      if (value) {
        for (const packId of Object.keys(PACKS)) {
          options.versionByPackId.set(packId, value);
        }
      }
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

function requestBuffer(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            accept: '*/*',
            'x-client': 'quran-app-mobile-mushaf-pack-generator',
          },
        },
        (response) => {
          const chunks = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () => {
            const body = Buffer.concat(chunks);
            if ((response.statusCode ?? 500) >= 400) {
              reject(
                new Error(`Request failed for ${url}: ${response.statusCode}\n${body.toString('utf8', 0, 400)}`)
              );
              return;
            }
            resolve(body);
          });
        }
      )
      .on('error', reject);
  });
}

async function fetchJson(url) {
  const body = await requestBuffer(url);
  return JSON.parse(body.toString('utf8'));
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

function writeJsonFile(filePath, value, pretty = false) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, pretty ? `${JSON.stringify(value, null, 2)}\n` : JSON.stringify(value));
}

function writeBufferFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function mapWord(word) {
  return {
    id: word.id,
    verseKey: word.verse_key ?? undefined,
    pageNumber: typeof word.page_number === 'number' ? word.page_number : undefined,
    lineNumber: typeof word.line_number === 'number' ? word.line_number : undefined,
    position: word.position,
    charType: word.char_type_name ?? undefined,
    location: word.location ?? undefined,
    textUthmani: word.text_uthmani ?? undefined,
    textQpcHafs: word.text_qpc_hafs ?? undefined,
    textIndopak: word.text_indopak ?? undefined,
    codeV1: word.code_v1 ?? undefined,
    codeV2: word.code_v2 ?? undefined,
  };
}

function mapVerse(verse) {
  return {
    id: verse.id,
    verseKey: verse.verse_key,
    chapterId: verse.chapter_id ?? undefined,
    pageNumber: verse.page_number,
    juzNumber: verse.juz_number ?? undefined,
    hizbNumber: verse.hizb_number ?? undefined,
    rubElHizbNumber: verse.rub_el_hizb_number ?? undefined,
    textUthmani: verse.text_uthmani ?? undefined,
    textIndopak: verse.text_indopak ?? undefined,
    textUthmaniTajweed: verse.text_uthmani_tajweed ?? undefined,
    words: Array.isArray(verse.words) ? verse.words.map(mapWord) : [],
  };
}

function buildPageUrl(pack, pageNumber) {
  return buildApiUrl(`/verses/by_page/${pageNumber}`, {
    words: 'true',
    per_page: 'all',
    filter_page_words: 'true',
    word_fields: PAGE_WORD_FIELDS.join(','),
    fields: PAGE_FIELDS.join(','),
    mushaf: String(pack.apiMushafId),
  });
}

async function fetchPage(pack, pageNumber) {
  const response = await fetchJson(buildPageUrl(pack, pageNumber));
  const verses = Array.isArray(response.verses) ? response.verses.map(mapVerse) : [];
  const firstVerseKey = verses[0]?.verseKey ?? '';
  const lastVerseKey = verses[verses.length - 1]?.verseKey ?? '';

  return {
    pageNumber,
    lookup: {
      from: firstVerseKey,
      to: lastVerseKey,
      firstVerseKey,
      lastVerseKey,
    },
    verses,
  };
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

async function generatePack({ pack, version, outputDir, baseUrl }) {
  const relativeDir = path.join('mushafs', pack.packId, version);
  const absoluteDir = path.join(outputDir, relativeDir);
  const lookupRelativePath = 'page-data/lookup.json';
  const generatedAt = new Date().toISOString();
  const lookup = {};
  const assetFiles = [];

  console.log(`Generating mushaf pack ${pack.packId} (${version})`);

  for (let pageNumber = 1; pageNumber <= pack.totalPages; pageNumber += 1) {
    console.log(`  Page ${pageNumber}/${pack.totalPages}`);
    const page = await fetchPage(pack, pageNumber);
    lookup[String(pageNumber)] = page.lookup;

    const relativePath = `page-data/pages/${pageNumber}.json`;
    const filePath = path.join(absoluteDir, relativePath);
    writeJsonFile(filePath, {
      packId: pack.packId,
      version,
      pageNumber,
      verses: page.verses,
    });

    assetFiles.push({
      file: relativePath,
      checksum: computeMd5(filePath),
      sizeBytes: fs.statSync(filePath).size,
    });

    await sleep(REQUEST_DELAY_MS);
  }

  const lookupPath = path.join(absoluteDir, lookupRelativePath);
  writeJsonFile(lookupPath, {
    packId: pack.packId,
    version,
    totalPages: pack.totalPages,
    lookup,
  });

  if (pack.pageFontBaseUrl) {
    for (let pageNumber = 1; pageNumber <= pack.totalPages; pageNumber += 1) {
      console.log(`  Font ${pageNumber}/${pack.totalPages}`);
      const relativePath = `fonts/p${pageNumber}.woff2`;
      const filePath = path.join(absoluteDir, relativePath);
      const fontUrl = `${pack.pageFontBaseUrl}/p${pageNumber}.woff2`;
      writeBufferFile(filePath, await requestBuffer(fontUrl));
      assetFiles.push({
        file: relativePath,
        checksum: computeMd5(filePath),
        sizeBytes: fs.statSync(filePath).size,
      });
    }
  }

  const manifest = {
    packId: pack.packId,
    version,
    channel: 'download',
    renderer: pack.renderer,
    script: pack.script,
    lines: pack.lines,
    totalPages: pack.totalPages,
    bundled: false,
    payloadFile: lookupRelativePath,
    payloadChecksum: computeMd5(lookupPath),
    payloadSizeBytes: fs.statSync(lookupPath).size,
    localPayload: {
      format: 'page-json-v1',
      lookupFile: lookupRelativePath,
      pagesDirectory: 'page-data/pages',
    },
    assetFiles,
    generatedAt,
    source: [
      `${API_BASE_URL}/verses/by_page/{pageNumber}?mushaf=${pack.apiMushafId}`,
      pack.pageFontBaseUrl,
    ]
      .filter(Boolean)
      .join(' | '),
  };

  const manifestPath = path.join(absoluteDir, 'manifest.json');
  writeJsonFile(manifestPath, manifest, true);

  return {
    packId: pack.packId,
    version,
    renderer: pack.renderer,
    script: pack.script,
    lines: pack.lines,
    totalPages: pack.totalPages,
    downloadUrl: toCatalogUrl(path.posix.join(relativeDir.replace(/\\/g, '/'), lookupRelativePath), baseUrl),
    checksum: manifest.payloadChecksum,
    sizeBytes: manifest.payloadSizeBytes,
    manifestUrl: toCatalogUrl(path.posix.join(relativeDir.replace(/\\/g, '/'), 'manifest.json'), baseUrl),
    manifestChecksum: computeMd5(manifestPath),
    manifestSizeBytes: fs.statSync(manifestPath).size,
    compatibility: {
      qcfVersion: pack.qcfVersion,
      sourceLabel: pack.sourceLabel,
    },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.outputDir, { recursive: true });

  const existingCatalog = readExistingCatalog(options.outputDir);
  const generatedEntries = [];

  for (const packId of options.packIds) {
    const pack = PACKS[packId];
    const version = options.versionByPackId.get(packId) ?? pack.version;
    generatedEntries.push(
      await generatePack({
        pack,
        version,
        outputDir: options.outputDir,
        baseUrl: options.baseUrl,
      })
    );
  }

  const mergedByKey = new Map();
  for (const existing of existingCatalog.packs) {
    const key = `${existing.packId}:${existing.version}`;
    mergedByKey.set(key, existing);
  }
  for (const entry of generatedEntries) {
    const key = `${entry.packId}:${entry.version}`;
    mergedByKey.set(key, entry);
  }

  const catalog = {
    generatedAt: new Date().toISOString(),
    packs: Array.from(mergedByKey.values()).sort((left, right) => {
      if (String(left.packId) !== String(right.packId)) {
        return String(left.packId).localeCompare(String(right.packId));
      }
      return String(left.version).localeCompare(String(right.version));
    }),
  };

  writeJsonFile(path.join(options.outputDir, 'catalog.json'), catalog, true);
  console.log(`Wrote catalog: ${path.join(options.outputDir, 'catalog.json')}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
