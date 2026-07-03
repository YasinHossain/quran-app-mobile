const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');

const API_BASE_URL = 'https://api.quran.com/api/v4';
const DEFAULT_OUTPUT_DIR = path.join(__dirname, '..', 'dist', 'mushaf-packs');
const DEFAULT_CACHE_DIR = path.join(__dirname, '..', 'dist', '.mushaf-pack-cache');
const ASSETS_FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const REQUEST_DELAY_MS = 80;
const PAGE_FETCH_CONCURRENCY = 6;
const FONT_FETCH_CONCURRENCY = 8;
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
  'qpc-uthmani-hafs': {
    packId: 'qpc-uthmani-hafs',
    version: 'v1',
    renderer: 'webview',
    script: 'uthmani',
    lines: 15,
    totalPages: 604,
    apiMushafId: 5,
    sourceLabel: 'Quran.com official page-data API',
    sharedFontAsset: 'UthmanicHafs1Ver18.ttf',
    sharedFontFile: 'fonts/UthmanicHafs1Ver18.ttf',
  },
  'unicode-indopak-15': {
    packId: 'unicode-indopak-15',
    version: 'v1',
    renderer: 'webview',
    script: 'indopak',
    lines: 15,
    totalPages: 604,
    apiMushafId: 6,
    sourceLabel: 'Quran.com official page-data API',
    sharedFontAsset: 'indopak-nastaleeq-waqf-lazim-v4.2.1.ttf',
    sharedFontFile: 'fonts/indopak-nastaleeq-waqf-lazim-v4.2.1.ttf',
  },
  'unicode-indopak-16': {
    packId: 'unicode-indopak-16',
    version: 'v1',
    renderer: 'webview',
    script: 'indopak',
    lines: 16,
    totalPages: 604,
    apiMushafId: 7,
    sourceLabel: 'Quran.com official page-data API',
    sharedFontAsset: 'indopak-nastaleeq-waqf-lazim-v4.2.1.ttf',
    sharedFontFile: 'fonts/indopak-nastaleeq-waqf-lazim-v4.2.1.ttf',
  },
  'qcf-tajweed-v4': {
    packId: 'qcf-tajweed-v4',
    version: 'v4-ttf',
    renderer: 'webview',
    script: 'tajweed',
    lines: 15,
    totalPages: 604,
    apiMushafId: 19,
    qcfVersion: 'v4',
    sourceLabel: 'Quran.com official page-data API and Quran Foundation COLRv1 font CDN',
    pageFontBaseUrl: 'https://verses.quran.foundation/fonts/quran/hafs/v4/colrv1/ttf',
    pageFontExtension: 'ttf',
  },
};

