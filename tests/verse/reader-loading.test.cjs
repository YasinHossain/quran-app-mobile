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
  const translationRecovery = { surahId: 2, selectionKey: '131', translationIds: [131], verses: [] };
  await update({}, { translationRecovery });
  assert.equal(host().translationRecovery, translationRecovery);
  assert.equal(host().readerState, initialPayload, 'recovering translations must not reload the native base reader');

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

function loadMushafReader({
  getPage = () => new Promise(() => {}),
  peekCachedPage = () => null,
  readAsStringAsync = async () => '',
} = {}) {
  const exports = {};
  const injected = [];
  const shellBuilds = [];
  const webView = { mounts: 0 };
  const source = ts.transpileModule(
    readFileSync(path.join(__dirname, '../../components/mushaf/MushafSingleDocumentReader.tsx'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }
  ).outputText;
  const WebView = React.forwardRef(function WebView(props, ref) {
    React.useEffect(() => { webView.mounts += 1; }, []);
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
      if (name === 'expo-file-system/legacy') return { EncodingType: { Base64: 'base64' }, readAsStringAsync };
      if (name.endsWith('/mushafWordPayload')) return { resolveMushafVerseKey: () => null };
      if (name.endsWith('/buildMushafReaderWebViewDocument')) return {
        buildMushafReaderWebViewShellDocument: (options) => {
          shellBuilds.push(options);
          return { html: `shell:${options.focusTopInsetPx}`, layout: {} };
        },
        buildMushafReaderWebViewPagesScript: ({ pages }) => `pages:${pages.map((page) => (
          page.rendererAssets?.pageFontDataUri ? `${page.pageNumber}+font` : page.pageNumber
        )).join(',')}`,
      };
      if (name.endsWith('/MushafWebViewPage')) return { estimateMushafWebViewPageHeight: () => 900 };
      if (name.endsWith('/ThemeContext')) return { useAppTheme: () => ({ resolvedTheme: 'dark' }) };
      if (name.endsWith('/container')) return {
        container: { getMushafPageRepository: () => ({ getPage, peekCachedPage }) },
      };
      throw new Error(`Unexpected module: ${name}`);
    },
  });
  const props = {
    backgroundPageNumbers: [], chapterNamesById: new Map(), expectedVersion: 'v1', focusTopInsetPx: 76,
    initialPageNumber: 2, mushafScaleStep: 6, onSelectionChange() {}, onVersePress() {}, packId: 'qcf', totalPages: 604,
  };
  return { Reader: exports.MushafSingleDocumentReader, injected, props, shellBuilds, webView };
}

function mushafPage(pageNumber, rendererAssets) {
  return {
    pack: { packId: 'qcf', version: 'v1', lines: 15 },
    pageNumber,
    verses: [{ verseKey: `2:${pageNumber}` }],
    pageLines: { lines: [] },
    ...(rendererAssets ? { rendererAssets } : {}),
  };
}

function sendReaderMessage(root, message) {
  return act(async () => root.root.findByType('WebViewHost').props.onMessage({
    nativeEvent: { data: JSON.stringify(message) },
  }));
}

test('mushaf reader applies header inset changes without reloading the WebView', async (t) => {
  const { Reader, injected, props, webView } = loadMushafReader();
  let root;
  await act(async () => { root = create(React.createElement(Reader, props)); });
  t.after(async () => { await act(async () => root.unmount()); });
  const host = () => root.root.findByType('WebViewHost').props;
  const initialHtml = host().source.html;
  await sendReaderMessage(root, { type: 'renderer-ready' });

  // The overlay header settles on its measured height after the reader mounts.
  await act(async () => root.update(React.createElement(Reader, { ...props, focusTopInsetPx: 93 })));
  assert.equal(webView.mounts, 1);
  assert.equal(host().source.html, initialHtml);
  assert.match(injected.at(-1), /setFocusTopInset\(93\)/);
});

test('mushaf reader renders the opening page before a neighbor page whose data arrives first', async (t) => {
  const pendingPages = new Map();
  const { Reader, injected, props } = loadMushafReader({
    getPage: ({ pageNumber }) => new Promise((resolve) => pendingPages.set(pageNumber, resolve)),
  });
  const resolvePage = (pageNumber) => act(async () => pendingPages.get(pageNumber)(mushafPage(pageNumber)));
  const pageScripts = () => injected.filter((script) => script.startsWith('pages:'));
  let root;
  await act(async () => { root = create(React.createElement(Reader, props)); });
  t.after(async () => { await act(async () => root.unmount()); });
  await sendReaderMessage(root, { type: 'renderer-ready' });
  await sendReaderMessage(root, { type: 'page-window-request', payload: { pageNumbers: [3] } });

  await resolvePage(3);
  assert.deepEqual(pageScripts(), [], 'a neighbor must not occupy the WebView before the opening page');
  await resolvePage(2);
  assert.deepEqual(pageScripts(), ['pages:2']);
  await sendReaderMessage(root, { type: 'reader-page-rendered', payload: { pageNumber: 2 } });
  assert.deepEqual(pageScripts(), ['pages:2', 'pages:3']);
});

