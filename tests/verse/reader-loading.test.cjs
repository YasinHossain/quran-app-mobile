const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');
const juzData = require('../../src/data/juz.json');

global.IS_REACT_ACT_ENVIRONMENT = true;
const chapters = [{ id: 1, verses_count: 7 }, { id: 2, verses_count: 286 }, { id: 3, verses_count: 200 }];

test('native reader sends inset and audio updates without invalidating the full Surah payload', async (t) => {
  const exports = {};
  const commands = { scrollToVerse() {} };
  const source = ts.transpileModule(
    readFileSync(path.join(__dirname, '../../components/surah/native/NativeSurahReader.tsx'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }
  ).outputText;
  vm.runInNewContext(source, {
    exports,
    require(name) {
      if (name === 'react') return React;
      if (name === 'react/jsx-runtime') return require(name);
      if (name === 'react-native') return {
        Platform: { OS: 'android' }, StyleSheet: { create: (styles) => styles },
        requireNativeComponent: () => 'NativeReaderHost',
      };
      if (name === './useNativeSurahReaderCommands') return { useNativeSurahReaderCommands: () => commands };
      throw new Error(`Unexpected module: ${name}`);
    },
  });
  const Reader = exports.NativeSurahReader;
  let state = {
    surahId: 2, targetVerse: 1, verses: [{ verseKey: '2:1', verseNumber: 1, arabicText: 'الم', translationItems: [] }],
    settings: { showByWords: false }, theme: {}, topInsetPx: 328, bottomInsetPx: 24,
  };
  let root;
  await act(async () => { root = create(React.createElement(Reader, { readerState: state })); });
  t.after(async () => { await act(async () => root.unmount()); });
  const host = () => root.root.findByType('NativeReaderHost').props;
  const initialPayload = host().readerState;
  const update = async (patch, props = {}) => {
    state = { ...state, ...patch };
    await act(async () => root.update(React.createElement(Reader, { readerState: state, ...props })));
  };
  await update({ topInsetPx: 332, bottomInsetPx: 136, activeVerseKey: '2:1' });
  assert.equal(host().readerState, initialPayload);
  assert.equal(host().topInsetPx, 332);
  assert.equal(host().bottomInsetPx, 136);
  assert.equal(host().activeVerseKey, '2:1');
  const word = { verseKey: '2:1', wordPosition: 1 };
  await update({}, { activeWord: word });
  assert.equal(host().readerState, initialPayload);
  assert.equal(host().activeWord, word);
  await update({}, { activeVerseKey: null, activeWord: null });
  assert.equal(host().activeVerseKey, null);
  assert.equal(host().activeWord, null);
  assert.equal(host().readerState, initialPayload);
  await update({ settings: { showByWords: true } });
  assert.notEqual(host().readerState, initialPayload);
  assert.equal(host().readerState.settings.showByWords, true);
  assert.equal(host().readerState.versesRevision, initialPayload.versesRevision);
  assert.equal(host().topInsetPx, 332);
  const nextVerses = [{ ...state.verses[0], words: [{ id: 1, uthmani: 'الم' }] }];
  await update({ verses: nextVerses });
  assert.equal(host().readerState.verses, nextVerses);
  assert.notEqual(host().readerState.versesRevision, initialPayload.versesRevision);
});

test('offline-native reader sends only identifiers and settings across the bridge', async (t) => {
  const exports = {};
  const source = ts.transpileModule(
    readFileSync(path.join(__dirname, '../../components/surah/native/NativeSurahReader.tsx'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }
  ).outputText;
  vm.runInNewContext(source, {
    exports,
    require(name) {
      if (name === 'react') return React;
      if (name === 'react/jsx-runtime') return require(name);
      if (name === 'react-native') return {
        Platform: { OS: 'android' }, StyleSheet: { create: (styles) => styles },
        requireNativeComponent: () => 'NativeReaderHost',
      };
      if (name === './useNativeSurahReaderCommands') {
        return { useNativeSurahReaderCommands: () => ({ scrollToVerse() {} }) };
      }
      throw new Error(`Unexpected module: ${name}`);
    },
  });
  const Reader = exports.NativeSurahReader;
  const state = {
    surahId: 2,
    targetVerse: 255,
    expectedVerseCount: 286,
    settings: { translationIds: [20], wordLang: 'en' },
    theme: {},
    topInsetPx: 300,
    bottomInsetPx: 24,
  };
  let root;
  await act(async () => { root = create(React.createElement(Reader, { readerState: state })); });
  t.after(async () => { await act(async () => root.unmount()); });
  const payload = root.root.findByType('NativeReaderHost').props.readerState;
  assert.equal(payload.surahId, 2);
  assert.equal(payload.targetVerse, 255);
  assert.equal(payload.expectedVerseCount, 286);
  assert.deepEqual(payload.settings.translationIds, [20]);
  assert.equal(Object.hasOwn(payload, 'verses'), false);
  assert.equal(Object.hasOwn(payload, 'versesRevision'), false);
});

test('Android Surah screen disables React verse loading for the offline-native reader', () => {
  const source = readFileSync(path.join(__dirname, '../../app/surah/[surahId].tsx'), 'utf8');
  const warmup = readFileSync(path.join(__dirname, '../../lib/surah/surahReaderWarmup.ts'), 'utf8');
  assert.match(source, /enabled:\s*!isMushafView\s*&&\s*!usesOfflineNativeReader/);
  assert.match(source, /expectedVerseCount:\s*verseCount/);
  assert.doesNotMatch(source, /verses:\s*nativeLightSurahVerses/);
  assert.match(warmup, /if \(Platform\.OS === 'android'\) return/);
});

test('Android Surah screen does not flash a loading skeleton for fast native reads', () => {
  const source = readFileSync(path.join(__dirname, '../../app/surah/[surahId].tsx'), 'utf8');
  assert.match(source, /NATIVE_READER_LOADING_PLACEHOLDER_DELAY_MS\s*=\s*250/);
  assert.match(
    source,
    /nativeReaderStatus\.state === 'loading'\s*&&\s*showNativeReaderLoadingPlaceholder/
  );
  assert.match(
    source,
    /setTimeout\(\s*\(\) => setShowNativeReaderLoadingPlaceholder\(true\),\s*NATIVE_READER_LOADING_PLACEHOLDER_DELAY_MS/
  );
});

function verses(surahId, first, last, language = 'en') {
  return Array.from({ length: last - first + 1 }, (_, index) => ({
    verseKey: `${surahId}:${first + index}`,
    surahId,
    ayahNumber: first + index,
    arabicUthmani: 'بِسْمِ اللَّهِ',
    wordsJson: JSON.stringify([{ id: 1, position: 1, uthmani: 'بِسْمِ', translationText: language }]),
    translations: [{ translationId: 20, text: 'Translation' }],
  }));
}

function loadHook(kind, readSnapshot, readAsync = readSnapshot) {
  const requests = [];
  let parsedWords = 0;
  const source = ts.transpileModule(
    readFileSync(path.join(__dirname, `../../hooks/use${kind}Verses.ts`), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }
  ).outputText;
  const exports = {};
  const cache = {
    [`DEFAULT_${kind.toUpperCase()}_VERSES_PER_PAGE`]: 30,
    [`getOffline${kind}Snapshot`]: readSnapshot,
    [`peekOffline${kind}Cache`]: readSnapshot,
    [`getOffline${kind}Cached`]: async (params) => (await readAsync(params)) ?? [],
    [`peekOffline${kind}PageCache`]: () => null,
    [`getOffline${kind}PageCached`]: async (params) => { requests.push(params); return []; },
    peekCachedTajweedGlyphRuns: () => undefined,
  };
  vm.runInNewContext(source, {
    exports, console, setTimeout, clearTimeout,
    JSON: { parse(value) { parsedWords++; return JSON.parse(value); } },
    require(name) {
      if (name === 'react') return React;
      if (name.endsWith('/useChapters')) return { useChapters: () => ({ chapters }) };
      if (name.endsWith('juz.json')) return juzData;
      if (name.includes('PageCache')) return cache;
      if (name.endsWith('/verseDetailsCache')) return { primeVerseDetailsCache() {} };
      if (name.endsWith('/bundledVerseWords')) return { getBundledVerseWords: () => undefined };
      if (name.endsWith('/apiFetch')) return { apiFetch: async (...args) => {
        requests.push(args);
        return { verses: [], pagination: { total_pages: 1 } };
      } };
      if (name.endsWith('/container')) return { container: {} };
      if (name.endsWith('/options')) return { findMushafOption: () => ({ version: 'test' }) };
      if (name.endsWith('/surahTranslationNetworkCache')) return {
        peekNetworkSurahTranslationSnapshot: () => null,
        getNetworkSurahTranslationCached: async () => [],
      };
      if (name.endsWith('/bundledSaheehInternational')) return { getBundledSaheehVerses: () => [] };
      if (name.endsWith('/TajweedNativeText') || name.endsWith('/downloadablePacks')) return {};
      throw new Error(`Unexpected module: ${name}`);
    },
  });
  return { hook: exports[`use${kind}Verses`], requests, get parsedWords() { return parsedWords; } };
}

async function mount(t, loaded, props) {
  let current;
  const renders = [];
  let root;
  function Harness(input) {
    current = loaded.hook(input);
    renders.push(current);
    return null;
  }
  await act(async () => { root = create(React.createElement(Harness, props)); });
  t.after(async () => { await act(async () => root.unmount()); });
  return {
    get current() { return current; }, renders,
    async update(next) { await act(async () => root.update(React.createElement(Harness, next))); },
  };
}

for (const [juzNumber, rows] of [
  [1, [...verses(1, 1, 7), ...verses(2, 1, 141)]],
  [2, verses(2, 142, 252)],
  [3, [...verses(2, 253, 286), ...verses(3, 1, 92)]],
]) {
  test(`Juz ${juzNumber} has every local verse on its first render with no extra page fetches`, async (t) => {
    const loaded = loadHook('Juz', () => rows);
    const reader = await mount(t, loaded, { juzNumber, translationIds: [20] });
    assert.equal(reader.renders[0].isLoading, false);
    assert.equal(reader.current.verseCount, rows.length);
    for (const row of rows) assert.equal(reader.renders[0].getVerseByKey(row.verseKey)?.verse_key, row.verseKey);
    assert.equal(reader.current.pagesSignature, Array.from({ length: Math.ceil(rows.length / 30) }, (_, i) => i + 1).join(','));
    await act(async () => reader.current.ensureVerseRangeLoaded(0, rows.length - 1));
    assert.equal(loaded.requests.length, 0);
    assert.equal(loaded.parsedWords, rows.length, 'mount effect reuses prepared word data');
  });
}

test('a long surah is complete immediately and reuses prepared words across mount and re-entry', async (t) => {
  const rows = verses(2, 1, 286);
  const loaded = loadHook('Surah', () => rows);
  const props = { chapterNumber: 2, translationIds: [20], includeWords: true };
  const reader = await mount(t, loaded, props);
  assert.equal(reader.renders[0].isLoading, false);
  assert.equal(reader.renders[0].getVerseByNumber(286)?.verse_key, '2:286');
  assert.equal(loaded.parsedWords, 286);
  const second = await mount(t, loaded, props);
  assert.equal(second.current.getVerseByNumber(255)?.verse_key, '2:255');
  assert.equal(loaded.parsedWords, 286);
  assert.equal(loaded.requests.length, 0);
});

test('word-by-word validation and re-entry reuse the parsed full-surah words', async (t) => {
  const rows = verses(2, 1, 286);
  const loaded = loadHook('Surah', () => rows);
  const props = { chapterNumber: 2, translationIds: [20], includeWords: true, includeWordTranslations: true };
  const reader = await mount(t, loaded, props);
  assert.equal(reader.renders[0].isLoading, false);
  assert.equal(reader.renders[0].getVerseByNumber(286)?.words[0].translationText, 'en');
  const initialParses = loaded.parsedWords;
  await mount(t, loaded, props);
  assert.equal(loaded.requests.length, 0);
  assert.equal(initialParses, 286, 'validation and normalization should share one parse per verse');
  assert.equal(loaded.parsedWords, 286, 're-entry should not reparse cached word data');
});

for (const kind of ['Surah', 'Juz']) {
  test(`${kind} changes word language without retaining the old prepared words`, async (t) => {
    const en = verses(2, kind === 'Juz' ? 142 : 1, kind === 'Juz' ? 252 : 286);
    const bn = verses(2, kind === 'Juz' ? 142 : 1, kind === 'Juz' ? 252 : 286, 'bn');
    const loaded = loadHook(kind, ({ wordLang }) => wordLang === 'bn' ? bn : en);
    const props = { chapterNumber: 2, juzNumber: 2, translationIds: [20], includeWords: true, includeWordTranslations: true, wordLang: 'en' };
    const reader = await mount(t, loaded, props);
    await reader.update({ ...props, wordLang: 'bn' });
    const verse = kind === 'Juz' ? reader.current.getVerseByKey('2:142') : reader.current.getVerseByNumber(1);
    assert.equal(verse.words[0].translationText, 'bn');
    assert.equal(reader.current.isLoading, false);
  });
}

for (const wordsJson of ['broken JSON', '{}', '[]', '[{"uthmani":"بِسْمِ"}]']) {
  test(`word-by-word readiness rejects incomplete cached words: ${wordsJson}`, async (t) => {
    const rows = verses(1, 1, 7);
    rows[6].wordsJson = wordsJson;
    const loaded = loadHook('Surah', () => rows, () => new Promise(() => {}));
    const reader = await mount(t, loaded, {
      chapterNumber: 1, translationIds: [20], includeWords: true, includeWordTranslations: true,
    });
    assert.equal(reader.renders[0].isLoading, true);
    assert.equal(reader.renders[0].hasLoadedContent, false);
    assert.equal(reader.renders[0].getVerseByNumber(7), undefined);
  });
}

test('pending local juz data becomes a complete reader without loading extra pages', async (t) => {
  const rows = [...verses(2, 253, 286), ...verses(3, 1, 92)];
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const loaded = loadHook('Juz', () => null, () => pending);
  const reader = await mount(t, loaded, { juzNumber: 3, translationIds: [20] });
  assert.equal(reader.current.isLoading, true);
  await act(async () => resolve(rows));
  assert.equal(reader.current.isLoading, false);
  assert.equal(reader.current.getVerseByKey('2:253').verse_key, '2:253');
  assert.equal(reader.current.getVerseByKey('3:92').verse_key, '3:92');
  await act(async () => reader.current.ensureVerseRangeLoaded(0, rows.length - 1));
  assert.equal(loaded.requests.length, 0);
});

test('switching juz while a local read is pending cannot display the previous juz', async (t) => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const secondJuz = verses(2, 142, 252);
  const loaded = loadHook('Juz', ({ juzId }) => juzId === 2 ? secondJuz : null, () => pending);
  const reader = await mount(t, loaded, { juzNumber: 1, translationIds: [20] });
  await reader.update({ juzNumber: 2, translationIds: [20] });
  await act(async () => resolve([...verses(1, 1, 7), ...verses(2, 1, 141)]));
  assert.equal(reader.current.getVerseByKey('2:142').verse_key, '2:142');
  assert.equal(reader.current.getVerseByKey('1:1'), undefined);
});

for (const kind of ['Surah', 'Juz']) {
  test(`${kind} seeds page caches under the requested word language`, async () => {
    const exports = {};
    const source = ts.transpileModule(
      readFileSync(path.join(__dirname, `../../lib/${kind.toLowerCase()}/offline${kind}PageCache.ts`), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }
    ).outputText;
    const rows = verses(2, 142, 252, 'bn');
    const store = {
      getSurahVersesWithTranslations: async () => rows,
      getJuzVersesPageWithTranslations: async () => rows,
    };
    vm.runInNewContext(source, {
      exports, console,
      require(name) {
        if (name.endsWith('juz.json')) return juzData;
        if (name.endsWith('/container')) return { container: { getTranslationOfflineStore: () => store } };
        if (name.endsWith('/options')) return { findMushafOption: () => ({ version: 'test' }) };
        if (name.endsWith('/TajweedNativeText') || name.endsWith('/downloadablePacks') || name.endsWith('/Colors') || name.endsWith('/db')) return {};
        throw new Error(`Unexpected module: ${name}`);
      },
    });
    const params = { surahId: 2, juzId: 2, translationIds: [20], perPage: 30, wordLang: 'bn' };
    await exports[`getOffline${kind}Cached`](params);
    const peek = exports[`peekOffline${kind}PageCache`];
    assert.equal(peek({ ...params, wordLang: 'en', page: 1 }), null);
    assert.equal(peek({ ...params, page: 1 })[0].wordsJson, rows[0].wordsJson);
  });
}

test('mushaf reader applies header inset changes without reloading the WebView', async (t) => {
  const exports = {};
  const injected = [];
  let webViewMounts = 0;
  const source = ts.transpileModule(
    readFileSync(path.join(__dirname, '../../components/mushaf/MushafSingleDocumentReader.tsx'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }
  ).outputText;
  const WebView = React.forwardRef(function WebView(props, ref) {
    React.useEffect(() => { webViewMounts += 1; }, []);
    React.useImperativeHandle(ref, () => ({ injectJavaScript: (script) => injected.push(script) }), []);
    return React.createElement('WebViewHost', props);
  });
  vm.runInNewContext(source, {
    exports, setTimeout, clearTimeout,
    require(name) {
      if (name === 'react') return React;
      if (name === 'react/jsx-runtime') return require(name);
      if (name === 'react-native') return {
        Animated: { Value: class { setValue() {} }, View: 'AnimatedView' },
        StyleSheet: { create: (styles) => styles },
        View: 'View',
        useWindowDimensions: () => ({ width: 400, height: 800 }),
      };
      if (name === 'react-native-webview') return { WebView };
      if (name === 'expo-file-system/legacy') return {};
      if (name.endsWith('/mushafWordPayload')) return { resolveMushafVerseKey: () => null };
      if (name.endsWith('/buildMushafReaderWebViewDocument')) return {
        buildMushafReaderWebViewShellDocument: ({ focusTopInsetPx }) => ({ html: `shell:${focusTopInsetPx}`, layout: {} }),
        buildMushafReaderWebViewPagesScript: () => '',
      };
      if (name.endsWith('/MushafWebViewPage')) return { estimateMushafWebViewPageHeight: () => 900 };
      if (name.endsWith('/ThemeContext')) return { useAppTheme: () => ({ resolvedTheme: 'dark' }) };
      if (name.endsWith('/container')) return {
        container: { getMushafPageRepository: () => ({ getPage: () => new Promise(() => {}) }) },
      };
      throw new Error(`Unexpected module: ${name}`);
    },
  });
  const props = {
    backgroundPageNumbers: [], chapterNamesById: new Map(), expectedVersion: 'v1', focusTopInsetPx: 76,
    initialPageNumber: 2, mushafScaleStep: 6, onSelectionChange() {}, onVersePress() {}, packId: 'qcf', totalPages: 604,
  };
  let root;
  await act(async () => { root = create(React.createElement(exports.MushafSingleDocumentReader, props)); });
  t.after(async () => { await act(async () => root.unmount()); });
  const host = () => root.root.findByType('WebViewHost').props;
  const initialHtml = host().source.html;
  await act(async () => host().onMessage({ nativeEvent: { data: JSON.stringify({ type: 'renderer-ready' }) } }));

  // The overlay header settles on its measured height after the reader mounts.
  await act(async () => root.update(React.createElement(exports.MushafSingleDocumentReader, { ...props, focusTopInsetPx: 93 })));
  assert.equal(webViewMounts, 1);
  assert.equal(host().source.html, initialHtml);
  assert.match(injected.at(-1), /setFocusTopInset\(93\)/);
});
