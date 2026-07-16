const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const COMPILER_VERSION = '1.0.0';
const SCHEMA_VERSION = 1;
const EXPECTED_AYAH_COUNT = 6236;
const EXPECTED_WORD_COUNT = 77429;

const BUCKWALTER_TO_ARABIC = Object.freeze({
  "'": 'ء',
  '>': 'أ',
  '&': 'ؤ',
  '<': 'إ',
  '}': 'ئ',
  A: 'ا',
  b: 'ب',
  p: 'ة',
  t: 'ت',
  v: 'ث',
  j: 'ج',
  H: 'ح',
  x: 'خ',
  d: 'د',
  '*': 'ذ',
  r: 'ر',
  z: 'ز',
  s: 'س',
  $: 'ش',
  S: 'ص',
  D: 'ض',
  T: 'ط',
  Z: 'ظ',
  E: 'ع',
  g: 'غ',
  _: 'ـ',
  f: 'ف',
  q: 'ق',
  k: 'ك',
  l: 'ل',
  m: 'م',
  n: 'ن',
  h: 'ه',
  w: 'و',
  Y: 'ى',
  y: 'ي',
  F: 'ً',
  N: 'ٌ',
  K: 'ٍ',
  a: 'َ',
  u: 'ُ',
  i: 'ِ',
  '~': 'ّ',
  o: 'ْ',
  '^': 'ٓ',
  '#': 'ٔ',
  '`': 'ٰ',
  '{': 'ٱ',
  ':': 'ۜ',
  '@': '۟',
  '"': '۠',
  '[': 'ۢ',
  ';': 'ۣ',
  ',': 'ۥ',
  '.': 'ۦ',
  '!': 'ۨ',
  '-': '۪',
  '+': '۫',
  '%': '۬',
  ']': 'ۭ',
});

function sha256Buffer(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
}

function compareLocationKeys(left, right) {
  const leftParts = left.split(':').map(Number);
  const rightParts = right.split(':').map(Number);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function buckwalterToArabic(value) {
  return Array.from(value, (character) => BUCKWALTER_TO_ARABIC[character] ?? character).join('');
}

function normalizeArabic(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640\s\u200e\u200f]/gu, '')
    .replace(/[ٱأإآ]/gu, 'ا')
    .replace(/ء(?=ا)/gu, '')
    .replace(/ى/gu, 'ي')
    .replace(/ؤ/gu, 'و')
    .replace(/ئ/gu, 'ي')
    .replace(/ة/gu, 'ه');
}

function parseLocation(rawLocation, lineNumber) {
  const match = /^\((\d+):(\d+):(\d+):(\d+)\)$/.exec(rawLocation);
  if (!match) throw new Error(`Invalid morphology location at line ${lineNumber}: ${rawLocation}`);
  const [, surah, ayah, wordPosition, segmentIndex] = match.map(Number);
  if (surah < 1 || surah > 114 || ayah < 1 || wordPosition < 1 || segmentIndex < 1) {
    throw new Error(`Out-of-range morphology location at line ${lineNumber}: ${rawLocation}`);
  }
  return {
    location: `${surah}:${ayah}:${wordPosition}`,
    verseKey: `${surah}:${ayah}`,
    surah,
    ayah,
    wordPosition,
    segmentIndex,
  };
}

function extractFeatureValue(features, key) {
  const token = features.split('|').find((item) => item.startsWith(`${key}:`));
  return token ? token.slice(key.length + 1) : undefined;
}

function parseFeatureList(features) {
  return features.split('|').map((item) => item.trim()).filter(Boolean);
}

function segmentTypeFor(features, segmentCount) {
  const tokens = parseFeatureList(features);
  if (tokens.includes('PREFIX')) return 'prefix';
  if (tokens.includes('SUFFIX')) return 'suffix';
  if (tokens.includes('STEM')) return segmentCount === 1 ? 'whole-word' : 'stem';
  return segmentCount === 1 ? 'whole-word' : 'infix';
}

