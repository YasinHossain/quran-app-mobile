import { FlashList } from '@shopify/flash-list';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Settings } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Pressable, Share, Text, View, useWindowDimensions } from 'react-native';

import { BookmarkModal } from '@/components/bookmarks/BookmarkModal';
import { MushafNativePage } from '@/components/mushaf/MushafNativePage';
import {
  resolveMushafVerseKey,
  type MushafSelectionPayload,
  type MushafWordPressPayload,
} from '@/components/mushaf/mushafWordPayload';
import { MushafWebViewPage } from '@/components/mushaf/MushafWebViewPage';
import { SettingsSidebar } from '@/components/reader/settings/SettingsSidebar';
import { VerseActionsSheet } from '@/components/surah/VerseActionsSheet';
import { AddToPlannerModal, type VerseSummaryDetails } from '@/components/verse-planner-modal';
import Colors from '@/constants/Colors';
import { DEFAULT_MUSHAF_ID } from '@/data/mushaf/options';
import { useChapters } from '@/hooks/useChapters';
import { useMushafPageData } from '@/hooks/useMushafPageData';
import { useAudioPlayer } from '@/providers/AudioPlayerContext';
import { useBookmarks } from '@/providers/BookmarkContext';
import { useLayoutMetrics } from '@/providers/LayoutMetricsContext';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';

import type { Bookmark, MushafPackId, MushafScaleStep, MushafVerse } from '@/types';
import { mushafScaleStepToFontSize } from '@/types';

const FALLBACK_TOTAL_PAGES = 604;

type ActiveMushafVerse = {
  title: string;
  surahId: number;
  verseKey: string;
  verseApiId?: number;
  arabicText: string;
  translationTexts: string[];
  wordPosition: number;
};

function clampPageNumber(value: number | null): number {
  if (value === null || !Number.isInteger(value)) return 1;
  return Math.min(Math.max(value, 1), FALLBACK_TOTAL_PAGES);
}

function parseVerseKeyNumbers(
  verseKey: string | null
): { surahId: number; verseNumber: number } | null {
  if (!verseKey) return null;
  const [surahRaw, verseRaw] = verseKey.split(':');
  const surahId = Number.parseInt(surahRaw ?? '', 10);
  const verseNumber = Number.parseInt(verseRaw ?? '', 10);
  if (!Number.isFinite(surahId) || !Number.isFinite(verseNumber)) return null;
  const normalizedSurahId = Math.trunc(surahId);
  const normalizedVerseNumber = Math.trunc(verseNumber);
  if (normalizedSurahId <= 0 || normalizedVerseNumber <= 0) return null;
  return { surahId: normalizedSurahId, verseNumber: normalizedVerseNumber };
}

