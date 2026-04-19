const fs = require('fs');
const path = require('path');
const https = require('https');

const TOTAL_PAGES = 604;
const CONCURRENCY = 6;
const OUTPUT_DIR = path.join(
  __dirname,
  '..',
  'src',
  'data',
  'mushaf',
  'packs',
  'unicode-uthmani-v1'
);
const MANIFEST_PATH = path.join(OUTPUT_DIR, 'manifest.json');
const PAYLOAD_PATH = path.join(OUTPUT_DIR, 'payload.json');
const API_BASE_URL = 'https://api.quran.com/api/v4/verses/by_page';
const WORD_FIELDS = [
  'verse_key',
  'verse_id',
  'page_number',
  'line_number',
  'location',
  'text_uthmani',
  'text_indopak',
  'char_type_name',
];

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            accept: 'application/json',
            'x-client': 'quran-app-mobile-bundled-unicode-pack-generator',
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

function buildPageUrl(pageNumber) {
  const url = new URL(`${API_BASE_URL}/${pageNumber}`);
  url.searchParams.set('words', 'true');
  url.searchParams.set('per_page', 'all');
  url.searchParams.set('filter_page_words', 'true');
  url.searchParams.set('word_fields', WORD_FIELDS.join(','));
  url.searchParams.set('fields', 'chapter_id,hizb_number,rub_el_hizb_number,text_uthmani');
  url.searchParams.set('mushaf', '2');
  return url.toString();
}

function mapWord(word) {
  return {
    id: word.id,
    verseKey: word.verse_key,
    pageNumber: word.page_number,
    lineNumber: word.line_number,
    position: word.position,
    charType: word.char_type_name,
    location: word.location,
    textUthmani: word.text_uthmani,
    textIndopak: word.text_indopak,
  };
}

function mapVerse(verse) {
  return {
    id: verse.id,
    verseKey: verse.verse_key,
    chapterId: verse.chapter_id,
    pageNumber: verse.page_number,
    juzNumber: verse.juz_number,
    hizbNumber: verse.hizb_number,
    rubElHizbNumber: verse.rub_el_hizb_number,
    textUthmani: verse.text_uthmani,
    words: Array.isArray(verse.words) ? verse.words.map(mapWord) : [],
  };
}

async function fetchPage(pageNumber) {
  const data = await fetchJson(buildPageUrl(pageNumber));
  const verses = Array.isArray(data?.verses) ? data.verses.map(mapVerse) : [];
  const firstVerseKey = verses[0]?.verseKey ?? '';
  const lastVerseKey = verses[verses.length - 1]?.verseKey ?? '';

  return {
    pageNumber,
    verses,
    lookup: {
      from: firstVerseKey,
      to: lastVerseKey,
      firstVerseKey,
      lastVerseKey,
    },
  };
}

async function runPool(items, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runWorker() {
    while (cursor < items.length) {
      const currentIndex = cursor++;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, runWorker));
  return results;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const pageNumbers = Array.from({ length: TOTAL_PAGES }, (_, index) => index + 1);
  const pages = await runPool(pageNumbers, async (pageNumber) => {
    console.log(`Fetching page ${pageNumber}/${TOTAL_PAGES}`);
    return fetchPage(pageNumber);
  });

  const payload = {
    packId: 'unicode-uthmani-v1',
    version: 'v1',
    totalPages: TOTAL_PAGES,
    lookup: Object.fromEntries(
      pages.map((page) => [String(page.pageNumber), page.lookup])
    ),
    pages: Object.fromEntries(
      pages.map((page) => [String(page.pageNumber), page.verses])
    ),
  };

  const manifest = {
    packId: 'unicode-uthmani-v1',
    version: 'v1',
    channel: 'bundled',
    renderer: 'text',
    script: 'uthmani',
    lines: 15,
    totalPages: TOTAL_PAGES,
    bundled: true,
    payloadFile: 'payload.json',
    generatedAt: new Date().toISOString(),
    source: 'https://api.quran.com/api/v4/verses/by_page?mushaf=2',
  };

  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(PAYLOAD_PATH, JSON.stringify(payload));

  console.log(`Wrote ${MANIFEST_PATH}`);
  console.log(`Wrote ${PAYLOAD_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
