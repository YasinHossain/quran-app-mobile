const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');

const TOTAL_SURAHS = 114;
const PER_PAGE = 300;
const REQUEST_DELAY_MS = 200;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_REQUEST_ATTEMPTS = 5;
const API_BASE_URL = 'https://api.quran.com/api/v4';
const DEFAULT_OUTPUT_DIR = path.join(__dirname, '..', 'dist', 'tafsir-packs');
const PAYLOAD_FORMAT = 'tafsir-json-v2';
const PASSAGE_REQUEST_CONCURRENCY = 6;
// `by_ayah` lists at most this many verses of a passage. Every verse of a longer passage
// returns the same truncated list, so its full range is the list plus the verses returning it.
const API_PASSAGE_VERSE_LIMIT = 10;

// Tafsirs whose passage commentary sits on the LAST verse of the passage, while the API's
// `by_ayah` grouping attaches those blank verses to the previous verse instead. Verified by
// reading the text: Al-Sa'di (ru) explains 2:19 on 2:20, 2:38 on 2:39 and 2:45 on 2:46.
// For these, a passage is the run of blank verses before a verse with text, within a surah.
const TRAILING_TEXT_PASSAGE_TAFSIR_IDS = new Set([170]);

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

function fetchJsonOnce(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(
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
    );

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error(`Request timed out for ${url}`));
    });
    request.on('error', reject);
  });
}

async function fetchJson(url) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
    try {
      return await fetchJsonOnce(url);
    } catch (error) {
      lastError = error;
      if (attempt >= MAX_REQUEST_ATTEMPTS) break;
      const delayMs = Math.min(4_000, 500 * 2 ** (attempt - 1));
      console.warn(`  Request attempt ${attempt}/${MAX_REQUEST_ATTEMPTS} failed; retrying in ${delayMs} ms`);
      await sleep(delayMs);
    }
  }

  throw lastError;
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

function parseVerseKey(verseKey) {
  const match = /^(\d+):(\d+)$/.exec(String(verseKey ?? '').trim());
  if (!match) return null;
  return { surah: Number(match[1]), ayah: Number(match[2]) };
}

function compareVerseKeys(left, right) {
  const a = parseVerseKey(left);
  const b = parseVerseKey(right);
  return a.surah - b.surah || a.ayah - b.ayah;
}

function hasText(html) {
  return typeof html === 'string' && html.trim().length > 0;
}

/** Merges `by_ayah` responses that describe the same passage (see API_PASSAGE_VERSE_LIMIT). */
function mergePassageGroups(groups, issues) {
  const mergedByListedKeys = new Map();

  for (const group of groups) {
    const listed = [...new Set(group.verseKeys)].filter(parseVerseKey).sort(compareVerseKeys);
    if (listed.length < 2) continue;

    const listedId = listed.join(',');
    const merged = mergedByListedKeys.get(listedId) ?? {
      verseKeys: new Set(listed),
      text: '',
    };
    mergedByListedKeys.set(listedId, merged);
    if (!merged.text && hasText(group.text)) merged.text = group.text;

    if (!listed.includes(group.queriedVerseKey)) {
      if (listed.length < API_PASSAGE_VERSE_LIMIT) {
        issues.push(`${group.queriedVerseKey}: API group ${listedId} does not include the verse`);
        continue;
      }
      merged.verseKeys.add(group.queriedVerseKey);
    }
  }

  return [...mergedByListedKeys.values()].map((merged) => ({
    verseKeys: [...merged.verseKeys].sort(compareVerseKeys),
    text: merged.text,
  }));
}

/**
 * Passages from the API's `by_ayah` groups. A group is kept only when it is safe to show
 * one commentary for all of its verses:
 * - exactly one verse in the group has text in the chapter data (that text is the passage);
 * - when the API returns text, it matches that verse's text;
 * - verses outside that verse's surah are dropped (the API sometimes joins the first verses
 *   of a surah onto the previous surah's last passage), and what remains is contiguous.
 */
