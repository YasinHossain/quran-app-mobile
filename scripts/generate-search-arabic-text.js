/**
 * Fetches Quran.com's Imlaei (modern standard orthography) verse text and writes the
 * bundled source used to build the offline Arabic search index.
 *
 * The text is only used for matching. Readers and search results always display the
 * Uthmani text, so this file never reaches the screen.
 *
 * Usage: node scripts/generate-search-arabic-text.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const API_BASE_URL = 'https://api.quran.com/api/v4';
const REQUEST_DELAY_MS = 200;
const CHAPTERS_PATH = path.join(__dirname, '..', 'src', 'data', 'chapters.en.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'src', 'data', 'search', 'quran-imlaei.json');
const EXPECTED_VERSE_COUNT = 6236;

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { Accept: 'application/json' } }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`Request failed (${res.statusCode}): ${url}`));
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on('error', reject);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const chapters = JSON.parse(fs.readFileSync(CHAPTERS_PATH, 'utf8'));
  if (chapters.length !== 114) throw new Error(`Expected 114 chapters, found ${chapters.length}`);

  const output = [];
  let total = 0;

  for (const chapter of chapters) {
    const data = await fetchJson(
      `${API_BASE_URL}/quran/verses/imlaei?chapter_number=${chapter.id}`
    );
    const verses = data.verses ?? [];
    if (verses.length !== chapter.verses_count) {
      throw new Error(
        `Surah ${chapter.id}: expected ${chapter.verses_count} verses, received ${verses.length}`
      );
    }

    const texts = verses.map((verse, index) => {
      const expectedKey = `${chapter.id}:${index + 1}`;
      if (verse.verse_key !== expectedKey) {
        throw new Error(`Unexpected verse order: ${verse.verse_key} (expected ${expectedKey})`);
      }
      const text = typeof verse.text_imlaei === 'string' ? verse.text_imlaei.trim() : '';
      if (!text) throw new Error(`Missing Imlaei text for ${expectedKey}`);
      return text;
    });

    output.push(texts);
    total += texts.length;
    process.stdout.write(`\rSurah ${chapter.id}/114`);
    await sleep(REQUEST_DELAY_MS);
  }
  process.stdout.write('\n');

  if (total !== EXPECTED_VERSE_COUNT) {
    throw new Error(`Expected ${EXPECTED_VERSE_COUNT} verses, received ${total}`);
  }

  const payload = {
    format: 'quran-imlaei-v1',
    source: 'Quran.com API v4 /quran/verses/imlaei (Quran Foundation)',
    generatedAt: new Date().toISOString().slice(0, 10),
    verseCount: total,
    chapters: output,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload)}\n`);
  console.log(`Wrote ${total} verses to ${path.relative(process.cwd(), OUTPUT_PATH)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