function resolveMushafVerseText(verse: MushafVerse): string {
  const directText = verse.textUthmani ?? verse.textIndopak ?? '';
  if (directText.trim()) {
    return directText.trim();
  }

  return verse.words
    .map((word) => word.textUthmani ?? word.textIndopak ?? word.textQpcHafs ?? '')
    .filter((wordText) => wordText.trim().length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function LoadingState({
  label,
  color,
}: {
  label: string;
  color: string;
}): React.JSX.Element {
  return (
    <View className="flex-1 items-center justify-center gap-4 px-6">
      <ActivityIndicator color={color} />
      <Text className="text-center text-sm text-muted dark:text-muted-dark">{label}</Text>
    </View>
  );
}

function ErrorState({ message }: { message: string }): React.JSX.Element {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <Text className="text-center text-sm leading-6 text-muted dark:text-muted-dark">
        {message}
      </Text>
    </View>
  );
}

function MushafFeedPlaceholder({
  color,
  height,
}: {
  color: string;
  height: number;
}): React.JSX.Element {
  return (
    <View
      className="items-center justify-center"
      style={{ height: Math.max(320, height) }}
    >
      <ActivityIndicator color={color} />
    </View>
  );
}

function MushafFeedPageRow({
  pageNumber,
  packId,
  mushafScaleStep,
  estimatedHeight,
  chapterNamesById,
  loadingColor,
  onSelectionChange,
  onVersePress,
}: {
  pageNumber: number;
  packId: MushafPackId;
  mushafScaleStep: MushafScaleStep;
  estimatedHeight: number;
  chapterNamesById: Map<number, string>;
  loadingColor: string;
  onSelectionChange: (payload: MushafSelectionPayload) => void;
  onVersePress: (verse: ActiveMushafVerse) => void;
}): React.JSX.Element {
  const { data, isLoading, errorMessage } = useMushafPageData({
    packId,
    pageNumber,
  });

  const versesByKey = React.useMemo(
    () => new Map((data?.verses ?? []).map((verse) => [verse.verseKey, verse] as const)),
    [data?.verses]
  );

  const handleWordPress = React.useCallback(
    (payload: MushafWordPressPayload) => {
      const verseKey = resolveMushafVerseKey(payload);
      if (!verseKey) return;

      const verse = versesByKey.get(verseKey);
      if (!verse) return;

      const parsed = parseVerseKeyNumbers(verseKey);
      if (!parsed) return;

      onVersePress({
        title: chapterNamesById.get(parsed.surahId) ?? `Surah ${parsed.surahId}`,
        surahId: parsed.surahId,
        verseKey,
        ...(typeof verse.id === 'number' && Number.isFinite(verse.id) && verse.id > 0
          ? { verseApiId: verse.id }
          : {}),
        arabicText: resolveMushafVerseText(verse),
        translationTexts: [],
        wordPosition:
          typeof payload.wordPosition === 'number' && Number.isFinite(payload.wordPosition)
            ? Math.trunc(payload.wordPosition)
            : 0,
      });
    },
    [chapterNamesById, onVersePress, versesByKey]
  );

  if (errorMessage) {
    return (
      <View className="px-6 py-6">
        <Text className="text-center text-sm text-muted dark:text-muted-dark">{errorMessage}</Text>
      </View>
    );
  }

  if (isLoading || !data) {
    return <MushafFeedPlaceholder color={loadingColor} height={estimatedHeight} />;
  }

  return (
    <View>
      {data.pack.renderer === 'text' ? (
        <MushafNativePage
          data={data}
          mushafScaleStep={mushafScaleStep}
          onWordPress={handleWordPress}
        />
      ) : (
        <MushafWebViewPage
          data={data}
          mushafScaleStep={mushafScaleStep}
          onSelectionChange={onSelectionChange}
          onWordPress={handleWordPress}
        />
      )}
      <View className="items-center px-3 pt-3">
        <View className="w-full max-w-[220px] flex-row items-center justify-center gap-3">
          <View className="h-px flex-1 bg-border/55 dark:bg-border-dark/40" />
          <Text className="text-xs font-medium text-muted dark:text-muted-dark">
            Page {pageNumber}
          </Text>
          <View className="h-px flex-1 bg-border/55 dark:bg-border-dark/40" />
        </View>
      </View>
    </View>
  );
}

export default function PageScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{ pageNumber?: string | string[] }>();
  const router = useRouter();
  const { height } = useWindowDimensions();
  const { resolvedTheme } = useAppTheme();
  const { audioPlayerBarHeight } = useLayoutMetrics();
  const palette = Colors[resolvedTheme];
  const pageNumberParam = Array.isArray(params.pageNumber)
    ? params.pageNumber[0]
    : params.pageNumber;
  const parsedPageNumber = Number.parseInt(pageNumberParam ?? '', 10);
  const initialPageNumber = clampPageNumber(
    Number.isInteger(parsedPageNumber) ? parsedPageNumber : null
  );

  const [isVerseActionsOpen, setIsVerseActionsOpen] = React.useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [isBookmarkModalOpen, setIsBookmarkModalOpen] = React.useState(false);
  const [isAddToPlannerOpen, setIsAddToPlannerOpen] = React.useState(false);
  const [plannerVerseSummary, setPlannerVerseSummary] =
    React.useState<VerseSummaryDetails | null>(null);
  const [activeVerse, setActiveVerse] = React.useState<ActiveMushafVerse | null>(null);

  const selectionMetadataRef = React.useRef<MushafSelectionPayload | null>(null);

  const { settings, isHydrated } = useSettings();
  const { chapters } = useChapters();
  const { isPinned } = useBookmarks();
  const audio = useAudioPlayer();

  const selectedMushafId = settings.mushafId ?? DEFAULT_MUSHAF_ID;

  const initialPageProbe = useMushafPageData({
    packId: selectedMushafId,
    pageNumber: initialPageNumber,
    enabled: isHydrated,
  });

  const chapterNamesById = React.useMemo(
    () => new Map(chapters.map((chapter) => [chapter.id, chapter.name_simple] as const)),
    [chapters]
  );

  const totalPages = initialPageProbe.data?.pack.totalPages ?? FALLBACK_TOTAL_PAGES;
  const pageNumbers = React.useMemo(
    () => Array.from({ length: totalPages }, (_value, index) => index + 1),
    [totalPages]
  );
  const initialPageIndex = Math.min(Math.max(initialPageNumber - 1, 0), pageNumbers.length - 1);
  const estimatedItemSize = React.useMemo(() => {
    if (initialPageProbe.data?.pack.renderer === 'text') {
      const fontSize = mushafScaleStepToFontSize(settings.mushafScaleStep);
      return Math.round(fontSize * 1.72 * initialPageProbe.data.pack.lines + fontSize * 2);
    }

    return Math.round(Math.max(height * 0.9, 620));
  }, [height, initialPageProbe.data, settings.mushafScaleStep]);
  const listContentContainerStyle = React.useMemo(
    () => ({ paddingTop: 12, paddingBottom: 24 + audioPlayerBarHeight }),
    [audioPlayerBarHeight]
  );

  React.useEffect(() => {
    setIsVerseActionsOpen(false);
    setIsSettingsOpen(false);
    setIsBookmarkModalOpen(false);
    setIsAddToPlannerOpen(false);
    setPlannerVerseSummary(null);
    setActiveVerse(null);
    selectionMetadataRef.current = null;
  }, [initialPageNumber, selectedMushafId]);

  const openVerseActions = React.useCallback((nextVerse: ActiveMushafVerse) => {
    setActiveVerse(nextVerse);
    setIsVerseActionsOpen(true);
  }, []);

  const closeVerseActions = React.useCallback(() => {
    setIsVerseActionsOpen(false);
  }, []);

  const handleMushafSelectionChange = React.useCallback((payload: MushafSelectionPayload) => {
    selectionMetadataRef.current = payload.isCollapsed ? null : payload;
  }, []);

  const handleVersePress = React.useCallback(
    (nextVerse: ActiveMushafVerse) => {
      if (selectionMetadataRef.current && !selectionMetadataRef.current.isCollapsed) {
        return;
      }

      openVerseActions(nextVerse);
    },
    [openVerseActions]
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
    const parsed = parseVerseKeyNumbers(verseKey);
    if (!parsed) return;

    router.push({
      pathname: '/tafsir/[surahId]/[ayahId]',
      params: {
        surahId: String(parsed.surahId),
        ayahId: String(parsed.verseNumber),
      },
    });
  }, [activeVerse?.verseKey, router]);

  const handleAddToPlan = React.useCallback(() => {
    const verseKey = activeVerse?.verseKey;
    if (!verseKey) return;

    setPlannerVerseSummary({
      verseKey,
      surahId: activeVerse?.surahId,
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
    const apiId =
      typeof activeVerse.verseApiId === 'number' ? String(activeVerse.verseApiId) : null;
    return Boolean((apiId && isPinned(apiId)) || isPinned(activeVerse.verseKey));
  }, [activeVerse, isPinned]);

  const activeVerseBookmarkMetadata = React.useMemo(() => {
    if (!activeVerse) return undefined;

    const metadata: Partial<Bookmark> = {
      verseKey: activeVerse.verseKey,
      ...(typeof activeVerse.verseApiId === 'number'
        ? { verseApiId: activeVerse.verseApiId }
        : {}),
      ...(activeVerse.arabicText ? { verseText: activeVerse.arabicText } : {}),
      ...(activeVerse.title ? { surahName: activeVerse.title } : {}),
      ...(activeVerse.translationTexts?.[0]
        ? { translation: activeVerse.translationTexts[0] }
        : {}),
    };

    return metadata;
  }, [activeVerse]);

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Mushaf',
          headerTitleAlign: 'center',
          headerShadowVisible: false,
          headerRight: () => (
            <Pressable
              onPress={() => setIsSettingsOpen(true)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Open reader settings"
              style={({ pressed }) => ({
                opacity: pressed ? 0.55 : 1,
                marginRight: 12,
              })}
            >
              <Settings color={palette.text} size={20} strokeWidth={2.25} />
            </Pressable>
          ),
        }}
      />

      {!isHydrated ? (
        <LoadingState label="Loading local mushaf settings…" color={palette.text} />
      ) : initialPageProbe.isLoading && !initialPageProbe.data ? (
        <LoadingState label="Loading mushaf pages…" color={palette.text} />
      ) : initialPageProbe.errorMessage ? (
        <ErrorState message={initialPageProbe.errorMessage} />
      ) : (
        <FlashList
          key={`mushaf-feed:${selectedMushafId}:${initialPageNumber}`}
          data={pageNumbers}
          keyExtractor={(item) => `mushaf-page:${selectedMushafId}:${item}`}
          renderItem={({ item }) => (
            <MushafFeedPageRow
              pageNumber={item}
              packId={selectedMushafId}
              mushafScaleStep={settings.mushafScaleStep}
              estimatedHeight={estimatedItemSize}
              chapterNamesById={chapterNamesById}
              loadingColor={palette.text}
              onSelectionChange={handleMushafSelectionChange}
              onVersePress={handleVersePress}
            />
          )}
          initialScrollIndex={initialPageIndex}
          drawDistance={Math.max(estimatedItemSize * 2, 1200)}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          contentContainerStyle={listContentContainerStyle}
          showsVerticalScrollIndicator={false}
        />
      )}

      <SettingsSidebar
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        activeTab="mushaf"
      />

      <VerseActionsSheet
        isOpen={isVerseActionsOpen}
        onClose={closeVerseActions}
        title={activeVerse?.title ?? 'Surah'}
        verseKey={activeVerse?.verseKey ?? ''}
        isPlaying={Boolean(audio.isPlaying && audio.activeVerseKey === activeVerse?.verseKey)}
        isBookmarked={activeVersePinned}
        onPlayPause={handlePlayPause}
        onOpenTafsir={handleOpenTafsir}
        onBookmark={handleBookmark}
        onAddToPlan={handleAddToPlan}
        onShare={activeVerse ? handleShare : undefined}
      />

      <BookmarkModal
        isOpen={isBookmarkModalOpen}
        onClose={() => setIsBookmarkModalOpen(false)}
        verseId={
          typeof activeVerse?.verseApiId === 'number' &&
          Number.isFinite(activeVerse.verseApiId) &&
          activeVerse.verseApiId > 0
            ? String(activeVerse.verseApiId)
            : (activeVerse?.verseKey ?? '')
        }
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
    </View>
  );
}