function buildPassagesFromGroups(verses, groups) {
  const htmlByVerseKey = new Map(verses.map((verse) => [verse.verseKey, verse.html]));
  const passages = [];
  const issues = [];
  const claimed = new Set();
  let droppedCrossSurahVerses = 0;

  for (const { verseKeys, text } of mergePassageGroups(groups, issues)) {
    const groupId = `${verseKeys[0]}..${verseKeys[verseKeys.length - 1]}`;
    const textVerseKeys = verseKeys.filter((verseKey) => hasText(htmlByVerseKey.get(verseKey)));
    if (textVerseKeys.length === 0) continue; // The whole passage has no commentary.
    if (textVerseKeys.length > 1) {
      issues.push(`${groupId}: ${textVerseKeys.length} verses have text`);
      continue;
    }

    const textVerseKey = textVerseKeys[0];
    const passageHtml = htmlByVerseKey.get(textVerseKey);
    if (hasText(text) && text.trim() !== passageHtml.trim()) {
      issues.push(`${groupId}: API text differs from ${textVerseKey}`);
      continue;
    }

    const surah = parseVerseKey(textVerseKey).surah;
    const inSurah = verseKeys.filter(
      (verseKey) => parseVerseKey(verseKey).surah === surah && htmlByVerseKey.has(verseKey)
    );
    droppedCrossSurahVerses += verseKeys.length - inSurah.length;

    const ayahs = inSurah.map((verseKey) => parseVerseKey(verseKey).ayah);
    if (ayahs.some((ayah, index) => index > 0 && ayah !== ayahs[index - 1] + 1)) {
      issues.push(`${groupId}: verses are not contiguous`);
      continue;
    }
    if (inSurah.length < 2) continue;
    if (inSurah.some((verseKey) => claimed.has(verseKey))) {
      issues.push(`${groupId}: overlaps another passage`);
      continue;
    }

    inSurah.forEach((verseKey) => claimed.add(verseKey));
    passages.push({
      startVerseKey: inSurah[0],
      endVerseKey: inSurah[inSurah.length - 1],
      textVerseKey,
    });
  }

  return { passages, issues, droppedCrossSurahVerses };
}

/** Passages for tafsirs listed in TRAILING_TEXT_PASSAGE_TAFSIR_IDS. */
function buildTrailingTextPassages(verses) {
  const passages = [];
  let run = [];

  for (const verse of verses) {
    const previous = run.length > 0 ? parseVerseKey(run[run.length - 1]) : null;
    const current = parseVerseKey(verse.verseKey);
    if (previous && (previous.surah !== current.surah || previous.ayah + 1 !== current.ayah)) {
      run = [];
    }

    if (!hasText(verse.html)) {
      run.push(verse.verseKey);
      continue;
    }

    if (run.length > 0) {
      passages.push({
        startVerseKey: run[0],
        endVerseKey: verse.verseKey,
        textVerseKey: verse.verseKey,
      });
    }
    run = [];
  }

  return { passages, issues: [], droppedCrossSurahVerses: 0 };
}

/**
 * Returns the pack verses and passages. Each passage's HTML is moved to its first verse and
 * the other verses keep empty HTML, which is the layout the app imports.
 */
function buildPassagePayload({ tafsirId, verses, groups }) {
  const sortedVerses = [...verses].sort((left, right) =>
    compareVerseKeys(left.verseKey, right.verseKey)
  );
  const result = TRAILING_TEXT_PASSAGE_TAFSIR_IDS.has(tafsirId)
    ? buildTrailingTextPassages(sortedVerses)
    : buildPassagesFromGroups(sortedVerses, groups);

  const htmlByVerseKey = new Map(sortedVerses.map((verse) => [verse.verseKey, verse.html]));
  for (const passage of result.passages) {
    const html = htmlByVerseKey.get(passage.textVerseKey);
    htmlByVerseKey.set(passage.textVerseKey, '');
    htmlByVerseKey.set(passage.startVerseKey, html);
  }

  return {
    verses: sortedVerses.map((verse) => ({
      verseKey: verse.verseKey,
      html: htmlByVerseKey.get(verse.verseKey),
    })),
    passages: result.passages
      .map(({ startVerseKey, endVerseKey }) => ({ startVerseKey, endVerseKey }))
      .sort((left, right) => compareVerseKeys(left.startVerseKey, right.startVerseKey)),
    issues: result.issues,
    droppedCrossSurahVerses: result.droppedCrossSurahVerses,
  };
}

