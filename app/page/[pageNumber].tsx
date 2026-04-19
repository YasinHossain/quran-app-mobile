import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, ChevronLeft, ChevronRight, RotateCw, Settings } from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  View,
} from 'react-native';

import { BookmarkModal } from '@/components/bookmarks/BookmarkModal';
import { MushafNativePage } from '@/components/mushaf/MushafNativePage';
import {
  resolveMushafVerseKey,
  type MushafSelectionPayload,
  type MushafWordPressPayload,
} from '@/components/mushaf/mushafWordPayload';
import { MushafWebViewPage } from '@/components/mushaf/MushafWebViewPage';
import { SettingsSidebar } from '@/components/reader/settings/SettingsSidebar';
import type { SettingsTab } from '@/components/reader/settings/SettingsTabToggle';
import { VerseActionsSheet } from '@/components/surah/VerseActionsSheet';
import { AddToPlannerModal, type VerseSummaryDetails } from '@/components/verse-planner-modal';
import Colors from '@/constants/Colors';
import { DEFAULT_MUSHAF_ID, findMushafOption } from '@/data/mushaf/options';
import { useChapters } from '@/hooks/useChapters';
import { useMushafPageData } from '@/hooks/useMushafPageData';
import { useAudioPlayer } from '@/providers/AudioPlayerContext';
import { useBookmarks } from '@/providers/BookmarkContext';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';

import type { Bookmark, MushafVerse } from '@/types';

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

