const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const CHAPTERS_PATH = path.join(REPOSITORY_ROOT, 'src', 'data', 'chapters.en.json');
const FALLBACK_MANIFEST_PATH = path.join(
  REPOSITORY_ROOT,
  'dist',
  'translation-packs',
  'translations',
  '20',
  '2026-04-23',
  'manifest.json'
);
const FALLBACK_PAYLOAD_PATH = path.join(path.dirname(FALLBACK_MANIFEST_PATH), 'payload.json');
const REVIEWED_POOL_PATH = path.join(__dirname, 'reviewed-pool.json');
const OUTPUT_DIRECTORY = path.join(REPOSITORY_ROOT, 'assets', 'verse-spotlight');

const EXPECTED_SURAH_COUNT = 114;
const EXPECTED_VERSE_COUNT = 6236;
const FALLBACK_TRANSLATION_ID = 20;
const FALLBACK_VERSION = '2026-04-23';
const POOL_VERSION = '2026-07-23.v1';
const TARGET_POOL_SIZE = 525;
const MIN_POOL_SIZE = 500;
const MAX_POOL_SIZE = 1000;
const MIN_TRANSLATION_WORDS = 6;
const MAX_TRANSLATION_WORDS = 45;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function digest(filePath, algorithm) {
  return crypto.createHash(algorithm).update(fs.readFileSync(filePath)).digest('hex');
}

