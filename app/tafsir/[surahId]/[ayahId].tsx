import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Settings } from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { BookmarkModal } from '@/components/bookmarks/BookmarkModal';
import { TafsirHtml } from '@/components/tafsir/TafsirHtml';
import { TafsirTabs } from '@/components/tafsir/TafsirTabs';
import { SettingsSidebar } from '@/components/reader/settings/SettingsSidebar';
import { VerseActionsSheet } from '@/components/surah/VerseActionsSheet';
import { VerseCard } from '@/components/surah/VerseCard';
import { AddToPlannerModal, type VerseSummaryDetails } from '@/components/verse-planner-modal';
import Colors from '@/constants/Colors';
import { useChapters } from '@/hooks/useChapters';
import { useTafsirResources } from '@/hooks/useTafsirResources';
import { useTranslationResources } from '@/hooks/useTranslationResources';
import { getTafsirCached } from '@/lib/tafsir/tafsirCache';
import { useAudioPlayer } from '@/providers/AudioPlayerContext';
import { useBookmarks } from '@/providers/BookmarkContext';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';

import type { SurahHeaderChapter } from '@/components/surah/SurahHeaderCard';
import type { Bookmark } from '@/types';

type ApiVerse = {
  verse_key: string;
  text_uthmani?: string;
  translations?: Array<{ resource_id: number; resource_name?: string; text: string }>;
};

type ApiVerseResponse = {
  verse: ApiVerse;
};

type VerseTarget = {
  surahId: number;
  ayahId: number;
};

type PagerItem = {
  slot: 'prev' | 'current' | 'next';
  target: VerseTarget | null;
};

type PageState = {
  signature: string;
  chapter: SurahHeaderChapter | null;
  verse: ApiVerse | null;
  isLoading: boolean;
  errorMessage: string | null;
  tafsirHtml: string;
  isTafsirLoading: boolean;
  tafsirError: string | null;
};

type TranslationItem = { resourceId: number; resourceName?: string; text: string };

const EMPTY_PAGE_STATE: PageState = {
  signature: '',
  chapter: null,
  verse: null,
  isLoading: true,
  errorMessage: null,
  tafsirHtml: '',
  isTafsirLoading: false,
  tafsirError: null,
};

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function getVerseKey(target: VerseTarget): string {
  return `${target.surahId}:${target.ayahId}`;
}

function areSameTarget(a: VerseTarget | null, b: VerseTarget | null): boolean {
  if (!a || !b) return false;
  return a.surahId === b.surahId && a.ayahId === b.ayahId;
}

function getChapterById(chapters: SurahHeaderChapter[], surahId: number): SurahHeaderChapter | null {
  return chapters.find((chapter) => chapter.id === surahId) ?? null;
}

function getAdjacentTargets(
  target: VerseTarget | null,
  chapters: SurahHeaderChapter[]
): { chapter: SurahHeaderChapter | null; prev: VerseTarget | null; next: VerseTarget | null } {
  if (!target) {
    return { chapter: null, prev: null, next: null };
  }

  const currentIndex = chapters.findIndex((chapter) => chapter.id === target.surahId);
  const chapter = currentIndex >= 0 ? chapters[currentIndex] ?? null : null;

  if (!chapter) {
    return { chapter: null, prev: null, next: null };
  }

  const prev =
    target.ayahId > 1
      ? { surahId: target.surahId, ayahId: target.ayahId - 1 }
      : currentIndex > 0
        ? {
            surahId: chapters[currentIndex - 1]!.id,
            ayahId: chapters[currentIndex - 1]!.verses_count,
          }
        : null;

  const next =
    target.ayahId < chapter.verses_count
      ? { surahId: target.surahId, ayahId: target.ayahId + 1 }
      : currentIndex < chapters.length - 1
        ? { surahId: chapters[currentIndex + 1]!.id, ayahId: 1 }
        : null;

  return { chapter, prev, next };
}