function ActionButton({
  label,
  onPress,
  disabled = false,
  tone = 'default',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'default' | 'accent';
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className={[
        'rounded-full px-4 py-2.5',
        tone === 'accent' ? 'bg-accent' : 'bg-interactive dark:bg-interactive-dark',
      ].join(' ')}
      style={({ pressed }) => ({
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <Text
        className={[
          'text-sm font-semibold',
          tone === 'accent' ? 'text-on-accent' : 'text-foreground dark:text-foreground-dark',
        ].join(' ')}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function StateCard({
  title,
  message,
  children,
}: {
  title: string;
  message: string;
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <View className="rounded-[28px] border border-border/40 bg-surface px-4 py-4 dark:border-border-dark/30 dark:bg-surface-dark">
      <Text className="text-lg font-semibold text-foreground dark:text-foreground-dark">
        {title}
      </Text>
      <Text className="mt-2 text-sm leading-6 text-muted dark:text-muted-dark">{message}</Text>
      {children ? <View className="mt-4 flex-row flex-wrap gap-3">{children}</View> : null}
    </View>
  );
}

function NavigationButton({
  label,
  icon,
  onPress,
  disabled = false,
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-1 rounded-[24px] border border-border/40 bg-interactive px-4 py-4 dark:border-border-dark/30 dark:bg-interactive-dark"
      style={({ pressed }) => ({
        opacity: disabled ? 0.45 : pressed ? 0.88 : 1,
      })}
    >
      <View className="items-center gap-2">
        {icon}
        <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

export default function PageScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{ pageNumber?: string | string[] }>();
  const router = useRouter();
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const pageNumberParam = Array.isArray(params.pageNumber)
    ? params.pageNumber[0]
    : params.pageNumber;
  const parsedPageNumber = Number.parseInt(pageNumberParam ?? '', 10);
  const pageNumber = Number.isInteger(parsedPageNumber) ? parsedPageNumber : null;

  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [isVerseActionsOpen, setIsVerseActionsOpen] = React.useState(false);
  const [isBookmarkModalOpen, setIsBookmarkModalOpen] = React.useState(false);
  const [isAddToPlannerOpen, setIsAddToPlannerOpen] = React.useState(false);
  const [plannerVerseSummary, setPlannerVerseSummary] =
    React.useState<VerseSummaryDetails | null>(null);
  const [activeVerse, setActiveVerse] = React.useState<ActiveMushafVerse | null>(null);

  const selectionMetadataRef = React.useRef<MushafSelectionPayload | null>(null);

  const { settings, isHydrated, setMushafId } = useSettings();
  const { chapters } = useChapters();
  const { isPinned } = useBookmarks();
  const audio = useAudioPlayer();

  const selectedMushafId = settings.mushafId ?? DEFAULT_MUSHAF_ID;
  const mushafOption = findMushafOption(selectedMushafId);
  const mushafName = mushafOption?.name ?? selectedMushafId;

  const { data, isLoading, errorKind, errorMessage, refresh } = useMushafPageData({
    packId: selectedMushafId,
    pageNumber,
    enabled: isHydrated,
  });

  const totalPages = data?.pack.totalPages ?? FALLBACK_TOTAL_PAGES;
  const canGoPrevious = pageNumber !== null && pageNumber > 1;
  const canGoNext = pageNumber !== null && pageNumber < totalPages;

  const chaptersById = React.useMemo(
    () => new Map(chapters.map((chapter) => [chapter.id, chapter] as const)),
    [chapters]
  );

  const versesByKey = React.useMemo(
    () => new Map((data?.verses ?? []).map((verse) => [verse.verseKey, verse] as const)),
    [data?.verses]
  );

  React.useEffect(() => {
    setIsVerseActionsOpen(false);
    setIsBookmarkModalOpen(false);
    setIsAddToPlannerOpen(false);
    setPlannerVerseSummary(null);
    setActiveVerse(null);
    selectionMetadataRef.current = null;
  }, [pageNumber, selectedMushafId]);

  const navigateToPage = React.useCallback(
    (targetPageNumber: number) => {
      if (!Number.isInteger(targetPageNumber) || targetPageNumber < 1) return;
      router.replace({
        pathname: '/page/[pageNumber]',
        params: { pageNumber: String(targetPageNumber) },
      });
    },
    [router]
  );

  const openBundledMushaf = React.useCallback(() => {
    setMushafId(DEFAULT_MUSHAF_ID);
  }, [setMushafId]);

  const openVerseActions = React.useCallback((nextVerse: ActiveMushafVerse) => {
    setActiveVerse(nextVerse);
    setIsVerseActionsOpen(true);
  }, []);

  const closeVerseActions = React.useCallback(() => {
    setIsVerseActionsOpen(false);
  }, []);

  const buildActiveVerse = React.useCallback(
    (payload: MushafWordPressPayload): ActiveMushafVerse | null => {
      const verseKey = resolveMushafVerseKey(payload);
      if (!verseKey) {
        return null;
      }

      const verse = versesByKey.get(verseKey);
      if (!verse) {
        return null;
      }

      const parsed = parseVerseKeyNumbers(verseKey);
      if (!parsed) {
        return null;
      }

      const chapter = chaptersById.get(parsed.surahId);
      return {
        title: chapter?.name_simple ?? `Surah ${parsed.surahId}`,
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
      };
    },
    [chaptersById, versesByKey]
  );

  const handleMushafSelectionChange = React.useCallback((payload: MushafSelectionPayload) => {
    selectionMetadataRef.current = payload.isCollapsed ? null : payload;
  }, []);

  const handleMushafWordPress = React.useCallback(
    (payload: MushafWordPressPayload) => {
      if (selectionMetadataRef.current && !selectionMetadataRef.current.isCollapsed) {
        return;
      }

      const nextVerse = buildActiveVerse(payload);
      if (!nextVerse) {
        return;
      }

      openVerseActions(nextVerse);
    },
    [buildActiveVerse, openVerseActions]
  );

  const handleSettingsTabChange = React.useCallback(
    (nextTab: SettingsTab) => {
      if (nextTab !== 'translations') return;

      const firstVerseKey = data?.lookup.firstVerseKey ?? data?.verses[0]?.verseKey ?? null;
      const parsed = parseVerseKeyNumbers(firstVerseKey);

      setIsSettingsOpen(false);

      if (!parsed) {
        router.back();
        return;
      }

      router.push({
        pathname: '/surah/[surahId]',
        params: {
          surahId: String(parsed.surahId),
          startVerse: String(parsed.verseNumber),
        },
      });
    },
    [data?.lookup.firstVerseKey, data?.verses, router]
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

  const refreshControl = (
    <RefreshControl
      refreshing={Boolean(isHydrated && isLoading && data)}
      onRefresh={refresh}
      tintColor={palette.text}
    />
  );

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      <Stack.Screen
        options={{
          title: '',
          headerTitleAlign: 'center',
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, marginLeft: 12 })}
            >
              <ArrowLeft color={palette.text} size={22} strokeWidth={2.25} />
            </Pressable>
          ),
          headerTitle: () => (
            <View className="items-center">
              <Text className="text-base font-semibold text-foreground dark:text-foreground-dark">
                {pageNumber ? `Page ${pageNumber}` : 'Mushaf'}
              </Text>
              <Text className="text-xs text-muted dark:text-muted-dark">{mushafName}</Text>
            </View>
          ),
          headerRight: () => (
            <Pressable
              onPress={() => setIsSettingsOpen(true)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Open reader settings"
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

      <ScrollView
        refreshControl={refreshControl}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-4">
          <View className="rounded-[28px] border border-border/40 bg-surface px-4 py-4 dark:border-border-dark/30 dark:bg-surface-dark">
            <Text className="text-xs font-semibold uppercase tracking-wide text-muted dark:text-muted-dark">
              Mushaf Reader
            </Text>
            <Text className="mt-2 text-2xl font-semibold text-foreground dark:text-foreground-dark">
              {pageNumber ? `Page ${pageNumber}` : 'Select a page'}
            </Text>
            <Text className="mt-1 text-sm text-muted dark:text-muted-dark">
              Canonical native shell for the offline mushaf route. Verse actions stay native while
              the page body comes entirely from the active local pack.
            </Text>

            <View className="mt-4 flex-row gap-3">
              <NavigationButton
                label="Previous"
                icon={<ChevronLeft color={palette.text} size={20} strokeWidth={2.25} />}
                onPress={() => navigateToPage((pageNumber ?? 1) - 1)}
                disabled={!canGoPrevious}
              />
              <NavigationButton
                label="Next"
                icon={<ChevronRight color={palette.text} size={20} strokeWidth={2.25} />}
                onPress={() => navigateToPage((pageNumber ?? 1) + 1)}
                disabled={!canGoNext}
              />
            </View>

            <View className="mt-4 flex-row flex-wrap gap-3">
              <ActionButton label="Reader settings" onPress={() => setIsSettingsOpen(true)} />
              <ActionButton label="Refresh" onPress={refresh} />
            </View>
          </View>

          {!isHydrated ? (
            <StateCard
              title="Loading reader settings"
              message="Hydrating the saved mushaf selection and reader preferences on this device."
            >
              <View className="flex-row items-center gap-3">
                <ActivityIndicator color={palette.text} />
                <Text className="text-sm text-muted dark:text-muted-dark">
                  Preparing local reader state…
                </Text>
              </View>
            </StateCard>
          ) : null}

          {isHydrated && pageNumber === null ? (
            <StateCard
              title="Invalid page"
              message="This route needs a numeric mushaf page number between 1 and the pack’s total page count."
            >
              <ActionButton label="Go to Page 1" onPress={() => navigateToPage(1)} tone="accent" />
            </StateCard>
          ) : null}

          {isHydrated && pageNumber !== null && isLoading && !data ? (
            <StateCard
              title="Loading local page"
              message="Reading the active mushaf payload from local bundled or installed files."
            >
              <View className="flex-row items-center gap-3">
                <ActivityIndicator color={palette.text} />
                <Text className="text-sm text-muted dark:text-muted-dark">
                  Loading page metadata…
                </Text>
              </View>
            </StateCard>
          ) : null}

          {isHydrated && pageNumber !== null && !isLoading && errorMessage ? (
            <StateCard
              title={errorKind === 'pack-not-installed' ? 'Download needed' : 'Unable to load page'}
              message={
                errorKind === 'pack-not-installed'
                  ? `${errorMessage} Open reader settings to choose another mushaf, or switch back to the bundled default for immediate offline reading.`
                  : errorMessage
              }
            >
              <ActionButton label="Retry" onPress={refresh} />
              <ActionButton label="Reader settings" onPress={() => setIsSettingsOpen(true)} />
              {selectedMushafId !== DEFAULT_MUSHAF_ID ? (
                <ActionButton
                  label="Use bundled default"
                  onPress={openBundledMushaf}
                  tone="accent"
                />
              ) : null}
              {errorKind !== 'pack-not-installed' ? (
                <ActionButton label="Go to Page 1" onPress={() => navigateToPage(1)} />
              ) : null}
            </StateCard>
          ) : null}

          {isHydrated && pageNumber !== null && data ? (
            data.pack.renderer === 'text' ? (
              <MushafNativePage
                data={data}
                mushafName={mushafName}
                mushafScaleStep={settings.mushafScaleStep}
                onWordPress={handleMushafWordPress}
              />
            ) : (
              <MushafWebViewPage
                data={data}
                mushafName={mushafName}
                mushafScaleStep={settings.mushafScaleStep}
                onSelectionChange={handleMushafSelectionChange}
                onWordPress={handleMushafWordPress}
              />
            )
          ) : null}

          {isHydrated && pageNumber !== null && data && isLoading ? (
            <View className="flex-row items-center justify-center gap-3 py-2">
              <RotateCw color={palette.text} size={16} strokeWidth={2.25} />
              <Text className="text-sm text-muted dark:text-muted-dark">
                Refreshing local page…
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <SettingsSidebar
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        activeTab="mushaf"
        onTabChange={handleSettingsTabChange}
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