async function fetchPassageGroups(tafsirId, verses) {
  // Blank verses, plus verses with text right after a blank verse: when a tafsir keeps the
  // passage text on its last verse, that verse may be missing from a truncated group list.
  const sortedVerses = [...verses].sort((left, right) =>
    compareVerseKeys(left.verseKey, right.verseKey)
  );
  const candidateVerseKeys = sortedVerses
    .filter((verse, index) => {
      if (!hasText(verse.html)) return true;
      const previous = sortedVerses[index - 1];
      return (
        previous !== undefined &&
        !hasText(previous.html) &&
        parseVerseKey(previous.verseKey).surah === parseVerseKey(verse.verseKey).surah
      );
    })
    .map((verse) => verse.verseKey);
  const covered = new Set();
  const groups = [];
  let cursor = 0;

  // A complete group lists all of its verses, so later members need no lookup of their own.
  while (cursor < candidateVerseKeys.length) {
    const wave = [];
    while (cursor < candidateVerseKeys.length && wave.length < PASSAGE_REQUEST_CONCURRENCY) {
      const verseKey = candidateVerseKeys[cursor];
      cursor += 1;
      if (!covered.has(verseKey)) wave.push(verseKey);
    }

    const results = await Promise.all(
      wave.map(async (verseKey) => {
        const response = await fetchJson(
          buildApiUrl(`/tafsirs/${tafsirId}/by_ayah/${encodeURIComponent(verseKey)}`, {})
        );
        const tafsir = response.tafsir ?? {};
        return {
          queriedVerseKey: verseKey,
          verseKeys: Object.keys(tafsir.verses ?? {}),
          text: typeof tafsir.text === 'string' ? tafsir.text : '',
        };
      })
    );

    for (const group of results) {
      if (group.verseKeys.length < API_PASSAGE_VERSE_LIMIT) {
        group.verseKeys.forEach((verseKey) => covered.add(verseKey));
      }
      groups.push(group);
    }

    if (groups.length % 300 < PASSAGE_REQUEST_CONCURRENCY) {
      console.log(`  Passage lookups ${groups.length} (${cursor}/${candidateVerseKeys.length} verses)`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  return groups;
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
  let response;
  try {
    response = await fetchJson(
      buildApiUrl('/resources/tafsirs', {
        per_page: '200',
        page: '1',
      })
    );
  } catch (error) {
    const localPath = path.join(__dirname, '..', 'src', 'data', 'tafsirs.json');
    if (!fs.existsSync(localPath)) throw error;
    console.warn('Unable to refresh tafsir metadata; using src/data/tafsirs.json');
    const localResources = JSON.parse(fs.readFileSync(localPath, 'utf8'));
    response = {
      tafsirs: localResources.map((tafsir) => ({
        id: tafsir.id,
        name: tafsir.name,
        author_name: tafsir.author_name ?? tafsir.authorName,
        language_name: tafsir.language_name ?? tafsir.languageName ?? tafsir.lang,
      })),
    };
  }

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

function readCompletedPack({ tafsirId, version, outputDir, baseUrl }) {
  const relativeDir = path.join('tafsirs', String(tafsirId), version);
  const absoluteDir = path.join(outputDir, relativeDir);
  const manifestPath = path.join(absoluteDir, 'manifest.json');
  const payloadPath = path.join(absoluteDir, 'payload.json');
  if (!fs.existsSync(manifestPath) || !fs.existsSync(payloadPath)) return null;

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
    const payloadChecksum = computeMd5(payloadPath);
    const payloadSizeBytes = fs.statSync(payloadPath).size;
    if (
      manifest.tafsirId !== tafsirId ||
      manifest.version !== version ||
      manifest.payloadChecksum !== payloadChecksum ||
      manifest.payloadSizeBytes !== payloadSizeBytes ||
      manifest.format !== PAYLOAD_FORMAT ||
      payload.format !== PAYLOAD_FORMAT ||
      !Array.isArray(payload.verses) ||
      !Array.isArray(payload.passages) ||
      payload.verses.length !== manifest.totalVerses
    ) {
      return null;
    }

    return {
      tafsirId,
      name: manifest.name,
      authorName: manifest.authorName,
      languageName: manifest.languageName,
      version,
      downloadUrl: toCatalogUrl(
        path.posix.join(relativeDir.replace(/\\/g, '/'), 'payload.json'),
        baseUrl
      ),
      checksum: payloadChecksum,
      sizeBytes: payloadSizeBytes,
      totalVerses: payload.verses.length,
      manifestUrl: toCatalogUrl(
        path.posix.join(relativeDir.replace(/\\/g, '/'), 'manifest.json'),
        baseUrl
      ),
      manifestChecksum: computeMd5(manifestPath),
      manifestSizeBytes: fs.statSync(manifestPath).size,
    };
  } catch (_error) {
    return null;
  }
}

function writeCatalog(outputDir, entries) {
  const catalog = {
    generatedAt: new Date().toISOString(),
    packs: Array.from(entries).sort((left, right) => {
      if (left.languageName !== right.languageName) {
        return String(left.languageName).localeCompare(String(right.languageName));
      }
      return Number(left.tafsirId) - Number(right.tafsirId);
    }),
  };
  writeJsonFile(path.join(outputDir, 'catalog.json'), catalog, true);
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
  const chapterVerses = await fetchTafsirVerses(tafsirId);
  if (chapterVerses.length === 0) {
    throw new Error(`No verses found for tafsir ${tafsirId}`);
  }

  const needsPassageLookup =
    !TRAILING_TEXT_PASSAGE_TAFSIR_IDS.has(tafsirId) &&
    chapterVerses.some((verse) => !hasText(verse.html));
  const groups = needsPassageLookup ? await fetchPassageGroups(tafsirId, chapterVerses) : [];
  const { verses, passages, issues, droppedCrossSurahVerses } = buildPassagePayload({
    tafsirId,
    verses: chapterVerses,
    groups,
  });
  const passageVerseCount = passages.reduce(
    (total, passage) =>
      total + parseVerseKey(passage.endVerseKey).ayah - parseVerseKey(passage.startVerseKey).ayah + 1,
    0
  );
  const blankVerseCount = verses.filter((verse) => !hasText(verse.html)).length;
  console.log(
    `  Passages: ${passages.length} covering ${passageVerseCount} verses; ` +
      `${blankVerseCount - (passageVerseCount - passages.length)} verses without commentary; ` +
      `${droppedCrossSurahVerses} cross-surah verses dropped; ${issues.length} groups rejected`
  );
  issues.slice(0, 20).forEach((issue) => console.warn(`  Rejected passage ${issue}`));

  const relativeDir = path.join('tafsirs', String(tafsirId), version);
  const absoluteDir = path.join(outputDir, relativeDir);
  const manifestPath = path.join(absoluteDir, 'manifest.json');
  const payloadPath = path.join(absoluteDir, 'payload.json');

  const payload = {
    tafsirId,
    version,
    format: PAYLOAD_FORMAT,
    verses,
    passages,
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
    format: PAYLOAD_FORMAT,
    payloadFile: 'payload.json',
    payloadChecksum,
    payloadSizeBytes,
    totalVerses: verses.length,
    generatedAt: new Date().toISOString(),
    source: `${API_BASE_URL}/tafsirs/${tafsirId}/by_chapter/{surahId}?per_page=${PER_PAGE}; passages from ${API_BASE_URL}/tafsirs/${tafsirId}/by_ayah/{verseKey}`,
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
  // One entry per tafsir: the app installs the first catalog entry for an id, so a newly
  // generated version replaces the previous one.
  const mergedByKey = new Map();
  for (const existing of existingCatalog.packs) {
    mergedByKey.set(existing.tafsirId, existing);
  }

  for (const tafsirId of options.tafsirIds) {
    const completed = readCompletedPack({
      tafsirId,
      version: options.version,
      outputDir: options.outputDir,
      baseUrl: options.baseUrl,
    });
    const entry =
      completed ??
      (await generatePack({
        tafsirId,
        version: options.version,
        outputDir: options.outputDir,
        baseUrl: options.baseUrl,
        resourceById,
      }));
    if (completed) console.log(`Reusing verified tafsir pack ${tafsirId}`);
    mergedByKey.set(entry.tafsirId, entry);
    writeCatalog(options.outputDir, mergedByKey.values());
  }

  console.log(`Wrote catalog: ${path.join(options.outputDir, 'catalog.json')}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { buildPassagePayload };
