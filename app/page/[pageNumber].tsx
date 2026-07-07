import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ArrowLeft, Settings } from 'lucide-react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import {
  MushafSingleDocumentReader,
  type MushafSingleDocumentVersePress,
} from '@/components/mushaf/MushafSingleDocumentReader';
import type { MushafSelectionPayload } from '@/components/mushaf/mushafWordPayload';
import { ComprehensiveSearchDropdown } from '@/components/search/ComprehensiveSearchDropdown';
import { AppSearchHeader, ReaderOverlayHeader } from '@/components/navigation/AppHeader';
import { useCollapsibleReaderHeader } from '@/components/navigation/useCollapsibleReaderHeader';
import { useHeaderSearch } from '@/components/navigation/useHeaderSearch';
import { HeaderActionButton } from '@/components/search/HeaderSearchBar';
import { SettingsSidebar } from '@/components/reader/settings/SettingsSidebar';
import { BookmarkModal } from '@/components/bookmarks/BookmarkModal';
import { VerseActionsSheet } from '@/components/surah/VerseActionsSheet';
import { VerseCard } from '@/components/surah/VerseCard';
import { BismillahDisplay } from '@/components/surah/BismillahDisplay';
import { VerseScrubber, type VerseScrubberHandle } from '@/components/surah/VerseScrubber';
import { useVerseAudioWordSync } from '@/components/surah/useVerseAudioWordSync';
import { AddToPlannerModal, type VerseSummaryDetails } from '@/components/verse-planner-modal';
import Colors from '@/constants/Colors';
import { DEFAULT_MUSHAF_ID, findMushafOption } from '@/data/mushaf/options';
import { useChapters } from '@/hooks/useChapters';
import { useMushafPageData } from '@/hooks/useMushafPageData';
import { usePageVerses } from '@/hooks/usePageVerses';
import { preloadOfflineTafsirWindow } from '@/lib/tafsir/tafsirCache';
import { useTranslationResources } from '@/hooks/useTranslationResources';
import { primeVerseDetailsCache } from '@/lib/verse/verseDetailsCache';
import { useBookmarks } from '@/providers/BookmarkContext';
import { useAudioPlayer } from '@/providers/AudioPlayerContext';
import { useLayoutMetrics } from '@/providers/LayoutMetricsContext';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';
import { getBundledMushafPack } from '@/src/core/infrastructure/mushaf/bundledPacks';
import { container } from '@/src/core/infrastructure/di/container';

import type { Bookmark, MushafPackId } from '@/types';

function parseVerseKeyNumbers(
  verseKey: string | null
): { surahId: number; verseNumber: number } | null {
  if (!verseKey) return null;
  const [surahRaw, verseRaw] = verseKey.split(':');
  const surahId = Number.parseInt(surahRaw ?? '', 10);
  const verseNumber = Number.parseInt(verseRaw ?? '', 10);
  if (!Number.isFinite(surahId) || !Number.isFinite(verseNumber)) return null;
  const normalizedSurah = Math.trunc(surahId);
  const normalizedVerse = Math.trunc(verseNumber);
  if (normalizedSurah <= 0 || normalizedVerse <= 0) return null;
  return { surahId: normalizedSurah, verseNumber: normalizedVerse };
}

async function resolveActiveMushafVersion(
  packId: MushafPackId,
  fallbackVersion: string
): Promise<string> {
  try {
    const activeInstall = await container
      .getMushafPackInstallRegistry()
      .getActive(packId);
    return activeInstall?.version ?? fallbackVersion;
  } catch {
    return fallbackVersion;
  }
}

function VerseCardPlaceholder({ verseKey }: { verseKey: string }): React.JSX.Element {
  return (
    <View className="border-b border-border/40 py-4 dark:border-border-dark/30">
      <View className="gap-4">
        <Text className="text-sm font-semibold text-accent dark:text-accent-dark">{verseKey}</Text>
        <View className="h-12 rounded-2xl bg-surface dark:bg-surface-dark" />
        <View className="gap-3">
          <View className="h-4 rounded-full bg-surface dark:bg-surface-dark" />
          <View className="h-4 w-5/6 rounded-full bg-surface dark:bg-surface-dark" />
          <View className="h-4 w-2/3 rounded-full bg-surface dark:bg-surface-dark" />
        </View>
      </View>
    </View>
  );
}