function parseArgs(argv) {
  const options = {
    outputDir: DEFAULT_OUTPUT_DIR,
    cacheDir: DEFAULT_CACHE_DIR,
    packIds: ['qcf-madani-v1'],
    versionByPackId: new Map(),
    baseUrl: null,
  };

  for (const arg of argv) {
    if (arg.startsWith('--packs=')) {
      const value = arg.slice('--packs='.length);
      const requestedPackIds =
        value.trim().toLowerCase() === 'all'
          ? Object.keys(PACKS)
          : value.split(',').map((part) => part.trim());
      const packIds = requestedPackIds.filter((packId) => Boolean(PACKS[packId]));
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

    if (arg.startsWith('--cache=')) {
      const value = arg.slice('--cache='.length).trim();
      if (value) options.cacheDir = path.resolve(process.cwd(), value);
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

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeBufferFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

async function runPromisePool(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (true) {
      const currentIndex = cursor;
      cursor += 1;
      if (currentIndex >= items.length) break;

      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(runners);
  return results;
}

function copyFile(sourcePath, destinationPath) {
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
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

function buildLookupFromVerses(verses) {
  const firstVerseKey = verses[0]?.verseKey ?? '';
  const lastVerseKey = verses[verses.length - 1]?.verseKey ?? '';

  return {
    from: firstVerseKey,
    to: lastVerseKey,
    firstVerseKey,
    lastVerseKey,
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

  return {
    pageNumber,
    lookup: buildLookupFromVerses(verses),
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

async function generatePack({ pack, version, outputDir, cacheDir, baseUrl }) {
  const relativeDir = path.join('mushafs', pack.packId, version);
  const absoluteDir = path.join(outputDir, relativeDir);
  const cachePackDir = path.join(cacheDir, pack.packId, version);
  const payloadRelativePath = 'payload.json';
  const generatedAt = new Date().toISOString();
  const lookup = {};
  const pages = {};
  const assetFiles = [];

  console.log(`Generating mushaf pack ${pack.packId} (${version})`);

  const pageNumbers = Array.from({ length: pack.totalPages }, (_value, index) => index + 1);
  const pagePayloads = await runPromisePool(
    pageNumbers,
    PAGE_FETCH_CONCURRENCY,
    async (pageNumber) => {
      const relativePath = `page-data/pages/${pageNumber}.json`;
      const filePath = path.join(cachePackDir, relativePath);
      const legacyFilePath = path.join(absoluteDir, relativePath);
      let page;

      if (fs.existsSync(filePath)) {
        const existingPage = readJsonFile(filePath);
        page = {
          pageNumber,
          lookup: buildLookupFromVerses(Array.isArray(existingPage.verses) ? existingPage.verses : []),
          verses: Array.isArray(existingPage.verses) ? existingPage.verses : [],
        };
        console.log(`  Page ${pageNumber}/${pack.totalPages} cached`);
      } else if (fs.existsSync(legacyFilePath)) {
        const existingPage = readJsonFile(legacyFilePath);
        page = {
          pageNumber,
          lookup: buildLookupFromVerses(Array.isArray(existingPage.verses) ? existingPage.verses : []),
          verses: Array.isArray(existingPage.verses) ? existingPage.verses : [],
        };
        writeJsonFile(filePath, existingPage);
        console.log(`  Page ${pageNumber}/${pack.totalPages} cached`);
      } else {
        console.log(`  Page ${pageNumber}/${pack.totalPages}`);
        page = await fetchPage(pack, pageNumber);
        writeJsonFile(filePath, {
          packId: pack.packId,
          version,
          pageNumber,
          verses: page.verses,
        });
        await sleep(REQUEST_DELAY_MS);
      }

      return {
        pageNumber,
        lookup: page.lookup,
        verses: page.verses,
      };
    }
  );

  for (const page of pagePayloads) {
    lookup[String(page.pageNumber)] = page.lookup;
    pages[String(page.pageNumber)] = page.verses;
  }

  const payloadPath = path.join(absoluteDir, payloadRelativePath);
  fs.rmSync(path.join(absoluteDir, 'page-data'), { recursive: true, force: true });
  writeJsonFile(payloadPath, {
    packId: pack.packId,
    version,
    totalPages: pack.totalPages,
    lookup,
    pages,
  });

  if (pack.pageFontBaseUrl) {
    const fontAssetFiles = await runPromisePool(
      pageNumbers,
      FONT_FETCH_CONCURRENCY,
      async (pageNumber) => {
        const fontExtension = pack.pageFontExtension ?? 'woff2';
        const fontFileName = `p${pageNumber}.${fontExtension}`;
        const relativePath = `fonts/${fontFileName}`;
        const filePath = path.join(absoluteDir, relativePath);

        if (fs.existsSync(filePath)) {
          console.log(`  Font ${pageNumber}/${pack.totalPages} cached`);
        } else {
          console.log(`  Font ${pageNumber}/${pack.totalPages}`);
          const fontUrl = `${pack.pageFontBaseUrl}/${fontFileName}`;
          writeBufferFile(filePath, await requestBuffer(fontUrl));
        }

        return {
          file: relativePath,
          checksum: computeMd5(filePath),
          sizeBytes: fs.statSync(filePath).size,
        };
      }
    );
    assetFiles.push(...fontAssetFiles);
  }

  if (pack.sharedFontAsset && pack.sharedFontFile) {
    const sourcePath = path.join(ASSETS_FONT_DIR, pack.sharedFontAsset);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Missing shared font asset for ${pack.packId}: ${sourcePath}`);
    }

    const relativePath = pack.sharedFontFile;
    const filePath = path.join(absoluteDir, relativePath);
    console.log(`  Font ${pack.sharedFontAsset}`);
    copyFile(sourcePath, filePath);
    assetFiles.push({
      file: relativePath,
      checksum: computeMd5(filePath),
      sizeBytes: fs.statSync(filePath).size,
    });
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
    payloadFile: payloadRelativePath,
    payloadChecksum: computeMd5(payloadPath),
    payloadSizeBytes: fs.statSync(payloadPath).size,
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
    downloadUrl: toCatalogUrl(path.posix.join(relativeDir.replace(/\\/g, '/'), payloadRelativePath), baseUrl),
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
        cacheDir: options.cacheDir,
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
