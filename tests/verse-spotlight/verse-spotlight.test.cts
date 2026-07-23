declare function require(id: string): any;

const assert = require('node:assert/strict') as {
  deepEqual(actual: unknown, expected: unknown): void;
  equal(actual: unknown, expected: unknown): void;
  notEqual(actual: unknown, expected: unknown): void;
  ok(value: unknown, message?: string): void;
  match(value: string, expected: RegExp): void;
  rejects(callback: () => Promise<unknown>, expected?: RegExp): Promise<void>;
};
const test = require('node:test') as (
  name: string,
  callback: () => void | Promise<void>
) => void;

import {
  CURATED_ANCHOR_KEYS,
  VERSE_SPOTLIGHT_POOL_VERSION,
} from '../../lib/verse-spotlight/anchorPool';
import {
  BUNDLED_SAHIH_TRANSLATION_ID,
  getBundledFallbackVerse,
} from '../../lib/verse-spotlight/bundledFallback';
import {
  CANONICAL_VERSE_COUNT,
  CANONICAL_VERSE_KEYS,
  FINAL_VERSE_KEY,
  FIRST_VERSE_KEY,
  getCanonicalVerse,
  getNextVerseKey,
  getPreviousVerseKey,
  getVerseReaderTarget,
  isValidVerseKey,
} from '../../lib/verse-spotlight/canonicalIndex';
import type {
  KeyValueStorage,
  TranslationDownloadIndexReader,
  TranslationVerseReader,
  VerseKey,
} from '../../lib/verse-spotlight/contracts';
import {
  HOME_SPOTLIGHT_ROTATION_INTERVAL_MS,
  VERSE_SPOTLIGHT_STORAGE_KEYS,
  calculateNextRandomAt,
  createSpotlightState,
  isSpotlightStateExpired,
  normalizeSpotlightState,
  selectRandomAnchor,
} from '../../lib/verse-spotlight/engine';
import {
  buildHomeSpotlightPreviewText,
  HomeVerseSpotlightController,
  getHomeSpotlightSwipeNavigation,
  isHomeSpotlightContentLong,
} from '../../lib/verse-spotlight/homeController';
import {
  loadHomeSpotlightState,
  loadSpotlightState,
  saveSpotlightState,
} from '../../lib/verse-spotlight/persistence';
import { resolveSpotlightVerse } from '../../lib/verse-spotlight/translationResolver';