const cardShadow =
  Platform.OS === 'android'
    ? { shadowColor: 'transparent', elevation: 0 }
    : {
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
      };

function PageHeaderCard({ pageNumber, surahRange }: { pageNumber: number; surahRange: string }): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const isDark = resolvedTheme === 'dark';
  const bgColor = isDark ? '#182333' : '#FFFFFF';

  return (
    <View
      className="mb-4 flex-row items-center justify-between px-4 py-3"
      style={[
        cardShadow,
        {
          borderRadius: 12,
          borderWidth: 0,
          backgroundColor: bgColor,
        },
      ]}
    >
      <Text className="text-base font-bold text-content-primary dark:text-content-primary-dark">
        Page {pageNumber}
      </Text>
      {surahRange ? (
        <View className="rounded-full bg-accent/10 px-3 py-1">
          <Text className="text-xs font-semibold text-accent dark:text-accent-dark">
            {surahRange}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  contentStage: {
    flex: 1,
    overflow: 'hidden',
  },
  contentLayer: {
    ...StyleSheet.absoluteFill,
  },
});

const INITIAL_PLACEHOLDER_VERSE_KEYS = ['1:1', '1:2', '1:3', '1:4'];
const FALLBACK_MUSHAF_TOTAL_PAGES = 604;

function clampPageNumber(value: number | null): number {
  if (value === null || !Number.isInteger(value)) return 1;
  return Math.min(Math.max(value, 1), 604);
}

export default function PageScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{
    pageNumber?: string | string[];
    startVerse?: string | string[];
  }>();
  const router = useRouter();
  const pageNumberParam = Array.isArray(params.pageNumber) ? params.pageNumber[0] : params.pageNumber;
  const startVerseParam = Array.isArray(params.startVerse) ? params.startVerse[0] : params.startVerse;

  const pageNumber = clampPageNumber(pageNumberParam ? Number(pageNumberParam) : 1);
  const startVerse = startVerseParam ? Number(startVerseParam) : NaN;

  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [isVerseActionsOpen, setIsVerseActionsOpen] = React.useState(false);
  const [isBookmarkModalOpen, setIsBookmarkModalOpen] = React.useState(false);
  const [isAddToPlannerOpen, setIsAddToPlannerOpen] = React.useState(false);
  const [plannerVerseSummary, setPlannerVerseSummary] = React.useState<VerseSummaryDetails | null>(
    null
  );
  const [activeVerse, setActiveVerse] = React.useState<{
    verseKey: string;
    verseApiId?: number;
    arabicText: string;
    translationTexts: string[];
  } | null>(null);

  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const readerHeader = useCollapsibleReaderHeader();
  const { settings, isHydrated } = useSettings();
  const isMushafView = settings.readingMode === 'mushaf';
  const headerSearch = useHeaderSearch({ preserveMushafView: isMushafView, replace: true });
  const { chapters } = useChapters();
  const audio = useAudioPlayer();
  const { audioPlayerBarHeight } = useLayoutMetrics();

  const listContentContainerStyle = React.useMemo(
    () => ({
      paddingHorizontal: 16,
      paddingTop: readerHeader.headerHeight + 16,
      paddingBottom: 24 + audioPlayerBarHeight,
    }),
    [audioPlayerBarHeight, readerHeader.headerHeight]
  );

  const { isPinned, setLastRead } = useBookmarks();
  const selectedMushafId = settings.mushafId ?? DEFAULT_MUSHAF_ID;
  const selectedMushafOption = findMushafOption(selectedMushafId);
  const selectedMushafVersion = selectedMushafOption?.version ?? 'unknown';
  const initialMushafPageProbe = useMushafPageData({
    packId: selectedMushafId,
    pageNumber,
    expectedVersion: selectedMushafVersion,
    enabled: Boolean(isMushafView && isHydrated && selectedMushafOption?.renderer === 'webview'),
  });
  const retainedMushafPageDataRef = React.useRef(initialMushafPageProbe.data);
  if (
    initialMushafPageProbe.data?.pack.packId === selectedMushafId &&
    initialMushafPageProbe.data.pack.version.trim() === selectedMushafVersion.trim() &&
    initialMushafPageProbe.data.pageNumber === pageNumber
  ) {
    retainedMushafPageDataRef.current = initialMushafPageProbe.data;
  }
  const availableInitialMushafPageData =
    initialMushafPageProbe.data ??
    (retainedMushafPageDataRef.current?.pack.packId === selectedMushafId &&
    retainedMushafPageDataRef.current.pack.version.trim() === selectedMushafVersion.trim() &&
    retainedMushafPageDataRef.current.pageNumber === pageNumber
      ? retainedMushafPageDataRef.current
      : null);
  const resolvedMushafRenderer =
    availableInitialMushafPageData?.pack.renderer ?? selectedMushafOption?.renderer ?? 'text';
  const activeMushafVersion =
    availableInitialMushafPageData?.pack.version ?? selectedMushafVersion;
  const mushafTotalPages =
    availableInitialMushafPageData?.pack.totalPages ?? FALLBACK_MUSHAF_TOTAL_PAGES;
  const mushafSelectionMetadataRef = React.useRef<MushafSelectionPayload | null>(null);

  const chapterNamesById = React.useMemo(
    () => new Map(chapters.map((item) => [item.id, item.name_simple] as const)),
    [chapters]
  );

  const surahRange = React.useMemo(() => {
    if (chapters.length === 0) return '';
    const pack = getBundledMushafPack('unicode-uthmani-v1');
    const lookup = pack?.payload.lookup[String(pageNumber)];
    if (!lookup) return '';

    const startParsed = parseVerseKeyNumbers(lookup.firstVerseKey || lookup.from);
    const endParsed = parseVerseKeyNumbers(lookup.lastVerseKey || lookup.to);
    if (!startParsed || !endParsed) return '';

    const startName = chapterNamesById.get(startParsed.surahId) || '';
    const endName = chapterNamesById.get(endParsed.surahId) || '';

    if (startParsed.surahId === endParsed.surahId) {
      return startName;
    }

    return `${startName} - ${endName}`;
  }, [pageNumber, chapters, chapterNamesById]);

  const activeChapterNumber = React.useMemo(() => {
    if (audio.activeVerseKey) {
      const parsed = parseVerseKeyNumbers(audio.activeVerseKey);
      return parsed?.surahId ?? 1;
    }
    const pack = getBundledMushafPack('unicode-uthmani-v1');
    const lookup = pack?.payload.lookup[String(pageNumber)];
    if (lookup) {
      const parsed = parseVerseKeyNumbers(lookup.firstVerseKey || lookup.from);
      return parsed?.surahId ?? 1;
    }
    return 1;
  }, [audio.activeVerseKey, pageNumber]);

  const verseAudioWordSync = useVerseAudioWordSync(activeChapterNumber);

  const translationIds = React.useMemo(() => {
    const ids = Array.isArray(settings.translationIds)
      ? settings.translationIds
      : [settings.translationId ?? 20];
    return ids.filter((id) => Number.isFinite(id) && id > 0);
  }, [settings.translationId, settings.translationIds]);

  const showTranslationAttribution = translationIds.length > 1;

  React.useEffect(() => {
    readerHeader.resetHeader();
  }, [pageNumber, readerHeader.resetHeader]);

  const { translationsById } = useTranslationResources({
    enabled: showTranslationAttribution,
    language: settings.contentLanguage,
  });

  const {
    verseKeys,
    hasLoadedContent,
    getVerseByKey,
    isLoading,
    errorMessage,
    offlineNotInstalled,
    refresh,
    retry,
  } = usePageVerses({
    pageNumber,
    translationIds,
    wordLang: settings.wordLang,
    enabled: !isMushafView,
  });

  const [visibleVerseNumber, setVisibleVerseNumber] = React.useState(1);
  const visibleVerseNumberRef = React.useRef(visibleVerseNumber);
  const isVerseScrubbingRef = React.useRef(false);
  const lastScrubScrollVerseRef = React.useRef<number | null>(null);
  const queuedScrubScrollVerseRef = React.useRef<number | null>(null);
  const scrubScrollInFlightRef = React.useRef(false);
  const scrubScrollRequestIdRef = React.useRef(0);

  const flashListRef = React.useRef<FlashListRef<string> | null>(null);
  const flatListRef = React.useRef<FlatList<string> | null>(null);
  const verseScrubberRef = React.useRef<VerseScrubberHandle | null>(null);

  const viewabilityConfig = React.useRef({
    itemVisiblePercentThreshold: 30,
    minimumViewTime: 50,
  }).current;

  const visibleVerseKeyRef = React.useRef<string | null>(null);
  const onViewableItemsChanged = React.useRef(
    (info: { viewableItems: Array<{ item: string; index: number | null }> }) => {
      const first = info.viewableItems[0];
      if (first && first.index !== null) {
        visibleVerseKeyRef.current = first.item;
        const verseIdx = first.index + 1;
        if (!isVerseScrubbingRef.current && !scrubScrollInFlightRef.current) {
          setVisibleVerseNumber(verseIdx);
          visibleVerseNumberRef.current = verseIdx;
        }

        const parsed = parseVerseKeyNumbers(first.item);
        if (parsed) {
          const verseObj = getVerseByKey(first.item);
          setLastRead(
            String(parsed.surahId),
            parsed.verseNumber,
            first.item,
            verseObj?.id
          );
        }
      }
    }
  ).current;

  const openVerseActions = React.useCallback(
    (params: {
      verseKey: string;
      verseApiId?: number;
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

  const openTranslationSettings = React.useCallback(() => {
    setIsSettingsOpen(true);
  }, []);

  const closeSettingsSidebar = React.useCallback(() => {
    setIsSettingsOpen(false);
  }, []);

  React.useEffect(() => {
    if (!isMushafView || selectedMushafOption?.renderer !== 'webview') return;

    let cancelled = false;
    void (async () => {
      const activePackVersion = await resolveActiveMushafVersion(
        selectedMushafId,
        activeMushafVersion
      );
      if (cancelled) return;
      const repository = container.getMushafPageRepository();
      repository.setActivePageCacheIdentity({
        packId: selectedMushafId,
        version: activePackVersion,
      });
      void repository
        .prefetchPages({
          packId: selectedMushafId,
          pageNumbers: [pageNumber - 1, pageNumber, pageNumber + 1],
          expectedVersion: activePackVersion,
        })
        .catch(() => {
          // The mounted reader surfaces local-pack errors.
        });
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeMushafVersion,
    isMushafView,
    pageNumber,
    selectedMushafId,
    selectedMushafOption?.renderer,
  ]);

  const handleMushafSelectionChange = React.useCallback((payload: MushafSelectionPayload) => {
    mushafSelectionMetadataRef.current = payload.isCollapsed ? null : payload;
  }, []);

  const handleMushafVersePress = React.useCallback(
    (verse: MushafSingleDocumentVersePress) => {
      if (mushafSelectionMetadataRef.current && !mushafSelectionMetadataRef.current.isCollapsed) {
        return;
      }

      openVerseActions({
        verseKey: verse.verseKey,
        verseApiId: verse.verseApiId,
        arabicText: verse.arabicText,
        translationTexts: verse.translationTexts,
      });
    },
    [openVerseActions]
  );

  const handleMushafScrollActivity = React.useCallback(
    (scrollY?: number) => {
      if (typeof scrollY === 'number') {
        readerHeader.handleScrollOffset(scrollY);
      }
    },
    [readerHeader]
  );

  const listExtraData = React.useMemo(
    () => ({
      arabicFontSize: settings.arabicFontSize,
      translationFontSize: settings.translationFontSize,
      arabicFontFace: settings.arabicFontFace,
      showByWords: settings.showByWords,
      audioActiveVerseKey: audio.activeVerseKey,
      audioIsVisible: audio.isVisible,
      verseAudioWordSync,
    }),
    [
      settings.arabicFontFace,
      settings.arabicFontSize,
      settings.showByWords,
      settings.translationFontSize,
      audio.activeVerseKey,
      audio.isVisible,
      verseAudioWordSync,
    ]
  );

  const handlePlayPause = React.useCallback(() => {
    const verseKey = activeVerse?.verseKey;
    if (!verseKey) return;

    if (audio.activeVerseKey === verseKey) {
      audio.togglePlay();
      return;
    }

    audio.playVerse(verseKey);
  }, [activeVerse?.verseKey, audio.activeVerseKey, audio.playVerse, audio.togglePlay]);

  const handleBookmark = React.useCallback(() => {
    if (!activeVerse) return;
    setIsBookmarkModalOpen(true);
  }, [activeVerse]);

  const handleOpenTafsir = React.useCallback(() => {
    const verseKey = activeVerse?.verseKey;
    if (!verseKey) return;
    const [surah, ayah] = verseKey.split(':');
    if (!surah || !ayah) return;
    const surahNumber = Number(surah);
    primeVerseDetailsCache({
      verseKey,
      arabicText: activeVerse?.arabicText,
      translationIds,
      translationTexts: activeVerse?.translationTexts,
    });
    if (Number.isFinite(surahNumber) && surahNumber > 0) {
      const tafsirIds = Array.isArray(settings.tafsirIds) ? settings.tafsirIds : [];
      const chapterVerseCount =
        chapters.find((chapter) => chapter.id === surahNumber)?.verses_count;
      void preloadOfflineTafsirWindow({
        surahId: surahNumber,
        ayahId: Number(ayah),
        tafsirIds,
        verseCount: chapterVerseCount,
      });
    }
    router.push({ pathname: '/tafsir/[surahId]/[ayahId]', params: { surahId: surah, ayahId: ayah } });
  }, [
    activeVerse?.arabicText,
    activeVerse?.translationTexts,
    activeVerse?.verseKey,
    chapters,
    router,
    settings.tafsirIds,
    translationIds,
  ]);

  const handleAddToPlan = React.useCallback(() => {
    const verseKey = activeVerse?.verseKey;
    if (!verseKey) return;
    const parsed = parseVerseKeyNumbers(verseKey);
    setPlannerVerseSummary({
      verseKey,
      ...(parsed ? { surahId: parsed.surahId } : {}),
      arabicText: activeVerse?.arabicText,
      translationText: activeVerse?.translationTexts?.[0],
    });
    setIsAddToPlannerOpen(true);
  }, [activeVerse?.arabicText, activeVerse?.translationTexts, activeVerse?.verseKey]);

  const handleShare = React.useCallback(async () => {
    if (!activeVerse) return;
    const parsed = parseVerseKeyNumbers(activeVerse.verseKey);
    const surahName = parsed ? (chapterNamesById.get(parsed.surahId) ?? '') : '';
    const title = surahName ? `${surahName} ${activeVerse.verseKey}` : activeVerse.verseKey;
    const lines = [
      title,
      '',
      activeVerse.arabicText,
      '',
      ...(activeVerse.translationTexts?.length ? [activeVerse.translationTexts[0]!] : []),
    ];
    try {
      await Share.share({ message: lines.join('\n') });
    } catch {
      // Ignore
    }
  }, [activeVerse, chapterNamesById]);

  const handleScrubToVerse = React.useCallback(
    (targetVerseNumber: number, options?: { isFinal?: boolean }) => {
      const isFinal = Boolean(options?.isFinal);
      const targetIndex = Math.min(Math.max(targetVerseNumber - 1, 0), verseKeys.length - 1);

      visibleVerseNumberRef.current = targetVerseNumber;
      if (isFinal) {
        setVisibleVerseNumber((currentVerseNumber) =>
          currentVerseNumber === targetVerseNumber ? currentVerseNumber : targetVerseNumber
        );
      }

      const list = Platform.OS === 'web' ? flatListRef.current : flashListRef.current;
      if (!list) return;

      if (!isFinal && scrubScrollInFlightRef.current) {
        queuedScrubScrollVerseRef.current = targetVerseNumber;
        return;
      }

      queuedScrubScrollVerseRef.current = null;
      lastScrubScrollVerseRef.current = targetVerseNumber;

      try {
        const scrollResult = list.scrollToIndex({
          index: targetIndex,
          animated: false,
          viewPosition: 0,
        });
        if (scrollResult && typeof (scrollResult as Promise<void>).catch === 'function') {
          scrubScrollInFlightRef.current = true;
          const requestId = ++scrubScrollRequestIdRef.current;
          void (scrollResult as Promise<void>)
            .catch(() => {})
            .finally(() => {
              if (requestId !== scrubScrollRequestIdRef.current) return;
              scrubScrollInFlightRef.current = false;
              const queuedVerseNumber = queuedScrubScrollVerseRef.current;
              queuedScrubScrollVerseRef.current = null;
              if (queuedVerseNumber !== null) {
                handleScrubToVerse(queuedVerseNumber);
              }
            });
        }
      } catch {
        // Ignore
      }
    },
    [verseKeys]
  );

  const handleScrubStateChange = React.useCallback((isScrubbing: boolean) => {
    isVerseScrubbingRef.current = isScrubbing;
    if (!isScrubbing) {
      lastScrubScrollVerseRef.current = null;
      queuedScrubScrollVerseRef.current = null;
      scrubScrollInFlightRef.current = false;
      scrubScrollRequestIdRef.current += 1;
    }
  }, []);

  const handleSurahListScroll = React.useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    readerHeader.handleScroll(event);
    verseScrubberRef.current?.show();
  }, [readerHeader]);

  const activeVersePinned = React.useMemo(() => {
    if (!activeVerse) return false;
    const apiId = typeof activeVerse.verseApiId === 'number' ? String(activeVerse.verseApiId) : null;
    return Boolean((apiId && isPinned(apiId)) || isPinned(activeVerse.verseKey));
  }, [activeVerse, isPinned]);

  const activeVerseBookmarkMetadata = React.useMemo(() => {
    if (!activeVerse) return undefined;
    const verseApiId =
      typeof activeVerse.verseApiId === 'number' &&
      Number.isFinite(activeVerse.verseApiId) &&
      activeVerse.verseApiId > 0
        ? activeVerse.verseApiId
        : undefined;

    const parsed = parseVerseKeyNumbers(activeVerse.verseKey);
    const surahName = parsed ? (chapterNamesById.get(parsed.surahId) ?? '') : '';

    const metadata: Partial<Bookmark> = {
      verseKey: activeVerse.verseKey,
      ...(typeof verseApiId === 'number' ? { verseApiId } : {}),
      ...(activeVerse.arabicText ? { verseText: activeVerse.arabicText } : {}),
      ...(surahName ? { surahName } : {}),
      ...(activeVerse.translationTexts?.[0] ? { translation: activeVerse.translationTexts[0] } : {}),
    };
    return metadata;
  }, [activeVerse, chapterNamesById]);

  const renderVerseItem = React.useCallback(
    ({ item }: { item: string }) => {
      const verse = getVerseByKey(item);
      if (!verse) {
        return <VerseCardPlaceholder verseKey={item} />;
      }

      const parsed = parseVerseKeyNumbers(item);
      const showTranslation = verse.translationItems.length > 0;
      const showBismillah = parsed?.verseNumber === 1 && parsed.surahId !== 9 && parsed.surahId !== 1;
      const surahName = parsed ? chapterNamesById.get(parsed.surahId) : undefined;

      const translationTexts = verse.translationTexts ?? [];
      const translationItems = showTranslationAttribution
        ? (verse.translationItems ?? []).map((t) => {
            if (t.resourceName) return t;
            const fallbackName =
              typeof t.resourceId === 'number'
                ? translationsById.get(t.resourceId)?.name ?? `Translation ${t.resourceId}`
                : undefined;
            return { ...t, resourceName: fallbackName };
          })
        : verse.translationItems ?? [];

      return (
        <View>
          {parsed?.verseNumber === 1 ? (
            <View className="mb-4 mt-6 items-center">
              <View className="rounded-full bg-surface-navigation px-4 py-1.5 dark:bg-surface-navigation-dark">
                <Text className="text-xs font-bold text-accent dark:text-accent-dark">
                  {surahName ?? `Surah ${parsed.surahId}`}
                </Text>
              </View>
              {showBismillah ? (
                <BismillahDisplay />
              ) : null}
            </View>
          ) : null}
          <VerseCard
            verseKey={verse.verse_key}
            arabicText={verse.text_uthmani ?? ''}
            words={verse.words}
            translationTexts={translationTexts}
            translationItems={translationItems}
            showTranslationAttribution={showTranslationAttribution}
            isAudioActive={Boolean(audio.isVisible && audio.activeVerseKey === verse.verse_key)}
            audioWordSync={verseAudioWordSync}
            arabicFontSize={settings.arabicFontSize}
            arabicFontFace={settings.arabicFontFace}
            translationFontSize={settings.translationFontSize}
            showByWords={settings.showByWords}
            onOpenActions={() =>
              openVerseActions({
                verseKey: verse.verse_key,
                verseApiId: verse.id,
                arabicText: verse.text_uthmani ?? '',
                translationTexts,
              })
            }
          />
        </View>
      );
    },
    [
      getVerseByKey,
      chapterNamesById,
      settings,
      showTranslationAttribution,
      translationsById,
      audio,
      verseAudioWordSync,
      openVerseActions,
    ]
  );

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />

      <ReaderOverlayHeader
        onLayout={readerHeader.handleHeaderLayout}
        pointerEvents={readerHeader.headerPointerEvents}
        style={readerHeader.headerAnimatedStyle}
      >
        <AppSearchHeader
          editable={readerHeader.headerPointerEvents !== 'none'}
          left={
            <HeaderActionButton accessibilityLabel="Go back" onPress={() => router.back()}>
              <ArrowLeft color={palette.text} size={22} strokeWidth={2.25} />
            </HeaderActionButton>
          }
          inputRef={headerSearch.inputRef}
          value={headerSearch.query}
          onChangeText={headerSearch.updateQuery}
          placeholder="Search…"
          onFocus={() => {
            readerHeader.showHeader();
            headerSearch.setIsOpen(true);
          }}
          onSubmitEditing={() => headerSearch.navigateToSearch()}
          right={
            <HeaderActionButton accessibilityLabel="Open settings" onPress={openTranslationSettings}>
              <Settings color={palette.text} size={22} strokeWidth={2.25} />
            </HeaderActionButton>
          }
        />
      </ReaderOverlayHeader>

      <View style={styles.contentStage}>
        {isMushafView ? (
          <View style={styles.contentLayer} pointerEvents="auto">
            {!isHydrated ? (
              <View className="flex-1 items-center justify-center gap-4 px-6">
                <ActivityIndicator color={palette.text} />
                <Text className="text-center text-sm leading-6 text-muted dark:text-muted-dark">
                  Loading local mushaf settings…
                </Text>
              </View>
            ) : resolvedMushafRenderer !== 'webview' ? (
              <View className="flex-1 items-center justify-center px-6">
                <Text className="text-center text-sm leading-6 text-muted dark:text-muted-dark">
                  Select an installed exact mushaf pack to use this Page Mushaf view.
                </Text>
              </View>
            ) : initialMushafPageProbe.errorMessage ? (
              <View className="flex-1 items-center justify-center px-6">
                <Text className="text-center text-sm leading-6 text-muted dark:text-muted-dark">
                  {initialMushafPageProbe.errorMessage}
                </Text>
              </View>
            ) : (
              <MushafSingleDocumentReader
                backgroundPageNumbers={[pageNumber - 1, pageNumber, pageNumber + 1]}
                chapterNamesById={chapterNamesById}
                compactPageLines
                expectedVersion={activeMushafVersion}
                focusTopInsetPx={readerHeader.headerHeight + 12}
                initialPageData={availableInitialMushafPageData}
                initialPageNumber={pageNumber}
                mushafScaleStep={settings.mushafScaleStep}
                onSelectionChange={handleMushafSelectionChange}
                onScrollActivity={handleMushafScrollActivity}
                onVersePress={handleMushafVersePress}
                pageNumbers={[pageNumber]}
                packId={selectedMushafId}
                totalPages={mushafTotalPages}
              />
            )}
          </View>
        ) : (
        <View style={styles.contentLayer} pointerEvents="auto">
          {!hasLoadedContent && offlineNotInstalled ? (
            <View className="flex-1 px-4" style={{ paddingTop: readerHeader.headerHeight + 16 }}>
              <View className="mt-2 gap-3">
                <Text className="text-sm text-muted dark:text-muted-dark">
                  You’re offline and this translation isn’t downloaded yet.
                </Text>
                <Pressable
                  onPress={openTranslationSettings}
                  accessibilityRole="button"
                  accessibilityLabel="Open translation settings"
                  className="self-start rounded-lg bg-accent px-4 py-2"
                  style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                >
                  <Text className="text-sm font-semibold text-on-accent">
                    Open translation settings
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : !hasLoadedContent && errorMessage ? (
            <View className="flex-1 px-4" style={{ paddingTop: readerHeader.headerHeight + 16 }}>
              <View className="mt-2 gap-3">
                <Text className="text-sm text-error dark:text-error-dark">{errorMessage}</Text>
                <Pressable
                  onPress={retry}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading verses"
                  className="self-start rounded-lg bg-number-badge px-4 py-2 dark:bg-number-badge-dark"
                  style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                >
                  <Text className="text-sm font-semibold text-accent dark:text-accent-dark">
                    Retry
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : !hasLoadedContent && verseKeys.length > 0 ? (
            <FlatList
              data={INITIAL_PLACEHOLDER_VERSE_KEYS}
              keyExtractor={(item) => `placeholder:${pageNumber}:${item}`}
              renderItem={({ item }) => (
                <VerseCardPlaceholder verseKey={item} />
              )}
              contentContainerStyle={listContentContainerStyle}
              ListHeaderComponent={<PageHeaderCard pageNumber={pageNumber} surahRange={surahRange} />}
              scrollEnabled={false}
            />
          ) : verseKeys.length <= 0 ? (
            <View className="flex-1 px-4" style={{ paddingTop: readerHeader.headerHeight + 16 }}>
              <Text className="mt-2 text-sm text-muted dark:text-muted-dark">
                No verses found for this Page.
              </Text>
            </View>
          ) : Platform.OS === 'web' ? (
            <FlatList
              ref={(node) => {
                flatListRef.current = node;
              }}
              data={verseKeys}
              keyExtractor={(item) => item}
              extraData={listExtraData}
              renderItem={renderVerseItem}
              contentContainerStyle={listContentContainerStyle}
              refreshing={isLoading}
              onRefresh={refresh}
              onScroll={handleSurahListScroll}
              scrollEventThrottle={16}
              viewabilityConfig={viewabilityConfig}
              onViewableItemsChanged={onViewableItemsChanged}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={<PageHeaderCard pageNumber={pageNumber} surahRange={surahRange} />}
            />
          ) : (
            <FlashList
              ref={(node) => {
                flashListRef.current = node;
              }}
              data={verseKeys}
              keyExtractor={(item) => item}
              extraData={listExtraData}
              renderItem={renderVerseItem}
              drawDistance={Platform.OS === 'android' ? 1200 : 800}
              contentContainerStyle={listContentContainerStyle}
              refreshing={isLoading}
              onRefresh={refresh}
              onScroll={handleSurahListScroll}
              scrollEventThrottle={16}
              viewabilityConfig={viewabilityConfig}
              onViewableItemsChanged={onViewableItemsChanged}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={<PageHeaderCard pageNumber={pageNumber} surahRange={surahRange} />}
            />
          )}
          {hasLoadedContent && verseKeys.length > 1 ? (
            <VerseScrubber
              ref={verseScrubberRef}
              bottomInset={audioPlayerBarHeight}
              currentVerseNumber={visibleVerseNumber}
              onScrubStateChange={handleScrubStateChange}
              onScrubToVerse={handleScrubToVerse}
              topInset={0}
              verseCount={verseKeys.length}
            />
          ) : null}
        </View>
        )}
      </View>

      <SettingsSidebar
        isOpen={isSettingsOpen}
        onClose={closeSettingsSidebar}
      />

      <VerseActionsSheet
        isOpen={isVerseActionsOpen}
        onClose={closeVerseActions}
        title={activeVerse ? (chapterNamesById.get(parseVerseKeyNumbers(activeVerse.verseKey)?.surahId ?? 1) ?? '') : ''}
        verseKey={activeVerse?.verseKey ?? ''}
        isBookmarked={activeVersePinned}
        isPlaying={audio.activeVerseKey === activeVerse?.verseKey && audio.isPlaying}
        onPlayPause={handlePlayPause}
        onBookmark={handleBookmark}
        onOpenTafsir={handleOpenTafsir}
        onAddToPlan={handleAddToPlan}
        onShare={handleShare}
      />

      {activeVerseBookmarkMetadata ? (
        <BookmarkModal
          isOpen={isBookmarkModalOpen}
          onClose={() => setIsBookmarkModalOpen(false)}
          verseId={activeVerse?.verseApiId ? String(activeVerse.verseApiId) : activeVerse?.verseKey ?? ''}
          metadata={activeVerseBookmarkMetadata}
        />
      ) : null}

      {plannerVerseSummary ? (
        <AddToPlannerModal
          isOpen={isAddToPlannerOpen}
          onClose={() => {
            setIsAddToPlannerOpen(false);
            setPlannerVerseSummary(null);
          }}
          verseSummary={plannerVerseSummary}
        />
      ) : null}

      <ComprehensiveSearchDropdown
        isOpen={headerSearch.isOpen}
        query={headerSearch.query}
        onQueryChange={headerSearch.updateQuery}
        onClose={() => headerSearch.close({ clearQuery: false })}
        onNavigateToSurahVerse={headerSearch.navigateToSurahVerse}
        onNavigateToJuz={headerSearch.navigateToJuz}
        onNavigateToPage={headerSearch.navigateToPage}
        onNavigateToSearch={headerSearch.navigateToSearch}
        topInset={readerHeader.headerHeight}
      />
    </View>
  );
}