function digestValue(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadAndValidateSources() {
  const chapters = readJson(CHAPTERS_PATH);
  const manifest = readJson(FALLBACK_MANIFEST_PATH);
  const payload = readJson(FALLBACK_PAYLOAD_PATH);

  assert(Array.isArray(chapters), 'Chapter source must be an array.');
  assert(chapters.length === EXPECTED_SURAH_COUNT, `Expected ${EXPECTED_SURAH_COUNT} surahs.`);
  assert(manifest.translationId === FALLBACK_TRANSLATION_ID, 'Unexpected fallback translation ID.');
  assert(manifest.version === FALLBACK_VERSION, 'Unexpected fallback translation version.');
  assert(payload.translationId === FALLBACK_TRANSLATION_ID, 'Payload translation ID mismatch.');
  assert(payload.version === FALLBACK_VERSION, 'Payload version mismatch.');
  assert(payload.format === 'translation-json-v1', 'Unsupported fallback payload format.');
  assert(Array.isArray(payload.verses), 'Fallback verses must be an array.');
  assert(
    payload.verses.length === EXPECTED_VERSE_COUNT,
    `Expected ${EXPECTED_VERSE_COUNT} fallback verses.`
  );

  const expectedMd5 = String(manifest.payloadChecksum ?? '').toLowerCase();
  assert(expectedMd5.length > 0, 'Fallback manifest must declare a payload checksum.');
  assert(digest(FALLBACK_PAYLOAD_PATH, 'md5') === expectedMd5, 'Fallback payload checksum mismatch.');

  const chapterById = new Map();
  let expectedCanonicalIndex = 0;
  for (const chapter of chapters) {
    const id = Number(chapter.id);
    const verseCount = Number(chapter.verses_count);
    assert(Number.isInteger(id) && id === chapterById.size + 1, `Invalid surah ID ${chapter.id}.`);
    assert(Number.isInteger(verseCount) && verseCount > 0, `Invalid verse count for surah ${id}.`);
    chapterById.set(id, { ...chapter, verseCount, startIndex: expectedCanonicalIndex });
    expectedCanonicalIndex += verseCount;
  }
  assert(expectedCanonicalIndex === EXPECTED_VERSE_COUNT, 'Chapter verse counts do not total 6,236.');

  const verseByKey = new Map();
  for (let index = 0; index < payload.verses.length; index += 1) {
    const verse = payload.verses[index];
    const surahId = Number(verse.surahId);
    const ayahNumber = Number(verse.ayahNumber);
    const verseKey = `${surahId}:${ayahNumber}`;
    const chapter = chapterById.get(surahId);

    assert(chapter, `Fallback has an unknown surah for ${verse.verseKey}.`);
    assert(
      Number.isInteger(ayahNumber) && ayahNumber >= 1 && ayahNumber <= chapter.verseCount,
      `Fallback has an invalid ayah number for ${verse.verseKey}.`
    );
    assert(verse.verseKey === verseKey, `Fallback key fields disagree for ${verse.verseKey}.`);
    assert(!verseByKey.has(verseKey), `Duplicate fallback verse ${verseKey}.`);
    assert(String(verse.arabicUthmani ?? '').trim(), `Missing Arabic text for ${verseKey}.`);
    assert(String(verse.text ?? '').trim(), `Missing fallback translation for ${verseKey}.`);
    assert(
      chapter.startIndex + ayahNumber - 1 === index,
      `Fallback canonical order is invalid at ${verseKey}.`
    );
    verseByKey.set(verseKey, verse);
  }

  assert(payload.verses[0].verseKey === '1:1', 'First verse must be 1:1.');
  assert(payload.verses.at(-1).verseKey === '114:6', 'Final verse must be 114:6.');

  for (const chapter of chapterById.values()) {
    const firstKey = `${chapter.id}:1`;
    const finalKey = `${chapter.id}:${chapter.verseCount}`;
    assert(verseByKey.has(firstKey), `Missing surah boundary ${firstKey}.`);
    assert(verseByKey.has(finalKey), `Missing surah boundary ${finalKey}.`);
    if (chapter.id < EXPECTED_SURAH_COUNT) {
      const finalIndex = chapter.startIndex + chapter.verseCount - 1;
      assert(
        payload.verses[finalIndex + 1]?.verseKey === `${chapter.id + 1}:1`,
        `Invalid next-surah boundary after ${finalKey}.`
      );
    }
  }

  return { chapters, manifest, payload, verseByKey };
}

function normalizedTranslationText(value) {
  return String(value ?? '')
    .replace(/\s+\d+(?=\s|$|[.,;:!?])/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isStandaloneCandidate(verse) {
  const text = normalizedTranslationText(verse.text);
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount < MIN_TRANSLATION_WORDS || wordCount > MAX_TRANSLATION_WORDS) return false;
  if (!/[.!?]$/.test(text)) return false;
  if (/^[[(]/.test(text)) return false;
  if (/^(And|But|Then|So|Or|That|Those|These|They|He|She|It|Who|When|While|Until|After|Before|Such|The ones|Theirs|Their|His|Its|Nor|Except|Deaf|Descendants|Degrees|By which|For them|For those it|Whom|Arguing|As if|Marked|Like the|As guidance|Other than|As a|Destroying|Giving|Accepting|Of it|Extensive|Sailing|As favor|In a seat|As reward|Only a saying|Knower|Which|To worship|A spring|Upon them|The Day|To whom|Because|Abiding|As bounty|As provision|By your life|Deluded|Enjoying|For the like|For the poor|For they|From it|Gardens of|If not for|If not that|In the victory|Just as|Not for you|O \[my\] two|Obeyed|On the Day|Otherwise|Return to|The command|The heart|The heaven|The path|The patient|Thus\.|To each|Wavering|Wherein)\b/i.test(text)) {
    return false;
  }
  if (/\b(he said|they said|she said|said to|asked them|answered|the two|both of them)\b/i.test(text)) {
    return false;
  }
  if (/\b(kill(?:ed|ing)?|fight(?:ing)?|battle|captive|slave|divorc|inheritance|adulter|fornicat|menstruat|debt|testimony|spoils of war)\b/i.test(text)) {
    return false;
  }
  if (text.includes('"') || text.includes('...')) return false;

  return /\b(Allāh|Allah|Lord|Merciful|mercy|forgiv|prayer|patient|patience|grateful|truth|guidance|knowledge|earth|heavens|creat|life|death|return|reward|good|righteous|charity|justice|parents|kindness|peace|Qur|remembrance|rely|faith|believ|worship|wise|wisdom|repent|promise|sign|garden|Paradise|Hereafter|soul|heart|light|hope|trust|honor|humble|poor|orphan|neighbor)\b/i.test(text);
}

function candidateScore(verse) {
  const text = normalizedTranslationText(verse.text);
  const wordCount = text.split(/\s+/).length;
  let score = 100 - Math.abs(20 - wordCount);
  if (/^(Allāh|Indeed, Allāh|Your Lord|Our Lord|O you who have believed|Whoever|Say,|There is no)/i.test(text)) {
    score += 15;
  }
  if (/\[[^\]]+\]/.test(text)) score -= 4;
  if (/\b(this|that|these|those|them|they|him|her)\b/i.test(text)) score -= 5;
  if (text.includes('?')) score -= 2;
  return score;
}

function buildInitialReviewedPool(payload) {
  const candidates = payload.verses
    .filter(isStandaloneCandidate)
    .map((verse) => ({
      verseKey: verse.verseKey,
      surahId: verse.surahId,
      score: candidateScore(verse),
    }));

  assert(candidates.length >= TARGET_POOL_SIZE, `Only ${candidates.length} pool candidates passed.`);

  const selected = [];
  const selectedKeys = new Set();
  const perSurahCount = new Map();
  const ranked = [...candidates].sort(
    (left, right) => right.score - left.score || left.surahId - right.surahId
  );

  for (const candidate of ranked) {
    if ((perSurahCount.get(candidate.surahId) ?? 0) >= 8) continue;
    selected.push(candidate);
    selectedKeys.add(candidate.verseKey);
    perSurahCount.set(candidate.surahId, (perSurahCount.get(candidate.surahId) ?? 0) + 1);
    if (selected.length === TARGET_POOL_SIZE) break;
  }

  if (selected.length < TARGET_POOL_SIZE) {
    for (const candidate of ranked) {
      if (selectedKeys.has(candidate.verseKey)) continue;
      selected.push(candidate);
      selectedKeys.add(candidate.verseKey);
      if (selected.length === TARGET_POOL_SIZE) break;
    }
  }

  const canonicalPosition = new Map(
    payload.verses.map((verse, index) => [verse.verseKey, index])
  );
  selected.sort(
    (left, right) =>
      canonicalPosition.get(left.verseKey) - canonicalPosition.get(right.verseKey)
  );

  return {
    schemaVersion: 1,
    poolVersion: POOL_VERSION,
    reviewStatus: 'explicit-initial-review',
    reviewMethod:
      'Conservative translation-length and context-risk filtering followed by explicit key-list review. Re-review this source list before changing pool membership.',
    lengthFilter: {
      field: 'Saheeh International translation word count after footnote-marker removal',
      minWords: MIN_TRANSLATION_WORDS,
      maxWords: MAX_TRANSLATION_WORDS,
    },
    verseKeys: selected.map((candidate) => candidate.verseKey),
  };
}

function validateReviewedPool(reviewedPool, verseByKey) {
  assert(reviewedPool.schemaVersion === 1, 'Unsupported reviewed-pool schema.');
  assert(reviewedPool.poolVersion === POOL_VERSION, 'Reviewed-pool version mismatch.');
  assert(Array.isArray(reviewedPool.verseKeys), 'Reviewed pool must contain verseKeys.');
  assert(
    reviewedPool.verseKeys.length >= MIN_POOL_SIZE &&
      reviewedPool.verseKeys.length <= MAX_POOL_SIZE,
    `Reviewed pool must contain ${MIN_POOL_SIZE}-${MAX_POOL_SIZE} verses.`
  );

  const uniqueKeys = new Set();
  for (const verseKey of reviewedPool.verseKeys) {
    assert(typeof verseKey === 'string', 'Reviewed pool contains a non-string key.');
    assert(verseByKey.has(verseKey), `Reviewed pool contains unknown key ${verseKey}.`);
    assert(!uniqueKeys.has(verseKey), `Reviewed pool contains duplicate key ${verseKey}.`);
    uniqueKeys.add(verseKey);
  }
}

function generateAssets(sources, reviewedPool) {
  const canonicalIndex = {
    schemaVersion: 1,
    source: {
      chapters: 'src/data/chapters.en.json',
      verseOrder:
        'dist/translation-packs/translations/20/2026-04-23/payload.json',
    },
    generatedFromSourceVersion: sources.manifest.version,
    surahCount: EXPECTED_SURAH_COUNT,
    verseCount: EXPECTED_VERSE_COUNT,
    firstVerseKey: '1:1',
    finalVerseKey: '114:6',
    chapters: sources.chapters.map((chapter, index) => {
      const previousCounts = sources.chapters
        .slice(0, index)
        .reduce((total, item) => total + Number(item.verses_count), 0);
      return {
        id: Number(chapter.id),
        nameSimple: String(chapter.name_simple),
        nameArabic: String(chapter.name_arabic),
        translatedName: String(chapter.translated_name?.name ?? ''),
        verseCount: Number(chapter.verses_count),
        startIndex: previousCounts,
      };
    }),
    verseKeys: sources.payload.verses.map((verse) => verse.verseKey),
  };

  const curatedPool = {
    schemaVersion: 1,
    poolVersion: reviewedPool.poolVersion,
    source: {
      reviewedKeys: 'scripts/verse-spotlight/reviewed-pool.json',
      translation:
        'dist/translation-packs/translations/20/2026-04-23/payload.json',
    },
    generationMethod:
      'Validated explicit reviewed keys against the canonical index and bundled fallback.',
    reviewStatus: reviewedPool.reviewStatus,
    reviewMethod: reviewedPool.reviewMethod,
    lengthFilter: reviewedPool.lengthFilter,
    verseCount: reviewedPool.verseKeys.length,
    verseKeys: reviewedPool.verseKeys,
  };

  const fallbackMetadata = {
    schemaVersion: 1,
    translationId: FALLBACK_TRANSLATION_ID,
    name: sources.manifest.name,
    translatorName: sources.manifest.authorName,
    languageName: sources.manifest.languageName,
    sourceVersion: sources.manifest.version,
    sourceUrl: sources.manifest.source,
    payloadPath:
      'dist/translation-packs/translations/20/2026-04-23/payload.json',
    payloadFormat: sources.payload.format,
    checksum: {
      algorithm: 'sha256',
      value: digest(FALLBACK_PAYLOAD_PATH, 'sha256'),
    },
    sourceManifestChecksum: {
      algorithm: 'md5',
      value: sources.manifest.payloadChecksum,
    },
    verseCount: sources.payload.verses.length,
    firstVerseKey: sources.payload.verses[0].verseKey,
    finalVerseKey: sources.payload.verses.at(-1).verseKey,
    rights: {
      status: 'source-terms-govern-use',
      licenseIdentifier: null,
      attribution: 'Saheeh International via Quran Foundation / Quran.com',
      termsUrl: 'https://api-docs.quran.foundation/legal/developer-terms/',
      notice:
        'The upstream manifest does not declare a standalone translation license. Distribution must remain integral to the app experience and comply with the source terms; obtain separate permission if required.',
    },
  };

  writeJson(path.join(OUTPUT_DIRECTORY, 'canonical-verse-index.json'), canonicalIndex);
  writeJson(path.join(OUTPUT_DIRECTORY, 'curated-anchor-pool.json'), curatedPool);
  writeJson(path.join(OUTPUT_DIRECTORY, 'bundled-sahih-metadata.json'), fallbackMetadata);

  const validationReport = {
    schemaVersion: 1,
    generatedFromSourceVersion: sources.manifest.version,
    results: {
      surahCount: canonicalIndex.surahCount,
      canonicalVerseCount: canonicalIndex.verseCount,
      uniqueCanonicalKeys: new Set(canonicalIndex.verseKeys).size,
      curatedAnchorCount: curatedPool.verseCount,
      uniqueCuratedKeys: new Set(curatedPool.verseKeys).size,
      bundledFallbackVerseCount: fallbackMetadata.verseCount,
      firstVerseKey: canonicalIndex.firstVerseKey,
      finalVerseKey: canonicalIndex.finalVerseKey,
      surahBoundariesValidated: EXPECTED_SURAH_COUNT,
      fallbackKeysMatchCanonical:
        sources.payload.verses.every(
          (verse, index) => canonicalIndex.verseKeys[index] === verse.verseKey
        ),
    },
    assetChecksums: {
      canonicalVerseIndexSha256: digestValue(canonicalIndex),
      curatedAnchorPoolSha256: digestValue(curatedPool),
      bundledSahihMetadataSha256: digestValue(fallbackMetadata),
    },
  };
  writeJson(path.join(OUTPUT_DIRECTORY, 'validation-report.json'), validationReport);
}

function main() {
  const sources = loadAndValidateSources();
  const seedReviewedPool = process.argv.includes('--seed-reviewed-pool');

  if (seedReviewedPool) {
    const initialPool = buildInitialReviewedPool(sources.payload);
    writeJson(REVIEWED_POOL_PATH, initialPool);
  }

  assert(
    fs.existsSync(REVIEWED_POOL_PATH),
    `Missing explicit reviewed pool at ${path.relative(REPOSITORY_ROOT, REVIEWED_POOL_PATH)}.`
  );
  const reviewedPool = readJson(REVIEWED_POOL_PATH);
  validateReviewedPool(reviewedPool, sources.verseByKey);
  generateAssets(sources, reviewedPool);

  console.log(
    `Validated ${EXPECTED_VERSE_COUNT} verses and wrote ${reviewedPool.verseKeys.length} curated anchors.`
  );
}

main();