function structuredFeatures(features, tag) {
  const tokens = parseFeatureList(features);
  const result = {};
  if (tokens.includes('PERF')) result.aspect = 'perfect';
  if (tokens.includes('IMPF')) result.aspect = 'imperfect';
  if (tokens.includes('IMPV')) result.aspect = 'imperative';
  if (tag === 'V') result.voice = tokens.includes('PASS') ? 'passive' : 'active';

  const mood = extractFeatureValue(features, 'MOOD');
  if (mood) result.mood = { IND: 'indicative', SUBJ: 'subjunctive', JUS: 'jussive', ENG: 'energetic' }[mood] ?? mood;

  const agreement = tokens.find((token) => /^[123][MF]?[SDP]$/.test(token));
  if (agreement) {
    result.person = { 1: 'first', 2: 'second', 3: 'third' }[agreement[0]];
    const genderCode = agreement.length === 3 ? agreement[1] : undefined;
    const numberCode = agreement[agreement.length - 1];
    if (genderCode) result.gender = genderCode === 'M' ? 'masculine' : 'feminine';
    result.number = { S: 'singular', D: 'dual', P: 'plural' }[numberCode];
  } else {
    if (tokens.includes('M')) result.gender = 'masculine';
    if (tokens.includes('F')) result.gender = 'feminine';
    if (tokens.includes('S')) result.number = 'singular';
    if (tokens.includes('D')) result.number = 'dual';
    if (tokens.includes('P')) result.number = 'plural';
  }

  if (tokens.includes('NOM')) result.grammaticalCase = 'nominative';
  if (tokens.includes('ACC')) result.grammaticalCase = 'accusative';
  if (tokens.includes('GEN')) result.grammaticalCase = 'genitive';
  if (tokens.includes('DEF')) result.grammaticalState = 'definite';
  if (tokens.includes('INDEF')) result.grammaticalState = 'indefinite';

  const verbForm = extractFeatureValue(features, 'VF');
  const parenthesizedVerbForm = tokens.find((token) => /^\([IVX]+\)$/.test(token));
  if (verbForm) result.verbForm = verbForm;
  else if (parenthesizedVerbForm) result.verbForm = parenthesizedVerbForm.slice(1, -1);
  if (tokens.includes('ACT') && tokens.includes('PCPL')) result.derivation = 'active-participle';
  if (tokens.includes('PASS') && tokens.includes('PCPL')) result.derivation = 'passive-participle';
  if (tokens.includes('VN')) result.derivation = 'verbal-noun';
  result.rawFeatures = tokens;
  return result;
}

function parseMorphologySource(text) {
  const words = new Map();
  const segmentLocations = new Set();
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || line.startsWith('#') || line.startsWith('LOCATION\t')) continue;
    const columns = line.split('\t');
    if (columns.length !== 4) throw new Error(`Expected four tab-separated columns at line ${index + 1}`);
    const [rawLocation, buckwalterForm, tag, features] = columns;
    const parsedLocation = parseLocation(rawLocation, index + 1);
    const uniqueSegmentKey = `${parsedLocation.location}:${parsedLocation.segmentIndex}`;
    if (segmentLocations.has(uniqueSegmentKey)) throw new Error(`Duplicate morphology segment: ${uniqueSegmentKey}`);
    segmentLocations.add(uniqueSegmentKey);

    const segment = {
      ...parsedLocation,
      arabic: buckwalterToArabic(buckwalterForm),
      tag,
      rawFeatures: features,
      lemmaArabic: extractFeatureValue(features, 'LEM')
        ? buckwalterToArabic(extractFeatureValue(features, 'LEM'))
        : undefined,
      rootArabic: extractFeatureValue(features, 'ROOT')
        ? buckwalterToArabic(extractFeatureValue(features, 'ROOT'))
        : undefined,
    };

    const existing = words.get(parsedLocation.location);
    if (existing) {
      existing.segments.push(segment);
    } else {
      words.set(parsedLocation.location, {
        ...parsedLocation,
        segments: [segment],
      });
    }
  }

  for (const word of words.values()) {
    word.segments.sort((left, right) => left.segmentIndex - right.segmentIndex);
    for (let index = 0; index < word.segments.length; index += 1) {
      if (word.segments[index].segmentIndex !== index + 1) {
        throw new Error(`Non-contiguous morphology segments at ${word.location}`);
      }
    }
  }
  return words;
}

