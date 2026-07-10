import { Plus, Sparkles, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import React from 'react';
import {
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
import { warmSurahReaderBeforeNavigation } from '@/lib/surah/surahReaderWarmup';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';

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

function getVerseLabel(
  link: HomeQuickLink,
  chapter: Chapter | undefined,
  formatNumber: (value: number) => string
): string {
  if (!chapter) return `${formatNumber(link.surahId)}:${formatNumber(link.verseNumber)}`;
  return `${formatNumber(link.surahId)}:${formatNumber(Math.min(link.verseNumber, chapter.verses_count))}`;
}

export function HomeQuickLinksCard(): React.JSX.Element {
  const router = useRouter();
  const { settings } = useSettings();
  const { isDark, resolvedTheme } = useAppTheme();
  const { t, formatNumber } = useUiTranslation();
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
    (link: HomeQuickLink) => {
      const chapter = getChapter(chapters, link.surahId);
      const verseNumber = chapter
        ? Math.min(link.verseNumber, chapter.verses_count)
        : link.verseNumber;

      void (async () => {
        await warmSurahReaderBeforeNavigation({
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
      })();
    },
    [chapters, router, settings]
  );

  const activeShadow = React.useMemo(
    () =>
      Platform.OS === 'android'
        ? { elevation: 0 }
        : {
            shadowColor: '#000',
            shadowOpacity: 0.1,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 2 },
          },
    []
  );
  const chipShadow = React.useMemo(
    () =>
      Platform.OS === 'android'
        ? { elevation: 0, shadowColor: '#000' }
        : {
            shadowColor: '#000',
            shadowOpacity: 0,
            shadowRadius: 0,
            shadowOffset: { width: 0, height: 0 },
          },
    []
  );
  const textColor = palette.text;
  const mutedColor = palette.muted;
  const chipBackground = isDark ? palette.surfaceNavigation : palette.interactive;
  const borderColor = 'transparent';
  const borderWidth = 0;
  const iconCircleBackground = isDark ? '#0F172A' : '#FFFFFF';
  const canAdd = quickLinks.length < MAX_QUICK_LINKS;

  return (
    <View>
      <View className="mb-3 flex-row items-center justify-between px-3">
        <Text className="text-lg font-semibold" style={{ color: textColor }}>
          {t('quick_links', { fallback: 'Quick Links' })}
        </Text>
        <Text
          className="text-xs font-semibold"
          style={{ color: mutedColor, opacity: isHydrated ? 1 : 0 }}
        >
          {formatNumber(quickLinks.length)}/{formatNumber(MAX_QUICK_LINKS)}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipListContent}
      >
        {isHydrated ? (
          <>
            {quickLinks.map((link) => {
              const chapter = getChapter(chapters, link.surahId);
              const surahName = t(`surah_names.${link.surahId}`, {
                fallback: chapter?.name_simple ?? `${t('surah_tab')} ${link.surahId}`,
              });
              const verseLabel = getVerseLabel(link, chapter, formatNumber);

              return (
                <Pressable
                  key={link.id}
                  onPress={() => navigateToQuickLink(link)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open quick link ${surahName} ${verseLabel}`}
                  style={({ pressed }) => ({
                    maxWidth: 242,
                    opacity: pressed ? 0.92 : 1,
                    transform: [{ scale: pressed ? 0.985 : 1 }],
                  })}
                >
                  <View
                    className="flex-row items-center rounded-full py-1.5 pl-1.5 pr-2.5"
                    style={[
                      {
                        minHeight: 46,
                        maxWidth: 242,
                        backgroundColor: chipBackground,
                        borderRadius: 999,
                        borderWidth,
                        borderColor,
                      },
                      chipShadow,
                    ]}
                  >
                    <View
                      className="items-center justify-center rounded-full"
                      style={[{ width: 34, height: 34, backgroundColor: iconCircleBackground }, activeShadow]}
                    >
                      <Sparkles size={16} strokeWidth={2.3} color={palette.tint} />
                    </View>
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      className="ml-2.5 text-[15px] font-bold"
                      style={{ color: textColor, maxWidth: 150 }}
                    >
                      {surahName}{' '}
                      <Text className="text-[13px] font-semibold" style={{ color: mutedColor }}>
                        {verseLabel}
                      </Text>
                    </Text>
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        removeQuickLink(link.id);
                      }}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove quick link ${surahName} ${verseLabel}`}
                      className="ml-2 h-7 w-7 items-center justify-center rounded-full"
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
                  </View>
                </Pressable>
              );
            })}

            {canAdd ? (
              <Pressable
                onPress={() => setIsAddOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Add quick link"
                style={({ pressed }) => ({
                  minWidth: quickLinks.length === 0 ? undefined : 46,
                  alignSelf: 'flex-start',
                  opacity: pressed ? 0.95 : 1,
                  transform: [{ scale: pressed ? 0.985 : 1 }],
                })}
              >
                <View
                  className={`flex-row items-center justify-center rounded-full ${quickLinks.length === 0 ? 'py-1.5 pl-1.5 pr-5' : 'p-1.5'}`}
                  style={[
                    {
                      minHeight: 46,
                      minWidth: quickLinks.length === 0 ? undefined : 46,
                      backgroundColor: chipBackground,
                      borderRadius: 999,
                      borderWidth,
                      borderColor,
                    },
                    chipShadow,
                  ]}
                >
                  <View
                    className="items-center justify-center rounded-full"
                    style={[{ width: 34, height: 34, backgroundColor: iconCircleBackground }, activeShadow]}
                  >
                    <Plus size={18} strokeWidth={2.5} color={palette.tint} />
                  </View>
                  {quickLinks.length === 0 ? (
                    <Text
                      numberOfLines={1}
                      className="ml-2.5 text-[15px] font-bold"
                      style={{ color: textColor }}
                    >
                      {t('add_quick_link', { fallback: 'Add quick link' })}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ) : null}
          </>
        ) : (
          <View
            className="flex-row items-center rounded-full py-1.5 pl-1.5 pr-5"
            style={{
              minHeight: 46,
              width: 190,
              alignSelf: 'flex-start',
              backgroundColor: chipBackground,
              borderRadius: 999,
              borderWidth,
              borderColor,
              opacity: 0,
            }}
          />
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
  const { t } = useUiTranslation();
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

  return (
    <Modal
      transparent
      visible={isOpen}
      onRequestClose={onClose}
      animationType="fade"
      statusBarTranslucent
      {...(Platform.OS === 'ios' ? { presentationStyle: 'overFullScreen' as const } : {})}
    >
      <View className={isDark ? 'dark' : ''} style={styles.modalRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <View style={styles.overlay} />
        </Pressable>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalWrap}
        >
          <View
            className="overflow-hidden rounded-2xl border border-border/40 bg-surface dark:border-border-dark/30 dark:bg-background-dark"
            style={{ maxHeight }}
          >
            <SafeAreaView edges={['bottom']} className={isDark ? 'dark' : ''}>
              <View className="px-5 pt-5">
                <View className="flex-row items-center justify-between">
                  <View className="min-w-0 flex-1">
                    <Text className="text-xl font-bold text-foreground dark:text-foreground-dark">
                      {t('add') + ' ' + t('quick_navigation')}
                    </Text>
                  </View>
                  <Pressable
                    onPress={onClose}
                    hitSlop={10}
                    accessibilityRole="button"
                  accessibilityLabel={t('close')}
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
                  dropdownVisualOffset={1}
                />
              </View>

              <View className="flex-row justify-end gap-3 border-t border-border/60 px-5 py-3 dark:border-border-dark/40">
                <Pressable
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel={t('cancel')}
                  className="rounded-lg bg-interactive px-5 py-2.5 dark:bg-interactive-dark"
                  style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
                >
                  <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">
                    {t('cancel')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (!canSubmit) return;
                    onAdd(selectedSurah, selectedVerse);
                  }}
                  disabled={!canSubmit}
                  accessibilityRole="button"
                  accessibilityLabel={t('add') + ' ' + t('quick_navigation')}
                  className="rounded-lg bg-accent px-5 py-2.5"
                  style={({ pressed }) => ({ opacity: !canSubmit ? 0.5 : pressed ? 0.9 : 1 })}
                >
                  <Text className="text-sm font-semibold text-on-accent">{t('add')}</Text>
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
  chipListContent: {
    paddingLeft: 12,
    paddingRight: 16,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 4,
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