test('mushaf reader embeds an opening page already in memory into the WebView document', async (t) => {
  const { Reader, props, shellBuilds } = loadMushafReader({
    peekCachedPage: ({ pageNumber }) => (pageNumber === 2 ? mushafPage(2) : null),
  });
  let root;
  await act(async () => { root = create(React.createElement(Reader, props)); });
  t.after(async () => { await act(async () => root.unmount()); });

  assert.deepEqual(Array.from(shellBuilds.at(-1).initialPages, (page) => page.pageNumber), [2]);
});

test('mushaf reader re-sends a page with its font embedded when the WebView cannot read the font file', async (t) => {
  const fontAssets = { qcfVersion: 'v1', pageFontFamily: 'p2', pageFontFileUri: 'file:///pack/fonts/p2.woff2' };
  const { Reader, injected, props } = loadMushafReader({
    getPage: async ({ pageNumber }) => mushafPage(pageNumber, fontAssets),
    readAsStringAsync: async () => 'Zm9udA==',
  });
  const pageScripts = () => injected.filter((script) => script.startsWith('pages:'));
  let root;
  await act(async () => { root = create(React.createElement(Reader, props)); });
  t.after(async () => { await act(async () => root.unmount()); });
  await sendReaderMessage(root, { type: 'renderer-ready' });
  assert.deepEqual(pageScripts(), ['pages:2'], 'fonts are read from their files by default');

  await sendReaderMessage(root, { type: 'qcf-font-file-failed', payload: { pageNumber: 2 } });
  assert.deepEqual(pageScripts(), ['pages:2', 'pages:2+font']);
});

for (const selected of [[20, 131], [131], []]) {
  test(`Surah keeps Arabic and only selected local translations: ${selected}`, async (t) => {
    const rows = verses(1, 1, 7);
    const loaded = loadHook('Surah', () => rows);
    const reader = await mount(t, loaded, { chapterNumber: 1, translationIds: selected, includeWords: true, allowPartialTranslations: true });
    assert.equal(reader.current.hasLoadedContent, true);
    assert.equal(reader.current.offlineNotInstalled, false);
    assert.deepEqual(Array.from(reader.current.missingTranslationIds), selected.includes(131) ? [131] : []);
    for (let number = 1; number <= 7; number++) {
      const verse = reader.current.getVerseByNumber(number);
      assert.equal(verse.text_uthmani, rows[number - 1].arabicUthmani);
      assert.deepEqual(Array.from(verse.translationItems, (item) => item.resourceId), selected.includes(20) ? [20] : []);
    }
    await act(async () => reader.current.ensureVerseRangeLoaded(1, 7));
    assert.equal(loaded.requests.length, 0, 'partial local data must not trigger verse-page network fetches');
  });
}

test('translation recovery preserves Arabic, words, selection order and ignores a stale surah', async (t) => {
  const rows = verses(1, 1, 7);
  const loaded = loadHook('Surah', () => rows);
  const reader = await mount(t, loaded, { chapterNumber: 1, translationIds: [131, 20], includeWords: true, allowPartialTranslations: true });
  const before = reader.current.getVerseByNumber(3);
  const recovery = {
    surahId: 1, selectionKey: '131,20', translationIds: [131],
    verses: rows.map((row) => ({ verseKey: row.verseKey, translationItems: [{ resourceId: 131, text: `Recovered ${row.verseKey}` }] })),
  };
  await act(async () => reader.current.applyRecoveredTranslations({ ...recovery, surahId: 2 }));
  assert.equal(reader.current.getVerseByNumber(3), before);
  await act(async () => reader.current.applyRecoveredTranslations({ ...recovery, selectionKey: '131' }));
  assert.equal(reader.current.getVerseByNumber(3), before);
  await act(async () => reader.current.applyRecoveredTranslations(recovery));
  const after = reader.current.getVerseByNumber(3);
  assert.equal(after.text_uthmani, before.text_uthmani);
  assert.equal(after.words, before.words);
  assert.deepEqual(Array.from(after.translationItems, (item) => item.resourceId), [131, 20]);
  assert.equal(after.translationItems[0].text, 'Recovered 1:3');
  assert.equal(after.translationItems[1].text, 'Translation');
  await act(async () => reader.current.refresh());
  assert.equal(reader.current.getVerseByNumber(3).translationItems[0].text, 'Recovered 1:3', 'refresh must retain recovered text while the local pack is still missing');

  assert.equal(loaded.requests.length, 0);
});