function parseCanonicalPayload(payload) {
  if (!payload || !Array.isArray(payload.verses)) throw new Error('Canonical payload must contain a verses array');
  const words = new Map();
  const verses = new Set();
  for (const verse of payload.verses) {
    if (typeof verse.verseKey !== 'string' || !Array.isArray(verse.words)) {
      throw new Error('Canonical payload contains an invalid verse');
    }
    verses.add(verse.verseKey);
    for (const word of verse.words) {
      if (word.charTypeName !== 'word') continue;
      if (!Number.isInteger(word.position) || word.position < 1) {
        throw new Error(`Invalid canonical word position in ${verse.verseKey}`);
      }
      const location = `${verse.verseKey}:${word.position}`;
      if (words.has(location)) throw new Error(`Duplicate canonical word: ${location}`);
      words.set(location, {
        location,
        verseKey: verse.verseKey,
        wordPosition: word.position,
        surfaceUthmani: String(word.uthmani ?? '').trim(),
        gloss: typeof word.translationText === 'string' ? word.translationText.trim() : '',
      });
    }
  }
  return { words, verses };
}

function primarySegment(word) {
  return word.segments.find((segment) => parseFeatureList(segment.rawFeatures).includes('STEM')) ?? word.segments[0];
}

function buildPackData({ morphologyText, canonicalPayload, morphologySource, canonicalSource, expectedAyahs = EXPECTED_AYAH_COUNT, expectedWords = EXPECTED_WORD_COUNT }) {
  const morphologyWords = parseMorphologySource(morphologyText);
  const canonical = parseCanonicalPayload(canonicalPayload);
  const exceptions = [];

  for (const location of canonical.words.keys()) {
    if (!morphologyWords.has(location)) exceptions.push({ type: 'missing-morphology-word', location, disposition: 'unresolved' });
  }
  for (const location of morphologyWords.keys()) {
    if (!canonical.words.has(location)) exceptions.push({ type: 'extra-morphology-word', location, disposition: 'unresolved' });
  }

  const locations = [...canonical.words.keys()].filter((location) => morphologyWords.has(location)).sort(compareLocationKeys);
  const lemmaKeys = new Set();
  const rootKeys = new Set();
  const preparedWords = [];

  for (const location of locations) {
    const canonicalWord = canonical.words.get(location);
    const morphologyWord = morphologyWords.get(location);
    const morphologySurface = morphologyWord.segments.map((segment) => segment.arabic).join('');
    if (normalizeArabic(morphologySurface) !== normalizeArabic(canonicalWord.surfaceUthmani)) {
      exceptions.push({
        type: 'surface-script-variant',
        location,
        morphologySurface,
        canonicalSurface: canonicalWord.surfaceUthmani,
        disposition: 'accepted-canonical-pack-surface-authoritative',
      });
    }

    const primary = primarySegment(morphologyWord);
    const lemmaKey = primary.lemmaArabic ? `${normalizeArabic(primary.lemmaArabic)}\u0000${primary.tag}\u0000${primary.lemmaArabic}` : undefined;
    const rootKey = primary.rootArabic ? `${normalizeArabic(primary.rootArabic)}\u0000${primary.rootArabic}` : undefined;
    if (lemmaKey) lemmaKeys.add(lemmaKey);
    if (rootKey) rootKeys.add(rootKey);
    preparedWords.push({ canonicalWord, morphologyWord, primary, lemmaKey, rootKey });
  }

  const sortedLemmaKeys = [...lemmaKeys].sort();
  const sortedRootKeys = [...rootKeys].sort();
  const lemmaIds = new Map(sortedLemmaKeys.map((key, index) => [key, index + 1]));
  const rootIds = new Map(sortedRootKeys.map((key, index) => [key, index + 1]));
  const lemmaCounts = new Map();
  const rootCounts = new Map();
  const rootLemmaIds = new Map();

  for (const word of preparedWords) {
    if (word.lemmaKey) lemmaCounts.set(word.lemmaKey, (lemmaCounts.get(word.lemmaKey) ?? 0) + 1);
    if (word.rootKey) {
      rootCounts.set(word.rootKey, (rootCounts.get(word.rootKey) ?? 0) + 1);
      if (!rootLemmaIds.has(word.rootKey)) rootLemmaIds.set(word.rootKey, new Set());
      if (word.lemmaKey) rootLemmaIds.get(word.rootKey).add(lemmaIds.get(word.lemmaKey));
    }
  }

  const lemmas = sortedLemmaKeys.map((key) => {
    const [normalized, posCode, arabic] = key.split('\u0000');
    return { id: lemmaIds.get(key), arabic, normalized, posCode, occurrenceCount: lemmaCounts.get(key) };
  });
  const roots = sortedRootKeys.map((key) => {
    const [normalized, arabic] = key.split('\u0000');
    return {
      id: rootIds.get(key),
      arabic,
      normalized,
      occurrenceCount: rootCounts.get(key),
      lemmaCount: rootLemmaIds.get(key)?.size ?? 0,
    };
  });

  const wordAnalyses = preparedWords.map(({ canonicalWord, morphologyWord, primary, lemmaKey, rootKey }) => {
    const features = structuredFeatures(primary.rawFeatures, primary.tag);
    return {
      location: canonicalWord.location,
      verseKey: canonicalWord.verseKey,
      wordPosition: canonicalWord.wordPosition,
      surfaceUthmani: canonicalWord.surfaceUthmani,
      normalizedSurface: normalizeArabic(canonicalWord.surfaceUthmani),
      lemmaId: lemmaKey ? lemmaIds.get(lemmaKey) : null,
      rootId: rootKey ? rootIds.get(rootKey) : null,
      primaryPos: primary.tag || null,
      verbForm: features.verbForm ?? null,
      aspect: features.aspect ?? null,
      mood: features.mood ?? null,
      voice: features.voice ?? null,
      person: features.person ?? null,
      gender: features.gender ?? null,
      number: features.number ?? null,
      grammaticalCase: features.grammaticalCase ?? null,
      grammaticalState: features.grammaticalState ?? null,
      derivation: features.derivation ?? null,
      sourceVersion: morphologySource.version,
      segments: morphologyWord.segments.map((segment) => ({
        location: canonicalWord.location,
        segmentIndex: segment.segmentIndex,
        arabic: segment.arabic,
        segmentType: segmentTypeFor(segment.rawFeatures, morphologyWord.segments.length),
        posCode: segment.tag,
        features: structuredFeatures(segment.rawFeatures, segment.tag),
      })),
      gloss: canonicalWord.gloss,
    };
  });

  const unresolvedExceptions = exceptions.filter((exception) => exception.disposition === 'unresolved');
  const countChecks = {
    ayahs: { expected: expectedAyahs, actual: canonical.verses.size, matches: canonical.verses.size === expectedAyahs },
    canonicalWords: { expected: expectedWords, actual: canonical.words.size, matches: canonical.words.size === expectedWords },
    morphologyWords: { expected: expectedWords, actual: morphologyWords.size, matches: morphologyWords.size === expectedWords },
    alignedWords: { expected: expectedWords, actual: wordAnalyses.length, matches: wordAnalyses.length === expectedWords },
  };

  const data = {
    compilerVersion: COMPILER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    sources: [morphologySource, canonicalSource],
    changeNotices: [
      {
        id: 'qac-sqlite-conversion-v1',
        description: 'Converted verbatim QAC v0.4 annotations from Buckwalter/tabular representation into normalized SQLite tables; annotation values are not corrected.',
      },
      {
        id: 'canonical-surface-v1',
        description: 'Displayed Uthmani surface text and contextual English gloss come from the app canonical offline word pack; QAC surface variants remain represented by morpheme rows and validation exceptions.',
      },
      {
        id: 'derived-counts-v1',
        description: 'Lemma and root occurrence counts and root lemma-family counts are derived from aligned word rows by this compiler.',
      },
    ],
    lemmas,
    roots,
    wordAnalyses,
  };
  const logicalChecksum = sha256Buffer(stableStringify(data));
  const report = {
    format: 'word-study-validation-report-v1',
    compilerVersion: COMPILER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    status: Object.values(countChecks).every((check) => check.matches) && unresolvedExceptions.length === 0 ? 'passed' : 'failed',
    countChecks,
    counts: {
      sourceSegments: [...morphologyWords.values()].reduce((sum, word) => sum + word.segments.length, 0),
      lemmas: lemmas.length,
      roots: roots.length,
      glosses: wordAnalyses.filter((word) => Boolean(word.gloss)).length,
      exceptions: exceptions.length,
      unresolvedExceptions: unresolvedExceptions.length,
    },
    exceptions,
    logicalChecksum,
  };
  return { data, report };
}