function buildTranslationItems({
  verse,
  translationIds,
  showTranslationAttribution,
  translationsById,
}: {
  verse: ApiVerse | null;
  translationIds: number[];
  showTranslationAttribution: boolean;
  translationsById: Map<number, { name: string }>;
}): TranslationItem[] {
  const incoming = verse?.translations ?? [];
  if (incoming.length === 0) return [];

  const byResourceId = new Map(incoming.map((translation) => [translation.resource_id, translation]));
  const ordered = translationIds
    .map((id) => {
      const match = byResourceId.get(id);
      const text = typeof match?.text === 'string' ? stripHtml(match.text).trim() : '';
      if (!text) return null;
      const name = typeof match?.resource_name === 'string' ? match.resource_name.trim() : undefined;
      const base = { resourceId: id, text };
      return name ? { ...base, resourceName: name } : base;
    })
    .filter((item): item is TranslationItem => item !== null);

  const base = ordered.length
    ? ordered
    : incoming
        .map((translation) => {
          const text = stripHtml(translation.text ?? '').trim();
          if (!text) return null;
          const name =
            typeof translation.resource_name === 'string' ? translation.resource_name.trim() : undefined;
          const base = { resourceId: translation.resource_id, text };
          return name ? { ...base, resourceName: name } : base;
        })
        .filter((item): item is TranslationItem => item !== null);

  if (!showTranslationAttribution) return base;

  return base.map((item) => {
    if (item.resourceName) return item;
    const fallbackName = translationsById.get(item.resourceId)?.name ?? `Translation ${item.resourceId}`;
    return { ...item, resourceName: fallbackName };
  });
}

async function fetchVerseByKey(verseKey: string, translationIdsKey: string): Promise<ApiVerse> {
  const verseUrl = `https://api.quran.com/api/v4/verses/by_key/${encodeURIComponent(
    verseKey
  )}?language=en&words=false&translations=${encodeURIComponent(translationIdsKey)}&fields=text_uthmani`;

  const verseRes = await fetch(verseUrl);
  if (!verseRes.ok) {
    throw new Error(`Failed to load verse (${verseRes.status})`);
  }

  const verseJson = (await verseRes.json()) as ApiVerseResponse;
  return verseJson.verse;
}