class MemoryStorage implements KeyValueStorage {
  readonly values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

function downloadIndex(
  item: { status: string; error?: string } | null,
  shouldThrow = false
): TranslationDownloadIndexReader {
  return {
    async get() {
      if (shouldThrow) throw new Error('corrupt download index');
      return item;
    },
  };
}

function verseReader(
  row: Awaited<ReturnType<TranslationVerseReader['getVerseWithTranslations']>>,
  shouldThrow = false
): TranslationVerseReader {
  return {
    async getVerseWithTranslations() {
      if (shouldThrow) throw new Error('corrupt translation database');
      return row;
    },
  };
}

test('canonical index covers exactly 6,236 unique verses and every navigation result is valid', () => {
  assert.equal(CANONICAL_VERSE_COUNT, 6236);
  assert.equal(CANONICAL_VERSE_KEYS.length, 6236);
  assert.equal(new Set(CANONICAL_VERSE_KEYS).size, 6236);
  assert.equal(FIRST_VERSE_KEY, '1:1');
  assert.equal(FINAL_VERSE_KEY, '114:6');

  for (const verseKey of CANONICAL_VERSE_KEYS) {
    assert.equal(isValidVerseKey(verseKey), true);
    const previous = getPreviousVerseKey(verseKey);
    const next = getNextVerseKey(verseKey);
    if (previous) assert.equal(isValidVerseKey(previous), true);
    if (next) assert.equal(isValidVerseKey(next), true);
  }
});

test('canonical boundary navigation clamps instead of wrapping', () => {
  assert.equal(getPreviousVerseKey('1:1'), null);
  assert.equal(getNextVerseKey('1:7'), '2:1');
  assert.equal(getPreviousVerseKey('2:1'), '1:7');
  assert.equal(getNextVerseKey('114:6'), null);
  assert.equal(getNextVerseKey('not-a-verse'), null);
  assert.equal(getPreviousVerseKey('2:999'), null);
});

test('canonical metadata includes display names and the exact translation-reader target', () => {
  assert.deepEqual(getCanonicalVerse('2:1'), {
    verseKey: '2:1',
    canonicalIndex: 7,
    surahId: 2,
    ayahNumber: 1,
    surahName: 'Al-Baqarah',
    surahNameArabic: 'البقرة',
    surahTranslatedName: 'The Cow',
  });
  assert.deepEqual(getVerseReaderTarget('2:255'), {
    pathname: '/surah/[surahId]',
    params: { surahId: '2', startVerse: '255', view: 'translations' },
  });
});

test('every curated anchor is unique and exists in the canonical index and fallback', () => {
  assert.ok(CURATED_ANCHOR_KEYS.length >= 500);
  assert.ok(CURATED_ANCHOR_KEYS.length <= 1000);
  assert.equal(new Set(CURATED_ANCHOR_KEYS).size, CURATED_ANCHOR_KEYS.length);
  assert.ok(VERSE_SPOTLIGHT_POOL_VERSION.length > 0);

  for (const verseKey of CURATED_ANCHOR_KEYS) {
    assert.equal(isValidVerseKey(verseKey), true);
    assert.equal(getBundledFallbackVerse(verseKey)?.verseKey, verseKey);
  }
});

test('bundled Sahih covers every canonical key with non-empty Arabic and translation text', () => {
  assert.equal(BUNDLED_SAHIH_TRANSLATION_ID, 20);
  for (const verseKey of CANONICAL_VERSE_KEYS) {
    const verse = getBundledFallbackVerse(verseKey);
    assert.ok(verse);
    assert.ok(verse?.arabicUthmani.trim());
    assert.ok(verse?.text.trim());
  }
});

test('random selection never returns an invalid key or immediate repeat when alternatives exist', () => {
  const current = CURATED_ANCHOR_KEYS[10] as VerseKey;
  for (const randomValue of [0, 0.1, 0.5, 0.999999, 1, Number.NaN]) {
    const selected = selectRandomAnchor(current, () => randomValue);
    assert.equal(isValidVerseKey(selected), true);
    assert.notEqual(selected, current);
  }

  assert.equal(selectRandomAnchor('1:1', () => 0, ['1:1']), '1:1');
});

test('resolver silently falls back for missing, incomplete, failed, and corrupt installs', async () => {
  const cases: Array<{
    index: TranslationDownloadIndexReader;
    rows: TranslationVerseReader;
  }> = [
    { index: downloadIndex(null), rows: verseReader(null) },
    { index: downloadIndex({ status: 'queued' }), rows: verseReader(null) },
    { index: downloadIndex({ status: 'downloading' }), rows: verseReader(null) },
    { index: downloadIndex({ status: 'failed', error: 'import failed' }), rows: verseReader(null) },
    { index: downloadIndex({ status: 'installed', error: 'corrupt' }), rows: verseReader(null) },
    { index: downloadIndex({ status: 'installed' }), rows: verseReader(null) },
    {
      index: downloadIndex({ status: 'installed' }),
      rows: verseReader({
        verseKey: '2:255',
        arabicUthmani: 'نص',
        translations: [],
      }),
    },
    {
      index: downloadIndex({ status: 'installed' }),
      rows: verseReader({
        verseKey: '2:255',
        arabicUthmani: '',
        translations: [{ translationId: 131, text: 'Selected translation' }],
      }),
    },
    { index: downloadIndex(null, true), rows: verseReader(null) },
    { index: downloadIndex({ status: 'installed' }), rows: verseReader(null, true) },
  ];

  for (const item of cases) {
    const resolved = await resolveSpotlightVerse({
      requestedTranslationId: 131,
      verseKey: '2:255',
      downloadIndex: item.index,
      offlineTranslations: item.rows,
    });
    assert.equal(resolved.requestedTranslationId, 131);
    assert.equal(resolved.effectiveTranslationId, 20);
    assert.equal(resolved.source, 'bundled-fallback');
    assert.equal(resolved.translationText, getBundledFallbackVerse('2:255')?.text);
  }
});

test('an installed exact translation row wins without mixing sources', async () => {
  const resolved = await resolveSpotlightVerse({
    requestedTranslationId: 131,
    verseKey: '2:255',
    downloadIndex: downloadIndex({ status: 'installed' }),
    offlineTranslations: verseReader({
      verseKey: '2:255',
      arabicUthmani: 'installed Arabic',
      translations: [
        { translationId: 20, text: 'must not be mixed' },
        { translationId: 131, text: 'selected installed translation' },
      ],
    }),
  });

  assert.deepEqual(resolved, {
    verseKey: '2:255',
    arabicUthmani: 'installed Arabic',
    translationText: 'selected installed translation',
    requestedTranslationId: 131,
    effectiveTranslationId: 131,
    source: 'installed',
  });
});

test('requesting Sahih uses the bundle without consulting installed storage', async () => {
  let indexRead = false;
  let verseRead = false;
  const resolved = await resolveSpotlightVerse({
    requestedTranslationId: 20,
    verseKey: '1:1',
    downloadIndex: {
      async get() {
        indexRead = true;
        return { status: 'installed' };
      },
    },
    offlineTranslations: {
      async getVerseWithTranslations() {
        verseRead = true;
        return null;
      },
    },
  });
  assert.equal(indexRead, false);
  assert.equal(verseRead, false);
  assert.equal(resolved.effectiveTranslationId, 20);
  assert.equal(resolved.source, 'bundled-fallback');
});

test('invalid verse keys are rejected before any storage query', async () => {
  await assert.rejects(
    () =>
      resolveSpotlightVerse({
        requestedTranslationId: 131,
        verseKey: '115:1',
        downloadIndex: downloadIndex({ status: 'installed' }),
        offlineTranslations: verseReader(null),
      }),
    /invalid Verse Spotlight key/
  );
});

test('expiration and state normalization are deterministic', () => {
  const selectedAt = 1_000_000;
  const state = createSpotlightState({
    surface: 'home',
    verseKey: '1:1',
    selectedAt,
    rotationIntervalMs: HOME_SPOTLIGHT_ROTATION_INTERVAL_MS,
    requestedTranslationId: 131,
    effectiveTranslationId: 131,
  });
  assert.equal(
    state.nextRandomAt,
    calculateNextRandomAt(selectedAt, HOME_SPOTLIGHT_ROTATION_INTERVAL_MS)
  );
  assert.equal(isSpotlightStateExpired(state, (state.nextRandomAt as number) - 1), false);
  assert.equal(isSpotlightStateExpired(state, state.nextRandomAt as number), true);
  assert.equal(calculateNextRandomAt(selectedAt, null), null);

  const normalized = normalizeSpotlightState(state, {
    surface: 'home',
    now: selectedAt + 10,
    rotationIntervalMs: HOME_SPOTLIGHT_ROTATION_INTERVAL_MS,
    requestedTranslationId: 85,
    random: () => 0,
  });
  assert.equal(normalized.verseKey, '1:1');
  assert.equal(normalized.requestedTranslationId, 85);
  assert.equal(normalized.effectiveTranslationId, 20);

  const recovered = normalizeSpotlightState(
    { ...state, poolVersion: 'obsolete', verseKey: '999:1' },
    {
      surface: 'home',
      now: selectedAt + 20,
      rotationIntervalMs: HOME_SPOTLIGHT_ROTATION_INTERVAL_MS,
      requestedTranslationId: 85,
      random: () => 0,
    }
  );
  assert.equal(recovered.verseKey, CURATED_ANCHOR_KEYS[0]);
  assert.equal(recovered.selectedAt, selectedAt + 20);
});

test('Home and widget persistence use separate keys and corrupt Home state recovers safely', async () => {
  const storage = new MemoryStorage();
  const homeState = await loadHomeSpotlightState({
    storage,
    now: 100,
    requestedTranslationId: 131,
    random: () => 0,
  });
  const widgetState = await loadSpotlightState({
    storage,
    surface: 'android-widget',
    now: 200,
    rotationIntervalMs: null,
    requestedTranslationId: 131,
    random: () => 0.5,
  });

  await saveSpotlightState(storage, homeState);
  await saveSpotlightState(storage, widgetState);
  assert.notEqual(
    VERSE_SPOTLIGHT_STORAGE_KEYS.home,
    VERSE_SPOTLIGHT_STORAGE_KEYS['android-widget']
  );
  assert.equal(
    JSON.parse(storage.values.get(VERSE_SPOTLIGHT_STORAGE_KEYS.home) ?? '{}').surface,
    'home'
  );
  assert.equal(
    JSON.parse(storage.values.get(VERSE_SPOTLIGHT_STORAGE_KEYS['android-widget']) ?? '{}').surface,
    'android-widget'
  );

  storage.values.set(VERSE_SPOTLIGHT_STORAGE_KEYS.home, '{bad json');
  const recovered = await loadHomeSpotlightState({
    storage,
    now: 300,
    requestedTranslationId: 131,
    random: () => 0,
  });
  assert.equal(recovered.surface, 'home');
  assert.equal(recovered.verseKey, CURATED_ANCHOR_KEYS[0]);
  assert.equal(isValidVerseKey(recovered.verseKey), true);
});

function spotlightContent(
  verseKey: VerseKey,
  requestedTranslationId = 20,
  effectiveTranslationId = 20
) {
  return {
    verseKey,
    arabicUthmani: 'نص الآية',
    translationText: `Translation for ${verseKey}`,
    requestedTranslationId,
    effectiveTranslationId,
    source: effectiveTranslationId === 20 ? 'bundled-fallback' as const : 'installed' as const,
  };
}

function homeState(
  verseKey: VerseKey,
  selectedAt = 1_000,
  requestedTranslationId = 20
) {
  return createSpotlightState({
    surface: 'home',
    verseKey,
    selectedAt,
    rotationIntervalMs: HOME_SPOTLIGHT_ROTATION_INTERVAL_MS,
    requestedTranslationId,
    effectiveTranslationId: 20,
  });
}

test('Home controller hydrates, resolves offline content, and persists effective translation state', async () => {
  const persisted: Array<ReturnType<typeof homeState>> = [];
  const controller = new HomeVerseSpotlightController(85, {
    hydrate: async () => homeState('2:255', 1_000, 85),
    persist: async (state) => {
      persisted.push(state);
    },
    resolve: async ({ requestedTranslationId, verseKey }) =>
      spotlightContent(verseKey as VerseKey, requestedTranslationId, 85),
    now: () => 2_000,
  });

  assert.equal(controller.getSnapshot().status, 'loading');
  await controller.hydrate();
  assert.equal(controller.getSnapshot().status, 'ready');
  assert.equal(controller.getSnapshot().state?.verseKey, '2:255');
  assert.equal(controller.getSnapshot().state?.effectiveTranslationId, 85);
  assert.equal(controller.getSnapshot().content?.source, 'installed');
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  assert.equal(persisted.at(-1)?.effectiveTranslationId, 85);
  controller.dispose();
});

test('Home controller catches up an expired active state and shuffle avoids an immediate repeat', async () => {
  let now = HOME_SPOTLIGHT_ROTATION_INTERVAL_MS + 1;
  const controller = new HomeVerseSpotlightController(20, {
    hydrate: async () => homeState(CURATED_ANCHOR_KEYS[0], 0),
    persist: async () => undefined,
    resolve: async ({ verseKey }) => spotlightContent(verseKey as VerseKey),
    now: () => now,
    random: () => 0,
    schedule: () => 1,
    cancelScheduled: () => undefined,
  });

  controller.setActive(true);
  await controller.hydrate();
  const rotatedKey = controller.getSnapshot().state?.verseKey;
  assert.notEqual(rotatedKey, CURATED_ANCHOR_KEYS[0]);
  assert.equal(controller.getSnapshot().state?.selectedAt, now);

  const beforeShuffle = rotatedKey;
  assert.equal(controller.shuffle(), true);
  assert.notEqual(controller.getSnapshot().state?.verseKey, beforeShuffle);
  now += 1;
  controller.dispose();
});

test('Home arrows clamp at Quran boundaries and canonical cross-surah navigation is sequential', async () => {
  const firstController = new HomeVerseSpotlightController(20, {
    hydrate: async () => homeState('1:1'),
    persist: async () => undefined,
    resolve: async ({ verseKey }) => spotlightContent(verseKey as VerseKey),
    now: () => 5_000,
  });
  await firstController.hydrate();
  assert.equal(firstController.navigate('previous'), false);
  assert.equal(firstController.getSnapshot().state?.verseKey, '1:1');
  firstController.dispose();

  const boundaryController = new HomeVerseSpotlightController(20, {
    hydrate: async () => homeState('1:7'),
    persist: async () => undefined,
    resolve: async ({ verseKey }) => spotlightContent(verseKey as VerseKey),
    now: () => 5_000,
  });
  await boundaryController.hydrate();
  assert.equal(boundaryController.navigate('next'), true);
  assert.equal(boundaryController.getSnapshot().state?.verseKey, '2:1');
  assert.equal(boundaryController.navigate('previous'), true);
  assert.equal(boundaryController.getSnapshot().state?.verseKey, '1:7');
  boundaryController.dispose();
});

test('Home swipe semantics reject vertical gestures and map physical directions explicitly', () => {
  assert.equal(getHomeSpotlightSwipeNavigation(70, 5), 'previous');
  assert.equal(getHomeSpotlightSwipeNavigation(-70, 5), 'next');
  assert.equal(getHomeSpotlightSwipeNavigation(30, 2), null);
  assert.equal(getHomeSpotlightSwipeNavigation(80, 100), null);
});

test('Home controller ignores stale translation results after rapid sequential navigation', async () => {
  const pendingResolutions: Array<
    (value: ReturnType<typeof spotlightContent>) => void
  > = [];
  const controller = new HomeVerseSpotlightController(20, {
    hydrate: async () => homeState('1:6'),
    persist: async () => undefined,
    resolve: ({ verseKey }) =>
      new Promise((resolve) => {
        pendingResolutions.push(resolve);
      }),
    now: () => 5_000,
  });

  const hydration = controller.hydrate();
  await Promise.resolve();
  assert.equal(controller.navigate('next'), true);
  assert.equal(controller.getSnapshot().state?.verseKey, '1:7');
  assert.ok(pendingResolutions[1]);
  pendingResolutions[1]?.(spotlightContent('1:7'));
  await Promise.resolve();
  assert.equal(controller.getSnapshot().content?.verseKey, '1:7');
  pendingResolutions[0]?.(spotlightContent('1:6'));
  await hydration;
  assert.equal(controller.getSnapshot().content?.verseKey, '1:7');
  controller.dispose();
});

test('Home focus refresh picks up a newly installed selected translation without changing verse', async () => {
  let resolutionCount = 0;
  const controller = new HomeVerseSpotlightController(85, {
    hydrate: async () => homeState('36:58', 1_000, 85),
    persist: async () => undefined,
    resolve: async ({ requestedTranslationId, verseKey }) => {
      resolutionCount += 1;
      return spotlightContent(
        verseKey as VerseKey,
        requestedTranslationId,
        resolutionCount === 1 ? 20 : 85
      );
    },
    now: () => 2_000,
    schedule: () => 1,
    cancelScheduled: () => undefined,
  });

  await controller.hydrate();
  assert.equal(controller.getSnapshot().state?.effectiveTranslationId, 20);
  controller.setActive(true);
  await Promise.resolve();
  assert.equal(controller.getSnapshot().state?.verseKey, '36:58');
  assert.equal(controller.getSnapshot().state?.effectiveTranslationId, 85);
  controller.dispose();
});

test('Home controller schedules only while active and cancels on blur', async () => {
  let schedules = 0;
  let cancellations = 0;
  const controller = new HomeVerseSpotlightController(20, {
    hydrate: async () => homeState('2:255', 1_000),
    persist: async () => undefined,
    resolve: async ({ verseKey }) => spotlightContent(verseKey as VerseKey),
    now: () => 2_000,
    schedule: () => {
      schedules += 1;
      return schedules;
    },
    cancelScheduled: () => {
      cancellations += 1;
    },
  });

  await controller.hydrate();
  assert.equal(schedules, 0);
  controller.setActive(true);
  assert.equal(schedules, 1);
  controller.setActive(false);
  assert.equal(cancellations, 1);
  controller.dispose();
});

test('long-verse presentation is deterministic and exposes the full-reader affordance threshold', () => {
  assert.equal(isHomeSpotlightContentLong(spotlightContent('1:1')), false);
  assert.equal(
    isHomeSpotlightContentLong({
      ...spotlightContent('2:282'),
      translationText: 'x'.repeat(150),
    }),
    false
  );
  assert.equal(
    isHomeSpotlightContentLong({
      ...spotlightContent('2:282'),
      translationText: 'x'.repeat(151),
    }),
    true
  );
  assert.equal(buildHomeSpotlightPreviewText('A short verse.'), 'A short verse.');
  const preview = buildHomeSpotlightPreviewText(
    'This deliberately long translation contains enough complete words to exceed the custom preview boundary without cutting a word in its middle.',
    72
  );
  assert.equal(preview, 'This deliberately long translation contains enough complete words to…');
});

test('Home component wires focus/resume, clean presentation, accessible swipes, and exact opening', () => {
  const source = require('node:fs').readFileSync(
    'components/home/HomeVerseSpotlight.tsx',
    'utf8'
  ) as string;
  const homeSource = require('node:fs').readFileSync('app/(tabs)/index.tsx', 'utf8') as string;

  assert.match(homeSource, /<HomeVerseSpotlight \/>/);
  assert.match(source, /useFocusEffect/);
  assert.match(source, /AppState\.addEventListener/);
  assert.match(source, /useReducedMotion/);
  assert.match(source, /PanResponder\.create/);
  assert.match(source, /getVerseReaderTarget/);
  assert.match(source, /accessibilityActions=/);
  assert.match(source, /actionName === 'increment'/);
  assert.match(source, /actionName === 'decrement'/);
  assert.match(source, /const reference = `\[\$\{verse\.surahName\}/);
  assert.match(source, /textAlign: 'center'/);
  assert.match(source, /buildHomeSpotlightPreviewText/);
  assert.match(source, /styles\.referenceDiamond/);
  assert.equal(source.includes('function SpotlightControl'), false);
  assert.equal(source.includes('getSpotlightTranslationAttribution'), false);
  assert.equal(source.includes('content.arabicUthmani'), false);
  assert.equal(source.includes('backgroundColor: palette.surface'), false);
  assert.equal(source.includes('apiFetch'), false);
  assert.equal(homeSource.includes('HomeVersePlaceholder'), false);
});