function assertReferentialIntegrity(data) {
  const locations = new Set(data.wordAnalyses.map((word) => word.location));
  const lemmaIds = new Set(data.lemmas.map((lemma) => lemma.id));
  const rootIds = new Set(data.roots.map((root) => root.id));
  for (const word of data.wordAnalyses) {
    if (word.lemmaId !== null && !lemmaIds.has(word.lemmaId)) throw new Error(`Missing lemma foreign key at ${word.location}`);
    if (word.rootId !== null && !rootIds.has(word.rootId)) throw new Error(`Missing root foreign key at ${word.location}`);
    for (const segment of word.segments) {
      if (!locations.has(segment.location)) throw new Error(`Missing word foreign key for segment ${segment.location}:${segment.segmentIndex}`);
    }
  }
}

function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function insertSql(table, columns, rows) {
  if (rows.length === 0) return '';
  return rows
    .map((row) => `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((column) => sqlValue(row[column])).join(', ')});`)
    .join('\n');
}

function createSql(data, logicalChecksum) {
  assertReferentialIntegrity(data);
  const wordRows = data.wordAnalyses.map((word) => ({
    location: word.location,
    verse_key: word.verseKey,
    word_position: word.wordPosition,
    surface_uthmani: word.surfaceUthmani,
    normalized_surface: word.normalizedSurface,
    lemma_id: word.lemmaId,
    root_id: word.rootId,
    primary_pos: word.primaryPos,
    verb_form: word.verbForm,
    aspect: word.aspect,
    mood: word.mood,
    voice: word.voice,
    person: word.person,
    gender: word.gender,
    number: word.number,
    grammatical_case: word.grammaticalCase,
    grammatical_state: word.grammaticalState,
    derivation: word.derivation,
    source_id: data.sources[0].sourceId,
    source_version: word.sourceVersion,
  }));
  const morphemeRows = data.wordAnalyses.flatMap((word) => word.segments.map((segment) => ({
    location: segment.location,
    segment_index: segment.segmentIndex,
    arabic: segment.arabic,
    segment_type: segment.segmentType,
    pos_code: segment.posCode,
    features_json: stableStringify(segment.features),
    source_id: data.sources[0].sourceId,
    source_version: data.sources[0].version,
  })));
  const glossRows = data.wordAnalyses.filter((word) => word.gloss).map((word) => ({
    location: word.location,
    language_code: 'en',
    text: word.gloss,
    source_id: data.sources[1].sourceId,
    source_version: data.sources[1].version,
  }));
  const sourceRows = data.sources.map((source) => ({
    source_id: source.sourceId,
    title: source.title,
    version: source.version,
    license: source.license,
    url: source.url,
    checksum_sha256: source.checksumSha256,
    attribution: source.attribution,
  }));
  const analysisSourceRows = data.wordAnalyses.flatMap((word) => [
    { location: word.location, source_id: data.sources[0].sourceId, source_role: 'morphology' },
    { location: word.location, source_id: data.sources[1].sourceId, source_role: 'surface' },
    ...(word.gloss ? [{ location: word.location, source_id: data.sources[1].sourceId, source_role: 'contextual-gloss' }] : []),
  ]);

  return `PRAGMA page_size=4096;
PRAGMA encoding='UTF-8';
PRAGMA auto_vacuum=NONE;
PRAGMA journal_mode=OFF;
PRAGMA synchronous=OFF;
PRAGMA foreign_keys=ON;
PRAGMA application_id=1465078867;
PRAGMA user_version=${SCHEMA_VERSION};
BEGIN IMMEDIATE;
CREATE TABLE compiler_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
CREATE TABLE source_metadata (source_id TEXT PRIMARY KEY, title TEXT NOT NULL, version TEXT NOT NULL, license TEXT NOT NULL, url TEXT NOT NULL, checksum_sha256 TEXT NOT NULL, attribution TEXT NOT NULL) WITHOUT ROWID;
CREATE TABLE change_notice (id TEXT PRIMARY KEY, description TEXT NOT NULL) WITHOUT ROWID;
CREATE TABLE lemma (id INTEGER PRIMARY KEY, arabic TEXT NOT NULL, normalized TEXT NOT NULL, pos_code TEXT, occurrence_count INTEGER NOT NULL, source_id TEXT NOT NULL, source_version TEXT NOT NULL, FOREIGN KEY(source_id) REFERENCES source_metadata(source_id));
CREATE TABLE root (id INTEGER PRIMARY KEY, arabic TEXT NOT NULL, normalized TEXT NOT NULL, occurrence_count INTEGER NOT NULL, lemma_count INTEGER NOT NULL, source_id TEXT NOT NULL, source_version TEXT NOT NULL, FOREIGN KEY(source_id) REFERENCES source_metadata(source_id));
CREATE TABLE word_analysis (location TEXT PRIMARY KEY, verse_key TEXT NOT NULL, word_position INTEGER NOT NULL, surface_uthmani TEXT NOT NULL, normalized_surface TEXT NOT NULL, lemma_id INTEGER, root_id INTEGER, primary_pos TEXT, verb_form TEXT, aspect TEXT, mood TEXT, voice TEXT, person TEXT, gender TEXT, number TEXT, grammatical_case TEXT, grammatical_state TEXT, derivation TEXT, source_id TEXT NOT NULL, source_version TEXT NOT NULL, FOREIGN KEY(lemma_id) REFERENCES lemma(id), FOREIGN KEY(root_id) REFERENCES root(id), FOREIGN KEY(source_id) REFERENCES source_metadata(source_id)) WITHOUT ROWID;
CREATE TABLE morpheme (location TEXT NOT NULL, segment_index INTEGER NOT NULL, arabic TEXT NOT NULL, segment_type TEXT NOT NULL, pos_code TEXT NOT NULL, features_json TEXT NOT NULL, source_id TEXT NOT NULL, source_version TEXT NOT NULL, PRIMARY KEY(location, segment_index), FOREIGN KEY(location) REFERENCES word_analysis(location), FOREIGN KEY(source_id) REFERENCES source_metadata(source_id)) WITHOUT ROWID;
CREATE TABLE word_gloss (location TEXT NOT NULL, language_code TEXT NOT NULL, text TEXT NOT NULL, source_id TEXT NOT NULL, source_version TEXT NOT NULL, PRIMARY KEY(location, language_code, source_id), FOREIGN KEY(location) REFERENCES word_analysis(location), FOREIGN KEY(source_id) REFERENCES source_metadata(source_id)) WITHOUT ROWID;
CREATE TABLE word_analysis_source (location TEXT NOT NULL, source_id TEXT NOT NULL, source_role TEXT NOT NULL, PRIMARY KEY(location, source_id, source_role), FOREIGN KEY(location) REFERENCES word_analysis(location), FOREIGN KEY(source_id) REFERENCES source_metadata(source_id)) WITHOUT ROWID;
CREATE INDEX idx_word_analysis_verse_position ON word_analysis(verse_key, word_position);
CREATE INDEX idx_word_analysis_normalized_surface ON word_analysis(normalized_surface, location);
CREATE INDEX idx_word_analysis_lemma ON word_analysis(lemma_id, location);
CREATE INDEX idx_word_analysis_root ON word_analysis(root_id, location);
CREATE INDEX idx_word_analysis_root_lemma ON word_analysis(root_id, lemma_id, location);
CREATE INDEX idx_word_gloss_language_location ON word_gloss(language_code, location);
${insertSql('compiler_metadata', ['key', 'value'], [
    { key: 'compiler_version', value: COMPILER_VERSION },
    { key: 'schema_version', value: String(SCHEMA_VERSION) },
    { key: 'logical_checksum_sha256', value: logicalChecksum },
  ])}
${insertSql('source_metadata', ['source_id', 'title', 'version', 'license', 'url', 'checksum_sha256', 'attribution'], sourceRows)}
${insertSql('change_notice', ['id', 'description'], data.changeNotices)}
${insertSql('lemma', ['id', 'arabic', 'normalized', 'pos_code', 'occurrence_count', 'source_id', 'source_version'], data.lemmas.map((lemma) => ({ ...lemma, pos_code: lemma.posCode, occurrence_count: lemma.occurrenceCount, source_id: data.sources[0].sourceId, source_version: data.sources[0].version })))}
${insertSql('root', ['id', 'arabic', 'normalized', 'occurrence_count', 'lemma_count', 'source_id', 'source_version'], data.roots.map((root) => ({ ...root, occurrence_count: root.occurrenceCount, lemma_count: root.lemmaCount, source_id: data.sources[0].sourceId, source_version: data.sources[0].version })))}
${insertSql('word_analysis', ['location', 'verse_key', 'word_position', 'surface_uthmani', 'normalized_surface', 'lemma_id', 'root_id', 'primary_pos', 'verb_form', 'aspect', 'mood', 'voice', 'person', 'gender', 'number', 'grammatical_case', 'grammatical_state', 'derivation', 'source_id', 'source_version'], wordRows)}
${insertSql('morpheme', ['location', 'segment_index', 'arabic', 'segment_type', 'pos_code', 'features_json', 'source_id', 'source_version'], morphemeRows)}
${insertSql('word_gloss', ['location', 'language_code', 'text', 'source_id', 'source_version'], glossRows)}
${insertSql('word_analysis_source', ['location', 'source_id', 'source_role'], analysisSourceRows)}
COMMIT;
PRAGMA foreign_keys=ON;
VACUUM;
PRAGMA optimize;
`;
}