export default function TafsirScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{ surahId?: string | string[]; ayahId?: string | string[] }>();
  const router = useRouter();
  const { width: viewportWidth } = useWindowDimensions();
  const pageWidth = React.useMemo(() => Math.max(viewportWidth, 1), [viewportWidth]);

  const surahIdRaw = Array.isArray(params.surahId) ? params.surahId[0] : params.surahId;
  const ayahIdRaw = Array.isArray(params.ayahId) ? params.ayahId[0] : params.ayahId;

  const parsedRouteTarget = React.useMemo<VerseTarget | null>(() => {
    const surahNumber = surahIdRaw ? Number(surahIdRaw) : NaN;
    const ayahNumber = ayahIdRaw ? Number(ayahIdRaw) : NaN;
    if (!Number.isFinite(surahNumber) || surahNumber <= 0) return null;
    if (!Number.isFinite(ayahNumber) || ayahNumber <= 0) return null;
    return { surahId: surahNumber, ayahId: ayahNumber };
  }, [ayahIdRaw, surahIdRaw]);

  const [currentTarget, setCurrentTarget] = React.useState<VerseTarget | null>(parsedRouteTarget);
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [verseRenderSignal, setVerseRenderSignal] = React.useState(0);
  const [isVerseActionsOpen, setIsVerseActionsOpen] = React.useState(false);
  const [isBookmarkModalOpen, setIsBookmarkModalOpen] = React.useState(false);
  const [isAddToPlannerOpen, setIsAddToPlannerOpen] = React.useState(false);
  const [plannerVerseSummary, setPlannerVerseSummary] = React.useState<VerseSummaryDetails | null>(
    null
  );
  const [activeVerse, setActiveVerse] = React.useState<{
    title: string;
    surahId: number;
    verseKey: string;
    arabicText: string;
    translationTexts: string[];
  } | null>(null);

  React.useEffect(() => {
    if (!parsedRouteTarget) {
      setCurrentTarget(null);
      return;
    }
    setCurrentTarget((previous) =>
      previous && areSameTarget(previous, parsedRouteTarget) ? previous : parsedRouteTarget
    );
  }, [parsedRouteTarget]);

  const { resolvedTheme, isDark } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { settings } = useSettings();
  const audio = useAudioPlayer();
  const { isPinned } = useBookmarks();
  const { chapters } = useChapters();

  const translationIds = React.useMemo(() => {
    const ids = Array.isArray(settings.translationIds)
      ? settings.translationIds
      : [settings.translationId ?? 20];
    return ids.filter((id) => Number.isFinite(id) && id > 0);
  }, [settings.translationId, settings.translationIds]);
  const translationIdsKey = React.useMemo(() => translationIds.join(','), [translationIds]);

  const showTranslationAttribution = translationIds.length > 1;
  const { translationsById } = useTranslationResources({
    enabled: showTranslationAttribution,
    language: settings.contentLanguage,
  });

  const tafsirIds = settings.tafsirIds ?? [];
  const tafsirIdsKey = React.useMemo(() => tafsirIds.join(','), [tafsirIds]);
  const activeTafsirId = tafsirIds[0];
  const activeTafsirIdKey = typeof activeTafsirId === 'number' ? String(activeTafsirId) : 'none';
  const pageSignature = `${translationIdsKey}|${tafsirIdsKey}|${activeTafsirIdKey}`;

  const { tafsirById } = useTafsirResources({ enabled: tafsirIds.length > 0 });
  const activeTafsirName =
    typeof activeTafsirId === 'number'
      ? tafsirById.get(activeTafsirId)?.displayName ?? `Tafsir ${activeTafsirId}`
      : '';

  const currentNavigation = React.useMemo(
    () => getAdjacentTargets(currentTarget, chapters),
    [chapters, currentTarget]
  );

  const headerTitle = React.useMemo(() => {
    if (currentNavigation.chapter?.name_simple) return currentNavigation.chapter.name_simple;
    if (currentTarget?.surahId) return `Surah ${currentTarget.surahId}`;
    return 'Surah';
  }, [currentNavigation.chapter?.name_simple, currentTarget?.surahId]);

  const openVerseActions = React.useCallback(
    (params: {
      title: string;
      surahId: number;
      verseKey: string;
      arabicText: string;
      translationTexts: string[];
    }) => {
      setActiveVerse(params);
      setIsVerseActionsOpen(true);
    },
    []
  );

  const closeVerseActions = React.useCallback(() => {
    setIsVerseActionsOpen(false);
  }, []);

  const handlePlayPause = React.useCallback(() => {
    const activeVerseKey = activeVerse?.verseKey;
    if (!activeVerseKey) return;

    if (audio.activeVerseKey === activeVerseKey) {
      audio.togglePlay();
      return;
    }

    audio.playVerse(activeVerseKey);
  }, [activeVerse?.verseKey, audio.activeVerseKey, audio.playVerse, audio.togglePlay]);

  const handleBookmark = React.useCallback(() => {
    if (!activeVerse) return;
    setIsBookmarkModalOpen(true);
  }, [activeVerse]);

  const handleAddToPlan = React.useCallback(() => {
    const activeVerseKey = activeVerse?.verseKey;
    if (!activeVerseKey) return;
    setPlannerVerseSummary({
      verseKey: activeVerseKey,
      ...(Number.isFinite(activeVerse?.surahId) ? { surahId: activeVerse.surahId } : {}),
      arabicText: activeVerse?.arabicText,
      translationText: activeVerse?.translationTexts?.[0],
    });
    setIsAddToPlannerOpen(true);
  }, [activeVerse]);

  const handleShare = React.useCallback(async () => {
    if (!activeVerse) return;
    const lines = [
      activeVerse.title ? `${activeVerse.title} ${activeVerse.verseKey}` : activeVerse.verseKey,
      '',
      activeVerse.arabicText,
      '',
      ...(activeVerse.translationTexts?.length ? [activeVerse.translationTexts[0]!] : []),
    ];
    try {
      await Share.share({ message: lines.join('\n') });
    } catch {
      // Ignore share failures.
    }
  }, [activeVerse]);

  const activeVersePinned = React.useMemo(() => {
    if (!activeVerse) return false;
    return isPinned(activeVerse.verseKey);
  }, [activeVerse, isPinned]);

  const activeVerseBookmarkMetadata = React.useMemo(() => {
    if (!activeVerse) return undefined;
    const metadata: Partial<Bookmark> = {
      verseKey: activeVerse.verseKey,
      ...(activeVerse.arabicText ? { verseText: activeVerse.arabicText } : {}),
      ...(activeVerse.title ? { surahName: activeVerse.title } : {}),
      ...(activeVerse.translationTexts?.[0] ? { translation: activeVerse.translationTexts[0] } : {}),
    };
    return metadata;
  }, [activeVerse]);

  const [pageStateByKey, setPageStateByKey] = React.useState<Record<string, PageState>>({});
  const pageStateByKeyRef = React.useRef(pageStateByKey);
  const inflightRequestsRef = React.useRef<Set<string>>(new Set());
  const generationRef = React.useRef(0);

  React.useEffect(() => {
    pageStateByKeyRef.current = pageStateByKey;
  }, [pageStateByKey]);

  React.useEffect(() => {
    generationRef.current += 1;
    inflightRequestsRef.current.clear();
    setPageStateByKey({});
    setVerseRenderSignal((value) => value + 1);
  }, [pageSignature]);

  const loadPage = React.useCallback(
    async (target: VerseTarget) => {
      const verseKey = getVerseKey(target);
      const requestKey = `${pageSignature}:${verseKey}`;
      if (inflightRequestsRef.current.has(requestKey)) return;

      const existing = pageStateByKeyRef.current[verseKey];
      const hasVerseReady =
        existing?.signature === pageSignature &&
        !existing.isLoading &&
        (existing.verse !== null || existing.errorMessage !== null);
      const hasTafsirReady =
        tafsirIds.length !== 1 ||
        typeof activeTafsirId !== 'number' ||
        (existing?.signature === pageSignature &&
          !existing.isTafsirLoading &&
          (typeof existing.tafsirHtml === 'string' || existing.tafsirError !== null));
      if (hasVerseReady && hasTafsirReady) return;

      inflightRequestsRef.current.add(requestKey);
      const generation = generationRef.current;
      const chapter = getChapterById(chapters, target.surahId);
      const needsSingleTafsir = tafsirIds.length === 1 && typeof activeTafsirId === 'number';

      setPageStateByKey((previous) => ({
        ...previous,
        [verseKey]: {
          signature: pageSignature,
          chapter,
          verse: previous[verseKey]?.verse ?? null,
          isLoading: true,
          errorMessage: null,
          tafsirHtml: previous[verseKey]?.tafsirHtml ?? '',
          isTafsirLoading: needsSingleTafsir,
          tafsirError: null,
        },
      }));

      let verse: ApiVerse | null = null;
      let verseError: string | null = null;
      let tafsirHtml = '';
      let tafsirError: string | null = null;

      try {
        verse = await fetchVerseByKey(verseKey, translationIdsKey);
      } catch (error) {
        verseError = (error as Error).message;
      }

      if (!verseError && needsSingleTafsir) {
        try {
          tafsirHtml = await getTafsirCached(verseKey, activeTafsirId);
        } catch {
          tafsirError = 'Failed to load tafsir content.';
        }
      }

      if (generation !== generationRef.current) {
        inflightRequestsRef.current.delete(requestKey);
        return;
      }

      setPageStateByKey((previous) => ({
        ...previous,
        [verseKey]: {
          signature: pageSignature,
          chapter,
          verse,
          isLoading: false,
          errorMessage: verseError,
          tafsirHtml,
          isTafsirLoading: false,
          tafsirError,
        },
      }));
      inflightRequestsRef.current.delete(requestKey);
    },
    [activeTafsirId, chapters, pageSignature, tafsirIds.length, translationIdsKey]
  );

  const pagerItems = React.useMemo<PagerItem[]>(
    () => [
      { slot: 'prev', target: currentNavigation.prev },
      { slot: 'current', target: currentTarget },
      { slot: 'next', target: currentNavigation.next },
    ],
    [currentNavigation.next, currentNavigation.prev, currentTarget]
  );

  React.useEffect(() => {
    const targets: VerseTarget[] = pagerItems
      .map((item) => item.target)
      .filter((target): target is VerseTarget => target !== null);
    targets.forEach((target) => {
      void loadPage(target);
    });
  }, [loadPage, pagerItems]);

  const pagerRef = React.useRef<FlatList<PagerItem> | null>(null);
  const isPagerResettingRef = React.useRef(false);

  const resetPagerToCenter = React.useCallback(
    (animated: boolean) => {
      if (!pagerRef.current) return;
      isPagerResettingRef.current = true;
      pagerRef.current.scrollToIndex({ index: 1, animated });
      requestAnimationFrame(() => {
        isPagerResettingRef.current = false;
      });
    },
    []
  );

  React.useLayoutEffect(() => {
    resetPagerToCenter(false);
  }, [currentTarget?.ayahId, currentTarget?.surahId, pageWidth, resetPagerToCenter]);

  const navigateToTarget = React.useCallback(
    (target: VerseTarget) => {
      const nextTarget: VerseTarget = { surahId: target.surahId, ayahId: target.ayahId };
      if (currentTarget && areSameTarget(currentTarget, nextTarget)) return;
      setCurrentTarget(nextTarget);
      setVerseRenderSignal((value) => value + 1);
      router.replace({
        pathname: '/tafsir/[surahId]/[ayahId]',
        params: { surahId: String(nextTarget.surahId), ayahId: String(nextTarget.ayahId) },
      });
    },
    [currentTarget, router]
  );

  const handlePagerScrollEnd = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (isPagerResettingRef.current) return;
      const index = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
      if (index === 1) return;

      if (index === 0 && currentNavigation.prev) {
        navigateToTarget(currentNavigation.prev);
        return;
      }

      if (index === 2 && currentNavigation.next) {
        navigateToTarget(currentNavigation.next);
        return;
      }

      resetPagerToCenter(true);
    },
    [currentNavigation.next, currentNavigation.prev, navigateToTarget, pageWidth, resetPagerToCenter]
  );

  const getPagerItemLayout = React.useCallback(
    (_: ArrayLike<PagerItem> | null | undefined, index: number) => ({
      length: pageWidth,
      offset: pageWidth * index,
      index,
    }),
    [pageWidth]
  );

  const handleScrollToIndexFailed = React.useCallback(
    ({ index }: { index: number }) => {
      pagerRef.current?.scrollToOffset({ offset: pageWidth * index, animated: false });
    },
    [pageWidth]
  );

  const handleActiveTafsirChange = React.useCallback(() => {
    setVerseRenderSignal((value) => value + 1);
  }, []);

  const renderPagerItem = React.useCallback(
    ({ item }: { item: PagerItem }) => {
      if (!item.target) {
        return <View style={{ width: pageWidth }} />;
      }

      const verseKey = getVerseKey(item.target);
      const pageState = pageStateByKey[verseKey] ?? EMPTY_PAGE_STATE;
      const pageTitle =
        pageState.chapter?.name_simple ??
        (item.target?.surahId ? `Surah ${item.target.surahId}` : 'Surah');
      const translationItems = buildTranslationItems({
        verse: pageState.verse,
        translationIds,
        showTranslationAttribution,
        translationsById,
      });
      const translationTexts = translationItems.map((translation) => translation.text);

      return (
        <View style={{ width: pageWidth }}>
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={false}
            nestedScrollEnabled
          >
            {pageState.errorMessage ? (
              <Text className="text-sm text-error dark:text-error-dark">{pageState.errorMessage}</Text>
            ) : null}

            {pageState.verse ? (
              <View className={pageState.errorMessage ? 'mt-4' : ''} collapsable={false}>
                <VerseCard
                  verseKey={pageState.verse.verse_key}
                  arabicText={pageState.verse.text_uthmani ?? ''}
                  translationTexts={translationTexts}
                  translationItems={translationItems}
                  showTranslationAttribution={showTranslationAttribution}
                  arabicFontSize={settings.arabicFontSize}
                  arabicFontFace={settings.arabicFontFace}
                  translationFontSize={settings.translationFontSize}
                  showByWords={settings.showByWords}
                  renderSignal={verseRenderSignal}
                  onOpenActions={() =>
                    openVerseActions({
                      title: pageTitle,
                      surahId: item.target?.surahId ?? 0,
                      verseKey: pageState.verse?.verse_key ?? verseKey,
                      arabicText: pageState.verse?.text_uthmani ?? '',
                      translationTexts,
                    })
                  }
                />
              </View>
            ) : pageState.isLoading ? (
              <View className="mt-4 flex-row items-center gap-3">
                <ActivityIndicator color={palette.text} />
                <Text className="text-sm text-muted dark:text-muted-dark">Loading…</Text>
              </View>
            ) : (
              <Text className="mt-4 text-sm text-muted dark:text-muted-dark">Verse not found.</Text>
            )}

            {tafsirIds.length > 1 ? (
              <TafsirTabs
                verseKey={verseKey}
                tafsirIds={tafsirIds}
                onAddTafsir={() => setIsSettingsOpen(true)}
                onActiveTafsirChange={handleActiveTafsirChange}
              />
            ) : tafsirIds.length === 1 ? (
              <View className="mt-4">
                <View className="mb-4 items-center gap-3">
                  <Text className="text-center text-lg font-bold text-foreground dark:text-foreground-dark">
                    {activeTafsirName}
                  </Text>
                  <Pressable
                    onPress={() => setIsSettingsOpen(true)}
                    className="rounded-lg border border-border bg-surface px-3 py-2 dark:bg-surface-dark"
                    style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                    accessibilityRole="button"
                    accessibilityLabel="Add tafsir"
                  >
                    <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">
                      Add tafsir
                    </Text>
                  </Pressable>
                </View>

                {pageState.tafsirError ? (
                  <Text className="text-sm text-error dark:text-error-dark">{pageState.tafsirError}</Text>
                ) : pageState.isTafsirLoading ? (
                  <View className="flex-row items-center gap-3">
                    <ActivityIndicator color={palette.text} />
                    <Text className="text-sm text-muted dark:text-muted-dark">Loading tafsir…</Text>
                  </View>
                ) : (
                  <TafsirHtml
                    html={pageState.tafsirHtml}
                    fontSize={settings.tafsirFontSize || 18}
                    contentKey={`${verseKey}-${activeTafsirId ?? 'none'}`}
                  />
                )}
              </View>
            ) : (
              <View className="mt-4">
                <Text className="text-sm text-muted dark:text-muted-dark">
                  Please select a tafsir from the settings panel to view commentary.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      );
    },
    [
      activeTafsirId,
      activeTafsirName,
      handleActiveTafsirChange,
      navigateToTarget,
      pageStateByKey,
      pageWidth,
      palette.text,
      router,
      settings.arabicFontFace,
      settings.arabicFontSize,
      settings.showByWords,
      settings.tafsirFontSize,
      settings.translationFontSize,
      showTranslationAttribution,
      tafsirIds,
      translationIds,
      translationsById,
      verseRenderSignal,
    ]
  );

  if (!currentTarget) {
    return (
      <View className={isDark ? 'flex-1 dark' : 'flex-1'}>
        <View className="flex-1 items-center justify-center bg-background dark:bg-background-dark px-6">
          <Text className="text-center text-sm text-error dark:text-error-dark">
            Invalid verse reference.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className={isDark ? 'flex-1 dark' : 'flex-1'}>
      <View className="flex-1 bg-background dark:bg-background-dark">
        <Stack.Screen
          options={{
            title: headerTitle,
            headerTitleAlign: 'center',
            headerRight: () => (
              <Pressable
                onPress={() => setIsSettingsOpen(true)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Open settings"
              >
                {({ pressed }) => (
                  <Settings
                    color={palette.text}
                    size={22}
                    strokeWidth={2.25}
                    style={{ marginRight: 12, opacity: pressed ? 0.5 : 1 }}
                  />
                )}
              </Pressable>
            ),
          }}
        />

        <FlatList
          ref={pagerRef}
          data={pagerItems}
          horizontal
          pagingEnabled
          bounces={false}
          directionalLockEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.slot}
          renderItem={renderPagerItem}
          getItemLayout={getPagerItemLayout}
          onMomentumScrollEnd={handlePagerScrollEnd}
          onScrollToIndexFailed={handleScrollToIndexFailed}
          initialNumToRender={3}
          maxToRenderPerBatch={3}
          windowSize={3}
          removeClippedSubviews
          scrollEventThrottle={16}
          nestedScrollEnabled
          onLayout={() => resetPagerToCenter(false)}
        />

        <VerseActionsSheet
          isOpen={isVerseActionsOpen}
          onClose={closeVerseActions}
          title={activeVerse?.title ?? 'Surah'}
          verseKey={activeVerse?.verseKey ?? ''}
          isPlaying={Boolean(audio.isPlaying && audio.activeVerseKey === activeVerse?.verseKey)}
          isBookmarked={activeVersePinned}
          showViewTafsir={false}
          onPlayPause={handlePlayPause}
          onBookmark={handleBookmark}
          onAddToPlan={handleAddToPlan}
          onShare={handleShare}
        />

        <BookmarkModal
          isOpen={isBookmarkModalOpen}
          onClose={() => setIsBookmarkModalOpen(false)}
          verseId={activeVerse?.verseKey ?? ''}
          verseKey={activeVerse?.verseKey ?? ''}
          metadata={activeVerseBookmarkMetadata}
        />

        {plannerVerseSummary ? (
          <AddToPlannerModal
            isOpen={isAddToPlannerOpen}
            onClose={() => setIsAddToPlannerOpen(false)}
            verseSummary={plannerVerseSummary}
          />
        ) : null}

        <SettingsSidebar
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          showTafsirSetting
          pageType="tafsir"
        />
      </View>
    </View>
  );
}
