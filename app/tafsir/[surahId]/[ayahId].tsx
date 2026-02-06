import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Settings } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { AyahNavigationBar, type NavTarget } from '@/components/tafsir/AyahNavigationBar';
import { TafsirHtml } from '@/components/tafsir/TafsirHtml';
import { TafsirTabs } from '@/components/tafsir/TafsirTabs';
import { SettingsSidebar } from '@/components/reader/settings/SettingsSidebar';
import { VerseCard } from '@/components/surah/VerseCard';
import Colors from '@/constants/Colors';
import { useTafsirResources } from '@/hooks/useTafsirResources';
import { getTafsirCached } from '@/lib/tafsir/tafsirCache';
import { useSettings } from '@/providers/SettingsContext';
import { useAppTheme } from '@/providers/ThemeContext';

import type { SurahHeaderChapter } from '@/components/surah/SurahHeaderCard';

type ApiChapterResponse = {
  chapter: SurahHeaderChapter;
};

type ApiVerseResponse = {
  verse: {
    verse_key: string;
    text_uthmani?: string;
    translations?: Array<{ resource_id: number; text: string }>;
  };
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

export default function TafsirScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{ surahId?: string | string[]; ayahId?: string | string[] }>();
  const router = useRouter();
  const surahIdRaw = Array.isArray(params.surahId) ? params.surahId[0] : params.surahId;
  const ayahIdRaw = Array.isArray(params.ayahId) ? params.ayahId[0] : params.ayahId;
  const surahNumber = surahIdRaw ? Number(surahIdRaw) : NaN;
  const ayahNumber = ayahIdRaw ? Number(ayahIdRaw) : NaN;
  const verseKey = surahIdRaw && ayahIdRaw ? `${surahIdRaw}:${ayahIdRaw}` : '';

  const { resolvedTheme, isDark } = useAppTheme();
  const palette = Colors[resolvedTheme];

  const { settings } = useSettings();
  const scrollRef = React.useRef<ScrollView>(null);
  const translationIds = React.useMemo(() => {
    const ids =
      settings.translationIds?.length ? settings.translationIds : [settings.translationId ?? 20];
    return ids.filter((id) => Number.isFinite(id) && id > 0);
  }, [settings.translationId, settings.translationIds]);
  const translationIdsKey = translationIds.join(',');

  const tafsirIds = settings.tafsirIds ?? [];
  const activeTafsirId = tafsirIds[0];

  const { tafsirById } = useTafsirResources({ enabled: tafsirIds.length > 0 });
  const activeTafsirName =
    typeof activeTafsirId === 'number'
      ? tafsirById.get(activeTafsirId)?.displayName ?? `Tafsir ${activeTafsirId}`
      : '';

  const [chapter, setChapter] = React.useState<SurahHeaderChapter | null>(null);
  const [prevSurahVerseCount, setPrevSurahVerseCount] = React.useState<number | null>(null);
  const [verse, setVerse] = React.useState<ApiVerseResponse['verse'] | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const [tafsirHtml, setTafsirHtml] = React.useState<string>('');
  const [isTafsirLoading, setIsTafsirLoading] = React.useState(false);
  const [tafsirError, setTafsirError] = React.useState<string | null>(null);
  const [verseRenderSignal, setVerseRenderSignal] = React.useState(0);

  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);

  React.useEffect(() => {
    if (!Number.isFinite(surahNumber) || !Number.isFinite(ayahNumber)) {
      setChapter(null);
      setPrevSurahVerseCount(null);
      setVerse(null);
      setIsLoading(false);
      setErrorMessage('Invalid verse reference.');
      return;
    }

    let canceled = false;
    setIsLoading(true);
    setErrorMessage(null);
    setTafsirError(null);

    async function run(): Promise<void> {
      try {
        const chapterUrl = `https://api.quran.com/api/v4/chapters/${surahNumber}?language=en`;
        const verseUrl = `https://api.quran.com/api/v4/verses/by_key/${encodeURIComponent(
          verseKey
        )}?language=en&words=false&translations=${encodeURIComponent(
          translationIdsKey
        )}&fields=text_uthmani`;

        const [chapterRes, verseRes] = await Promise.all([fetch(chapterUrl), fetch(verseUrl)]);

        if (!chapterRes.ok) {
          throw new Error(`Failed to load surah (${chapterRes.status})`);
        }
        if (!verseRes.ok) {
          throw new Error(`Failed to load verse (${verseRes.status})`);
        }

        const chapterJson = (await chapterRes.json()) as ApiChapterResponse;
        const verseJson = (await verseRes.json()) as ApiVerseResponse;

        if (canceled) return;
        setChapter(chapterJson.chapter);
        setVerse(verseJson.verse);
      } catch (error) {
        if (canceled) return;
        setErrorMessage((error as Error).message);
      } finally {
        if (canceled) return;
        setIsLoading(false);
      }
    }

    void run();
    return () => {
      canceled = true;
    };
  }, [ayahNumber, surahNumber, translationIdsKey, verseKey]);

  React.useEffect(() => {
    if (!Number.isFinite(surahNumber) || !Number.isFinite(ayahNumber)) return;
    if (ayahNumber !== 1) {
      setPrevSurahVerseCount(null);
      return;
    }
    if (surahNumber <= 1) {
      setPrevSurahVerseCount(null);
      return;
    }

    let canceled = false;
    async function run(): Promise<void> {
      try {
        const res = await fetch(`https://api.quran.com/api/v4/chapters/${surahNumber - 1}?language=en`);
        if (!res.ok) throw new Error('Failed to load previous surah');
        const json = (await res.json()) as ApiChapterResponse;
        if (canceled) return;
        setPrevSurahVerseCount(json.chapter.verses_count);
      } catch {
        if (canceled) return;
        setPrevSurahVerseCount(null);
      }
    }

    void run();
    return () => {
      canceled = true;
    };
  }, [ayahNumber, surahNumber]);

  React.useEffect(() => {
    if (!verseKey || typeof activeTafsirId !== 'number') {
      setTafsirHtml('');
      setIsTafsirLoading(false);
      setTafsirError(null);
      return;
    }

    if (tafsirIds.length > 1) return;

    let canceled = false;
    setIsTafsirLoading(true);
    setTafsirError(null);

    getTafsirCached(verseKey, activeTafsirId)
      .then((html) => {
        if (canceled) return;
        setTafsirHtml(html);
      })
      .catch(() => {
        if (canceled) return;
        setTafsirError('Failed to load tafsir content.');
        setTafsirHtml('');
      })
      .finally(() => {
        if (canceled) return;
        setIsTafsirLoading(false);
      });

    return () => {
      canceled = true;
    };
  }, [activeTafsirId, tafsirIds.length, verseKey]);

  const translationTexts = React.useMemo(() => {
    const incoming = verse?.translations ?? [];
    const byResourceId = new Map(incoming.map((t) => [t.resource_id, t.text]));
    const ordered = translationIds
      .map((id) => byResourceId.get(id))
      .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      .map(stripHtml);
    return ordered.length ? ordered : incoming.map((t) => stripHtml(t.text ?? '')).filter(Boolean);
  }, [translationIds, verse?.translations]);

  const navTitle = React.useMemo(() => {
    const chapterName = chapter?.name_simple ?? (surahIdRaw ? `Surah ${surahIdRaw}` : 'Surah');
    const reference = surahIdRaw && ayahIdRaw ? `${surahIdRaw}:${ayahIdRaw}` : '';
    return reference ? `${chapterName} : ${reference}` : chapterName;
  }, [ayahIdRaw, chapter?.name_simple, surahIdRaw]);

  const prevTarget: NavTarget | null = React.useMemo(() => {
    if (!Number.isFinite(surahNumber) || !Number.isFinite(ayahNumber)) return null;
    if (ayahNumber > 1) return { surahId: surahNumber, ayahId: ayahNumber - 1 };
    if (surahNumber > 1 && typeof prevSurahVerseCount === 'number' && prevSurahVerseCount > 0) {
      return { surahId: surahNumber - 1, ayahId: prevSurahVerseCount };
    }
    return null;
  }, [ayahNumber, prevSurahVerseCount, surahNumber]);

  const nextTarget: NavTarget | null = React.useMemo(() => {
    if (!Number.isFinite(surahNumber) || !Number.isFinite(ayahNumber)) return null;
    const versesCount = chapter?.verses_count;
    if (typeof versesCount === 'number' && ayahNumber < versesCount) {
      return { surahId: surahNumber, ayahId: ayahNumber + 1 };
    }
    if (surahNumber < 114) {
      return { surahId: surahNumber + 1, ayahId: 1 };
    }
    return null;
  }, [ayahNumber, chapter?.verses_count, surahNumber]);

  const navigateTo = React.useCallback(
    (target: NavTarget) => {
      router.replace({
        pathname: '/tafsir/[surahId]/[ayahId]',
        params: { surahId: String(target.surahId), ayahId: String(target.ayahId) },
      });
    },
    [router]
  );

  React.useEffect(() => {
    setVerseRenderSignal((value) => value + 1);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [tafsirIds.join(',')]);

  const handleActiveTafsirChange = React.useCallback(() => {
    setVerseRenderSignal((value) => value + 1);
  }, []);

  return (
    <View className={isDark ? 'flex-1 dark' : 'flex-1'}>
      <View className="flex-1 bg-background dark:bg-background-dark">
      <Stack.Screen
        options={{
          title: 'Tafsir',
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

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={false}
      >
        <AyahNavigationBar
          title={navTitle}
          onBack={() => router.back()}
          prev={prevTarget}
          next={nextTarget}
          onNavigate={navigateTo}
        />

        {errorMessage ? (
          <Text className="mt-4 text-sm text-error dark:text-error-dark">{errorMessage}</Text>
        ) : null}

        {verse ? (
          <View className="mt-4" collapsable={false}>
            <VerseCard
              verseKey={verse.verse_key}
              arabicText={verse.text_uthmani ?? ''}
              translationTexts={translationTexts}
              arabicFontSize={settings.arabicFontSize}
              arabicFontFace={settings.arabicFontFace}
              translationFontSize={settings.translationFontSize}
              showByWords={settings.showByWords}
              renderSignal={verseRenderSignal}
            />
          </View>
        ) : isLoading ? (
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
          <View className="mt-4 rounded-2xl bg-surface dark:bg-surface-dark border border-border/40 dark:border-border-dark/20 p-4">
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

            {tafsirError ? (
              <Text className="text-sm text-error dark:text-error-dark">{tafsirError}</Text>
            ) : isTafsirLoading ? (
              <View className="flex-row items-center gap-3">
                <ActivityIndicator color={palette.text} />
                <Text className="text-sm text-muted dark:text-muted-dark">Loading tafsir…</Text>
              </View>
            ) : (
              <TafsirHtml
                html={tafsirHtml}
                fontSize={settings.tafsirFontSize || 18}
                contentKey={`${verseKey}-${activeTafsirId ?? 'none'}`}
              />
            )}
          </View>
        ) : (
          <View className="mt-4 rounded-2xl bg-surface dark:bg-surface-dark border border-border/40 dark:border-border-dark/20 p-4">
            <Text className="text-sm text-muted dark:text-muted-dark">
              Please select a tafsir from the settings panel to view commentary.
            </Text>
          </View>
        )}
      </ScrollView>

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
