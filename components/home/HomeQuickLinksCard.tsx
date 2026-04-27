import { Plus, Sparkles, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SurahVerseSelectorRow } from '@/components/search/SurahVerseSelectorRow';
import Colors from '@/constants/Colors';
import { useChapters } from '@/hooks/useChapters';
import { generateId } from '@/lib/id';
import { getItem, parseJson, setItem } from '@/lib/storage/appStorage';
import { preloadOfflineSurahNavigationPage } from '@/lib/surah/offlineSurahPageCache';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';

import type { Chapter } from '@/types';

const QUICK_LINKS_STORAGE_KEY = 'quranAppHomeQuickLinks_v1';
const MAX_QUICK_LINKS = 5;

type HomeQuickLink = {
  id: string;
  surahId: number;
  verseNumber: number;
  createdAt: number;
  updatedAt: number;
};

function isQuickLink(value: unknown): value is HomeQuickLink {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<HomeQuickLink>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.surahId === 'number' &&
    Number.isFinite(candidate.surahId) &&
    candidate.surahId > 0 &&
    typeof candidate.verseNumber === 'number' &&
    Number.isFinite(candidate.verseNumber) &&
    candidate.verseNumber > 0 &&
    typeof candidate.createdAt === 'number' &&
    Number.isFinite(candidate.createdAt) &&
    typeof candidate.updatedAt === 'number' &&
    Number.isFinite(candidate.updatedAt)
  );
}