function resolveSqliteBinary(explicitPath) {
  const candidates = [explicitPath, process.env.WORD_STUDY_SQLITE3, 'sqlite3'].filter(Boolean);
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (result.status === 0) return candidate;
  }
  throw new Error('sqlite3 CLI was not found. Set WORD_STUDY_SQLITE3 to its executable path.');
}

function writeSqliteDatabase({ data, logicalChecksum, databasePath, sqliteBinary }) {
  const resolvedSqlite = resolveSqliteBinary(sqliteBinary);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  fs.rmSync(databasePath, { force: true });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'word-study-sql-'));
  const sqlPath = path.join(tempDir, 'pack.sql');
  try {
    fs.writeFileSync(sqlPath, createSql(data, logicalChecksum));
    const result = spawnSync(resolvedSqlite, [databasePath, `.read ${sqlPath}`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`sqlite3 failed: ${result.stderr || result.stdout}`);
    const integrity = spawnSync(resolvedSqlite, [databasePath, 'PRAGMA integrity_check; PRAGMA foreign_key_check;'], { encoding: 'utf8' });
    if (integrity.status !== 0 || integrity.stdout.trim() !== 'ok') {
      throw new Error(`Generated database failed integrity checks: ${integrity.stderr || integrity.stdout}`);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  return { sqliteBinary: resolvedSqlite, databaseChecksumSha256: sha256File(databasePath) };
}

function humanReadableReport(report, manifest) {
  const checks = Object.entries(report.countChecks)
    .map(([name, check]) => `| ${name} | ${check.expected} | ${check.actual} | ${check.matches ? 'Pass' : 'Fail'} |`)
    .join('\n');
  const exceptionRows = report.exceptions.length === 0
    ? 'None.'
    : report.exceptions.map((exception) => `- \`${exception.location}\` — ${exception.type}; ${exception.disposition}${exception.morphologySurface ? `; source \`${exception.morphologySurface}\`, canonical \`${exception.canonicalSurface}\`` : ''}`).join('\n');
  return `# Word Study Pack Validation Report

Status: **${report.status.toUpperCase()}**

- Compiler: ${report.compilerVersion}
- Schema: ${report.schemaVersion}
- Logical SHA-256: \`${report.logicalChecksum}\`
- Database SHA-256: \`${manifest.databaseChecksumSha256}\`

## Alignment checks

| Check | Expected | Actual | Result |
|---|---:|---:|---|
${checks}

## Derived data

- Segments: ${report.counts.sourceSegments}
- Lemmas: ${report.counts.lemmas}
- Roots: ${report.counts.roots}
- Contextual glosses: ${report.counts.glosses}
- Exceptions: ${report.counts.exceptions} (${report.counts.unresolvedExceptions} unresolved)

## Exceptions and dispositions

${exceptionRows}
`;
}

function compilePack(options) {
  const morphologyBuffer = fs.readFileSync(options.morphologyPath);
  const canonicalBuffer = fs.readFileSync(options.canonicalPath);
  const sourceConfig = JSON.parse(fs.readFileSync(options.sourceConfigPath, 'utf8'));
  const morphologyChecksum = sha256Buffer(morphologyBuffer);
  const canonicalChecksum = sha256Buffer(canonicalBuffer);
  if (sourceConfig.morphology.checksumSha256 !== morphologyChecksum) {
    throw new Error(`Morphology checksum mismatch. Expected ${sourceConfig.morphology.checksumSha256}, received ${morphologyChecksum}`);
  }
  if (sourceConfig.canonical.checksumSha256 !== canonicalChecksum) {
    throw new Error(`Canonical checksum mismatch. Expected ${sourceConfig.canonical.checksumSha256}, received ${canonicalChecksum}`);
  }
  const { data, report } = buildPackData({
    morphologyText: morphologyBuffer.toString('utf8'),
    canonicalPayload: JSON.parse(canonicalBuffer.toString('utf8')),
    morphologySource: sourceConfig.morphology,
    canonicalSource: sourceConfig.canonical,
    expectedAyahs: options.expectedAyahs,
    expectedWords: options.expectedWords,
  });
  if (report.status !== 'passed') throw new Error(`Pack validation failed: ${stableStringify(report.countChecks)}`);

  fs.mkdirSync(options.outputDir, { recursive: true });
  const databasePath = path.join(options.outputDir, 'quran-word-study.db');
  const databaseResult = writeSqliteDatabase({ data, logicalChecksum: report.logicalChecksum, databasePath, sqliteBinary: options.sqliteBinary });
  const manifest = {
    format: 'quran-word-study-sqlite-v1',
    compilerVersion: COMPILER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    databaseFile: path.basename(databasePath),
    databaseSizeBytes: fs.statSync(databasePath).size,
    databaseChecksumSha256: databaseResult.databaseChecksumSha256,
    logicalChecksumSha256: report.logicalChecksum,
    sources: data.sources,
  };
  fs.writeFileSync(path.join(options.outputDir, 'manifest.json'), `${stableStringify(manifest)}\n`);
  fs.writeFileSync(path.join(options.outputDir, 'validation-report.json'), `${stableStringify(report)}\n`);
  fs.writeFileSync(path.join(options.outputDir, 'validation-report.md'), humanReadableReport(report, manifest));
  return { databasePath, data, report, manifest };
}

module.exports = {
  COMPILER_VERSION,
  EXPECTED_AYAH_COUNT,
  EXPECTED_WORD_COUNT,
  SCHEMA_VERSION,
  assertReferentialIntegrity,
  buckwalterToArabic,
  buildPackData,
  compilePack,
  normalizeArabic,
  parseCanonicalPayload,
  parseMorphologySource,
  sha256Buffer,
  stableStringify,
  writeSqliteDatabase,
};