function loadRecoveryBuilder() {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(
    readFileSync(path.join(__dirname, '../../lib/surah/readerTranslationRecovery.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  ).outputText, { exports });
  return exports.buildReaderTranslationRecovery;
}

test('recovery validates every verse address and resource before marking a translation available', () => {
  const build = loadRecoveryBuilder();
  const rows = Array.from({ length: 7 }, (_, i) => ({
    verse_key: `1:${i + 1}`, verse_number: i + 1,
    translations: [{ resource_id: 131, text: `<p>Verse ${i + 1} &amp; text</p>` }, { resource_id: 20, text: 'Other' }],
  })).reverse();
  const full = build(1, [131], [131, 20], 7, rows);
  assert.deepEqual(Array.from(full.translationIds), [131]);
  assert.equal(full.verses[2].translationItems[0].text, 'Verse 3 & text');
  for (const broken of [rows.slice(1), rows.map((row) => ({ ...row, verse_key: row.verse_key.replace('1:', '2:') })), rows.map((row) => ({ ...row, translations: [] }))]) {
    assert.equal(build(1, [131], [131], 7, broken).translationIds.length, 0);
  }
});

function loadRecoveryHook() {
  let network = { isConnected: false, isInternetReachable: false };
  let listener;
  let appListener;
  let fetchRows = async () => [];
  let requests = 0;
  let subscriptions = 0;
  const exports = {};
  vm.runInNewContext(ts.transpileModule(
    readFileSync(path.join(__dirname, '../../hooks/useReaderTranslationRecovery.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }
  ).outputText, {
    exports,
    require(name) {
      if (name === 'react') return React;
      if (name === 'react-native') return { AppState: { currentState: 'active', addEventListener: (_, cb) => { appListener = cb; return { remove() { appListener = undefined; } }; } } };
      if (name === 'expo-router') return { useFocusEffect: (cb) => React.useEffect(cb, [cb]) };
      if (name === 'expo-network') return {
        getNetworkStateAsync: async () => network,
        addNetworkStateListener: (cb) => { listener = cb; subscriptions++; return { remove() { listener = undefined; subscriptions--; } }; },
      };
      if (name.endsWith('/readerTranslationRecovery')) return { buildReaderTranslationRecovery: loadRecoveryBuilder() };
      if (name.endsWith('/surahTranslationNetworkCache')) return {
        peekNetworkSurahTranslationSnapshot: () => null,
        invalidateNetworkSurahTranslationCache() {},
        getNetworkSurahTranslationCached: async () => { requests++; return fetchRows(); },
      };
      throw new Error(name);
    },
  });
  return {
    hook: exports.useReaderTranslationRecovery,
    get requests() { return requests; },
    get subscriptions() { return subscriptions; },
    set fetchRows(value) { fetchRows = value; },
    async connect(value) { await act(async () => { network = { isConnected: value, isInternetReachable: value }; listener?.(network); }); },
    async foreground() { await act(async () => appListener?.('active')); },
  };
}

test('offline recovery waits for connectivity, restores translations once and releases listeners', async (t) => {
  const loaded = loadRecoveryHook();
  const props = { surahId: 1, translationIds: [20, 131], missingTranslationIds: [131], verseCount: 7, enabled: true };
  const reader = await mount(t, loaded, props);
  assert.equal(reader.current.state, 'offline');
  assert.equal(loaded.requests, 0);
  await act(async () => reader.current.dismiss());
  await reader.update({ ...props, surahId: 2 });
  assert.equal(reader.current.dismissed, true, 'dismissal persists between surahs while offline');
  loaded.fetchRows = async () => Array.from({ length: 7 }, (_, i) => ({ verse_key: `2:${i + 1}`, translations: [{ resource_id: 131, text: 'Restored' }] }));
  await loaded.connect(true);
  assert.equal(reader.current.state, 'ready');
  assert.equal(reader.current.unavailableIds.length, 0);
  assert.equal(reader.current.recovery.surahId, 2);
  assert.equal(loaded.requests, 1);
  assert.equal(loaded.subscriptions, 0, 'successful readers do not keep recovery listeners');
  await loaded.foreground();
  assert.equal(loaded.requests, 1);
});

test('late recovery cannot update a new surah and online failures expose retry', async (t) => {
  const loaded = loadRecoveryHook();
  const props = { surahId: 1, translationIds: [131], missingTranslationIds: [131], verseCount: 7, enabled: true };
  const reader = await mount(t, loaded, props);
  let finish;
  loaded.fetchRows = () => new Promise((resolve) => { finish = resolve; });
  await loaded.connect(true);
  loaded.fetchRows = async () => { throw new Error('Service unavailable'); };
  await reader.update({ ...props, surahId: 2 });
  await act(async () => finish(Array.from({ length: 7 }, (_, i) => ({ verse_key: `1:${i + 1}`, translations: [{ resource_id: 131, text: 'Old' }] }))));
  assert.equal(reader.current.state, 'error');
  assert.equal(reader.current.recovery, undefined);
  assert.deepEqual(Array.from(reader.current.unavailableIds), [131]);
});


test('other Surah hook consumers keep their existing online translation loading path', async (t) => {
  const rows = verses(1, 1, 7);
  const loaded = loadHook('Surah', () => rows);
  const reader = await mount(t, loaded, { chapterNumber: 1, translationIds: [20, 131] });
  assert.equal(reader.current.hasLoadedContent, false, 'partial translations require the reader to opt in');
  assert.ok(loaded.requests.length > 0, 'other consumers must still request their selected online translations');
});

function loadReaderPassage() {
  const transpile = (file) => ts.transpileModule(readFileSync(path.join(__dirname, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const pageRanges = {};
  vm.runInNewContext(transpile('../../src/data/quranPageVerseRanges.ts'), { exports: pageRanges });
  const exports = {};
  vm.runInNewContext(transpile('../../lib/reader/readerPassage.ts'), {
    exports,
    require(name) {
      if (name === '../../src/data/juz.json') return juzData;
      if (name === '../../src/data/quranPageVerseRanges') return pageRanges;
      throw new Error(`Unexpected module: ${name}`);
    },
  });
  return exports;
}

test('Juz and Page passages resolve to exact verse ranges across Surah boundaries', () => {
  const { getJuzPassage, getPagePassage, countPassageVerses, getPassageSurahIds,
    passageContainsVerseKey, formatPassageSpan } = loadReaderPassage();
  const juz3 = getJuzPassage(3);
  assert.deepEqual(
    [juz3.startSurah, juz3.startAyah, juz3.endSurah, juz3.endAyah], [2, 253, 3, 92]
  );
  assert.equal(countPassageVerses(juz3, chapters), 34 + 92);
  assert.deepEqual([...getPassageSurahIds(juz3)], [2, 3]);
  assert.equal(passageContainsVerseKey(juz3, '2:252'), false);
  assert.equal(passageContainsVerseKey(juz3, '2:253'), true);
  assert.equal(passageContainsVerseKey(juz3, '3:92'), true);
  assert.equal(passageContainsVerseKey(juz3, '3:93'), false);
  const name = (id) => ({ 2: 'Al-Baqarah', 3: 'Ali Imran' })[id];
  assert.equal(formatPassageSpan(juz3, name), 'Al-Baqarah 253 – Ali Imran 92');

  const page2 = getPagePassage(2);
  assert.deepEqual([page2.startSurah, page2.startAyah, page2.endSurah, page2.endAyah], [2, 1, 2, 5]);
  assert.equal(countPassageVerses(page2, chapters), 5);
  assert.equal(formatPassageSpan(page2, name), 'Al-Baqarah 1 – 5');
  assert.equal(getPagePassage(605), null);
  assert.equal(countPassageVerses(getJuzPassage(30), chapters), 0, 'unknown chapters skip the count check');
});

test('offline-native reader forwards a Juz range, target and banner to the native view', async (t) => {
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
  const intro = { chapterId: 3, infoLabel: '200 Verses', isMakkah: false, showBismillah: true, surahName: 'Ali Imran' };
  const state = {
    surahId: 2, targetVerse: 1,
    verseRange: { startSurah: 2, startAyah: 253, endSurah: 3, endAyah: 92 },
    targetVerseKey: '3:1', expectedVerseCount: 126, surahIntros: [intro],
    scopeBanner: { title: 'Juz 3', subtitle: 'Al-Baqarah 253 – Ali Imran 92' },
    settings: { translationIds: [20] }, theme: {}, topInsetPx: 300, bottomInsetPx: 24,
  };
  let root;
  await act(async () => { root = create(React.createElement(Reader, { readerState: state })); });
  t.after(async () => { await act(async () => root.unmount()); });
  const payload = root.root.findByType('NativeReaderHost').props.readerState;
  assert.deepEqual(payload.verseRange, state.verseRange);
  assert.equal(payload.targetVerseKey, '3:1');
  assert.equal(payload.expectedVerseCount, 126);
  assert.deepEqual(payload.surahIntros, [intro]);
  assert.deepEqual(payload.scopeBanner, state.scopeBanner);
  assert.equal(Object.hasOwn(payload, 'verses'), false);
});