function normalizeQuickLinks(value: unknown): HomeQuickLink[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const normalized: HomeQuickLink[] = [];

  for (const item of value) {
    if (!isQuickLink(item)) continue;
    const key = `${item.surahId}:${item.verseNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(item);
    if (normalized.length >= MAX_QUICK_LINKS) break;
  }

  return normalized.sort((a, b) => b.updatedAt - a.updatedAt);
}

function getChapter(chapters: Chapter[], surahId: number): Chapter | undefined {
  return chapters.find((chapter) => chapter.id === surahId);
}

function getVerseLabel(link: HomeQuickLink, chapter: Chapter | undefined): string {
  if (!chapter) return `${link.surahId}:${link.verseNumber}`;
  return `${link.surahId}:${Math.min(link.verseNumber, chapter.verses_count)}`;
}

export function HomeQuickLinksCard(): React.JSX.Element {
  const router = useRouter();
  const { settings } = useSettings();
  const { isDark, resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { chapters, isLoading } = useChapters();

  const [quickLinks, setQuickLinks] = React.useState<HomeQuickLink[]>([]);
  const [isHydrated, setIsHydrated] = React.useState(false);
  const [isAddOpen, setIsAddOpen] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;

    void getItem(QUICK_LINKS_STORAGE_KEY).then((raw) => {
      if (!isMounted) return;
      setQuickLinks(normalizeQuickLinks(parseJson<unknown>(raw)));
      setIsHydrated(true);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  React.useEffect(() => {
    if (!isHydrated) return;
    void setItem(QUICK_LINKS_STORAGE_KEY, JSON.stringify(quickLinks));
  }, [isHydrated, quickLinks]);

  const addQuickLink = React.useCallback((surahId: number, verseNumber: number) => {
    const now = Date.now();
    setQuickLinks((current) => {
      const existing = current.find(
        (link) => link.surahId === surahId && link.verseNumber === verseNumber
      );
      const nextLink: HomeQuickLink = existing
        ? { ...existing, updatedAt: now }
        : { id: generateId(), surahId, verseNumber, createdAt: now, updatedAt: now };

      return [
        nextLink,
        ...current.filter((link) => link.id !== nextLink.id),
      ].slice(0, MAX_QUICK_LINKS);
    });
  }, []);

  const removeQuickLink = React.useCallback((id: string) => {
    setQuickLinks((current) => current.filter((link) => link.id !== id));
  }, []);

  const navigateToQuickLink = React.useCallback(
    async (link: HomeQuickLink) => {
      const chapter = getChapter(chapters, link.surahId);
      const verseNumber = chapter
        ? Math.min(link.verseNumber, chapter.verses_count)
        : link.verseNumber;

      await preloadOfflineSurahNavigationPage({
        surahId: link.surahId,
        verseNumber,
        settings,
      });
      router.push({
        pathname: '/surah/[surahId]',
        params: {
          surahId: String(link.surahId),
          startVerse: String(verseNumber),
        },
      });
    },
    [chapters, router, settings]
  );

  const chipBackground = isDark ? '#182333' : palette.surface;
  const chipBorder = isDark ? 'rgba(148,163,184,0.24)' : palette.border;
  const iconBackground = isDark ? '#F8FAFC' : '#FFFFFF';
  const textColor = palette.text;
  const mutedColor = palette.muted;
  const canAdd = quickLinks.length < MAX_QUICK_LINKS;

  return (
    <View>
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-lg font-semibold text-content-primary dark:text-content-primary-dark">
          Quick Links
        </Text>
        <Text className="text-xs font-semibold text-muted dark:text-muted-dark">
          {quickLinks.length}/{MAX_QUICK_LINKS}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: 16 }}
      >
        {isHydrated ? (
          <>
            {quickLinks.map((link) => {
              const chapter = getChapter(chapters, link.surahId);
              const surahName = chapter?.name_simple ?? `Surah ${link.surahId}`;
              const verseLabel = getVerseLabel(link, chapter);

              return (
                <Pressable
                  key={link.id}
                  onPress={() => navigateToQuickLink(link)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open quick link ${surahName} ${verseLabel}`}
                  className="flex-row items-center rounded-full"
                  style={({ pressed }) => [
                    styles.chipShadow,
                    {
                      height: 48,
                      minWidth: 176,
                      maxWidth: 238,
                      marginRight: 10,
                      paddingLeft: 9,
                      paddingRight: 8,
                      backgroundColor: chipBackground,
                      borderColor: chipBorder,
                      borderWidth: 1,
                      opacity: pressed ? 0.92 : 1,
                      transform: [{ scale: pressed ? 0.985 : 1 }],
                    },
                  ]}
                >
                  <View
                    className="h-8 w-8 items-center justify-center rounded-full"
                    style={{ backgroundColor: iconBackground }}
                  >
                    <Sparkles size={15} strokeWidth={2.3} color={palette.tint} />
                  </View>
                  <View className="ml-2.5 min-w-0 flex-1 flex-row items-baseline">
                    <Text
                      numberOfLines={1}
                      className="min-w-0 shrink text-[14px] font-bold"
                      style={{ color: textColor, maxWidth: 124 }}
                    >
                      {surahName}
                    </Text>
                    <Text
                      numberOfLines={1}
                      className="ml-2 text-[12px] font-semibold"
                      style={{ color: mutedColor }}
                    >
                      {verseLabel}
                    </Text>
                  </View>
                  <Pressable
                    onPress={(event) => {
                      event.stopPropagation();
                      removeQuickLink(link.id);
                    }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove quick link ${surahName} ${verseLabel}`}
                    className="ml-1 h-7 w-7 items-center justify-center rounded-full"
                    style={({ pressed }) => ({
                      backgroundColor: pressed
                        ? isDark
                          ? 'rgba(148,163,184,0.16)'
                          : 'rgba(102,112,133,0.10)'
                        : 'transparent',
                    })}
                  >
                    <X size={14} strokeWidth={2.4} color={mutedColor} />
                  </Pressable>
                </Pressable>
              );
            })}

            {canAdd ? (
              <Pressable
                onPress={() => setIsAddOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Add quick link"
                className="flex-row items-center rounded-full"
                style={({ pressed }) => [
                  styles.chipShadow,
                  {
                    height: 48,
                    minWidth: quickLinks.length === 0 ? 168 : 52,
                    marginRight: 0,
                    paddingLeft: 9,
                    paddingRight: quickLinks.length === 0 ? 16 : 9,
                    backgroundColor: chipBackground,
                    borderColor: chipBorder,
                    borderWidth: 1,
                    opacity: pressed ? 0.9 : 1,
                    transform: [{ scale: pressed ? 0.985 : 1 }],
                  },
                ]}
              >
                <View
                  className="h-8 w-8 items-center justify-center rounded-full"
                  style={{ backgroundColor: iconBackground }}
                >
                  <Plus size={17} strokeWidth={2.5} color={palette.tint} />
                </View>
                {quickLinks.length === 0 ? (
                  <Text
                    numberOfLines={1}
                    className="ml-2.5 text-[13px] font-bold"
                    style={{ color: textColor }}
                  >
                    Add quick link
                  </Text>
                ) : null}
              </Pressable>
            ) : null}
          </>
        ) : (
          <View
            className="flex-row items-center rounded-full"
            style={[
              styles.chipShadow,
              {
                height: 48,
                paddingHorizontal: 16,
                backgroundColor: chipBackground,
                borderColor: chipBorder,
                borderWidth: 1,
              },
            ]}
          >
            <ActivityIndicator size="small" color={palette.muted} />
            <Text className="ml-3 text-sm font-semibold" style={{ color: mutedColor }}>
              Loading quick links...
            </Text>
          </View>
        )}
      </ScrollView>

      <AddQuickLinkModal
        isOpen={isAddOpen}
        chapters={chapters}
        isLoading={isLoading}
        onClose={() => setIsAddOpen(false)}
        onAdd={(surahId, verseNumber) => {
          addQuickLink(surahId, verseNumber);
          setIsAddOpen(false);
        }}
      />
    </View>
  );
}

function AddQuickLinkModal({
  isOpen,
  chapters,
  isLoading,
  onClose,
  onAdd,
}: {
  isOpen: boolean;
  chapters: Chapter[];
  isLoading: boolean;
  onClose: () => void;
  onAdd: (surahId: number, verseNumber: number) => void;
}): React.JSX.Element {
  const { isDark, resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const { height: windowHeight } = useWindowDimensions();
  const [selectedSurah, setSelectedSurah] = React.useState<number | undefined>(undefined);
  const [selectedVerse, setSelectedVerse] = React.useState<number | undefined>(undefined);

  React.useEffect(() => {
    if (isOpen) return;
    setSelectedSurah(undefined);
    setSelectedVerse(undefined);
  }, [isOpen]);

  const handleSelectSurah = React.useCallback(
    (surahId: number) => {
      const chapter = getChapter(chapters, surahId);
      setSelectedSurah(surahId);
      setSelectedVerse((current) => {
        if (!chapter || typeof current !== 'number') return undefined;
        return current > chapter.verses_count ? undefined : current;
      });
    },
    [chapters]
  );

  const canSubmit = typeof selectedSurah === 'number' && typeof selectedVerse === 'number';
  const maxHeight = Math.max(0, Math.round(windowHeight * 0.72));
  const minHeight = Math.min(maxHeight, Math.max(310, Math.round(windowHeight * 0.36)));

  return (
    <Modal
      transparent
      visible={isOpen}
      onRequestClose={onClose}
      animationType="fade"
      statusBarTranslucent
      hardwareAccelerated
      {...(Platform.OS === 'ios' ? { presentationStyle: 'overFullScreen' as const } : {})}
    >
      <View style={styles.modalRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <View style={styles.overlay} />
        </Pressable>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalWrap}
        >
          <View
            className="overflow-hidden rounded-2xl border border-border/40 bg-surface dark:border-border-dark/30 dark:bg-surface-dark"
            style={{ maxHeight, minHeight }}
          >
            <SafeAreaView edges={['bottom']} className={isDark ? 'dark' : ''}>
              <View className="px-5 pt-5">
                <View className="flex-row items-center justify-between">
                  <View className="min-w-0 flex-1">
                    <Text className="text-xl font-bold text-foreground dark:text-foreground-dark">
                      Add quick link
                    </Text>
                    <Text className="mt-1 text-sm text-muted dark:text-muted-dark">
                      Choose a surah and verse
                    </Text>
                  </View>
                  <Pressable
                    onPress={onClose}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                    className="h-9 w-9 items-center justify-center rounded-full bg-interactive dark:bg-interactive-dark"
                    style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                  >
                    <X size={17} strokeWidth={2.4} color={palette.muted} />
                  </Pressable>
                </View>
              </View>

              <View className="px-5 py-5">
                <SurahVerseSelectorRow
                  chapters={chapters}
                  isLoading={isLoading}
                  selectedSurah={selectedSurah}
                  selectedVerse={selectedVerse}
                  onSelectSurah={handleSelectSurah}
                  onSelectVerse={setSelectedVerse}
                />
              </View>

              <View className="flex-row justify-end gap-3 border-t border-border/60 px-5 py-4 dark:border-border-dark/40">
                <Pressable
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                  className="rounded-lg bg-interactive px-4 py-2 dark:bg-interactive-dark"
                  style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                >
                  <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (!canSubmit) return;
                    onAdd(selectedSurah, selectedVerse);
                  }}
                  disabled={!canSubmit}
                  accessibilityRole="button"
                  accessibilityLabel="Add quick link"
                  className="rounded-lg bg-accent px-5 py-2"
                  style={({ pressed }) => ({ opacity: !canSubmit ? 0.5 : pressed ? 0.9 : 1 })}
                >
                  <Text className="text-sm font-semibold text-on-accent">Add</Text>
                </Pressable>
              </View>
            </SafeAreaView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  chipShadow:
    Platform.OS === 'android'
      ? { elevation: 1 }
      : {
          shadowColor: '#000',
          shadowOpacity: 0.07,
          shadowRadius: 5,
          shadowOffset: { width: 0, height: 2 },
        },
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modalWrap: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: '#00000080',
  },
});
