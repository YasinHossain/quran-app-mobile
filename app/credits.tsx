import { router } from 'expo-router';
import {
  ArrowLeft,
  AudioLines,
  BookA,
  BookOpenText,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  HandHeart,
  Languages,
  Library,
  RotateCw,
  ScrollText,
  Type,
} from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/navigation/AppHeader';
import { HeaderActionButton } from '@/components/search/HeaderSearchBar';
import Colors from '@/constants/Colors';
import { useReciters } from '@/hooks/audio/useReciters';
import { useTafsirResources } from '@/hooks/useTafsirResources';
import { useTranslationResources } from '@/hooks/useTranslationResources';
import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';
import { container } from '@/src/core/infrastructure/di/container';
import {
  ARABIC_FONT_CREDITS,
  CONTENT_PROVIDER_CREDITS,
  WORD_BY_WORD_CREDITS,
  WORD_STUDY_CREDITS,
  type CreditEntry,
} from '../src/data/credits';

type Palette = (typeof Colors)['light'];

type NamedCredit = { key: string; title: string; subtitle?: string };
type CreditGroup = { language: string; items: NamedCredit[] };

function openExternalUrl(url: string): void {
  if (!/^https?:\/\//i.test(url)) return;
  Linking.openURL(url).catch(() => {});
}

function formatLanguageName(value: string): string {
  return value
    .split(/([\s,-]+)/)
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join('');
}

function groupByLanguage(
  items: readonly { language: string; credit: NamedCredit }[]
): CreditGroup[] {
  const groups = new Map<string, NamedCredit[]>();
  for (const { language, credit } of items) {
    const key = formatLanguageName(language.trim() || 'Other');
    const list = groups.get(key);
    if (list) list.push(credit);
    else groups.set(key, [credit]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map(([language, groupItems]) => ({
      language,
      items: groupItems.sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
      ),
    }));
}

export default function CreditsScreen(): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const insets = useSafeAreaInsets();
  const { t } = useUiTranslation();

  const [isRecitersOpen, setIsRecitersOpen] = React.useState(false);
  const { translations } = useTranslationResources();
  const { tafsirs } = useTafsirResources();
  const {
    reciters,
    isLoading: isRecitersLoading,
    error: recitersError,
    refresh: refreshReciters,
  } = useReciters({ enabled: isRecitersOpen });
  const [verbPackCredit, setVerbPackCredit] = React.useState<CreditEntry | null>(null);

  // The optional verb pack is credited from its own manifest while it is installed.
  React.useEffect(() => {
    let active = true;
    void container
      .getVerbReferencePackInstaller()
      .getInstalledAsync()
      .then((pack) => {
        if (!active || !pack) return;
        const { source } = pack.manifest;
        setVerbPackCredit({
          id: `verb-reference:${source.sourceId}`,
          title: source.title,
          credit: source.attribution,
          usage: 'Optional verb principal-parts pack.',
          license: source.license,
          url: source.url,
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  const wordStudyCredits = React.useMemo(
    () => (verbPackCredit ? [...WORD_STUDY_CREDITS, verbPackCredit] : WORD_STUDY_CREDITS),
    [verbPackCredit]
  );

  const translationGroups = React.useMemo(
    () =>
      groupByLanguage(
        translations.map((translation) => ({
          language: translation.languageName,
          credit: {
            key: String(translation.id),
            title: translation.name,
            subtitle:
              translation.authorName && translation.authorName !== translation.name
                ? translation.authorName
                : undefined,
          },
        }))
      ),
    [translations]
  );

  const tafsirGroups = React.useMemo(
    () =>
      groupByLanguage(
        tafsirs.map((tafsir) => ({
          language: tafsir.language,
          credit: {
            key: String(tafsir.id),
            title: tafsir.name,
            subtitle: tafsir.authorName && tafsir.authorName !== tafsir.name ? tafsir.authorName : undefined,
          },
        }))
      ),
    [tafsirs]
  );

  const reciterItems = React.useMemo<NamedCredit[]>(
    () =>
      reciters.map((reciter) => ({
        key: String(reciter.id),
        title: reciter.name,
        subtitle: reciter.locale,
      })),
    [reciters]
  );

  return (
    <View className="flex-1 bg-background dark:bg-background-dark">
      <AppHeader
        title={t('credits_and_sources', { fallback: 'Credits & Sources' })}
        left={
          <HeaderActionButton onPress={() => router.back()} accessibilityLabel={t('go_back', { fallback: 'Go back' })}>
            <ArrowLeft size={24} color={palette.text} />
          </HeaderActionButton>
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      >
        <View className="w-full max-w-[720px] self-center gap-3 px-4 pt-6">
          <View className="gap-2 pb-2">
            <View className="mb-1 h-12 w-12 items-center justify-center rounded-2xl bg-interactive dark:bg-interactive-dark">
              <HandHeart color={palette.tint} size={26} strokeWidth={2} />
            </View>
            <Text className="text-2xl font-bold text-foreground dark:text-foreground-dark">
              With gratitude
            </Text>
            <Text className="text-sm leading-6 text-muted dark:text-muted-dark">
              This app is built on the work of scholars, translators, reciters, typographers, and open data
              projects. Each resource remains the work of its authors and is shown here with its source.
            </Text>
          </View>

          <SectionHeading icon={<Library color={palette.tint} size={18} strokeWidth={2.2} />} title="Quran text & content" />
          <CreditCardList entries={CONTENT_PROVIDER_CREDITS} palette={palette} />

          <SectionHeading icon={<Languages color={palette.tint} size={18} strokeWidth={2.2} />} title="Translations" />
          <GroupedCreditCard
            summary={`${translations.length} translations, each by the translator named below, delivered through Quran.com.`}
            expandLabel="Translators"
            groups={translationGroups}
            palette={palette}
          />

          <SectionHeading icon={<ScrollText color={palette.tint} size={18} strokeWidth={2.2} />} title="Tafsir" />
          <GroupedCreditCard
            summary={`${tafsirs.length} tafsir works, each by the scholar named below, delivered through Quran.com.`}
            expandLabel="Tafsir works"
            groups={tafsirGroups}
            palette={palette}
          />

          <SectionHeading icon={<BookOpenText color={palette.tint} size={18} strokeWidth={2.2} />} title="Word by word" />
          <CreditCardList entries={WORD_BY_WORD_CREDITS} palette={palette} />

          <SectionHeading icon={<BookA color={palette.tint} size={18} strokeWidth={2.2} />} title="Word Study, grammar & lexicons" />
          <CreditCardList entries={wordStudyCredits} palette={palette} />
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Opens installed pack versions, checksums, and methodology"
            onPress={() => router.push('/word-study-sources')}
            className="min-h-[52px] flex-row items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 dark:border-border-dark dark:bg-surface-dark"
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          >
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">
                Pack versions & methodology
              </Text>
              <Text className="mt-0.5 text-xs text-muted dark:text-muted-dark">
                Installed manifests, rights, and analytical scope
              </Text>
            </View>
            <ChevronRight color={palette.muted} size={18} strokeWidth={2.2} />
          </Pressable>

          <SectionHeading icon={<AudioLines color={palette.tint} size={18} strokeWidth={2.2} />} title="Recitations" />
          <View className="rounded-2xl border border-border bg-surface dark:border-border-dark dark:bg-surface-dark">
            <View className="px-4 pb-3 pt-4">
              <Text className="text-sm leading-6 text-foreground dark:text-foreground-dark">
                Recitation audio is streamed and downloaded from the Quran.com audio CDN. Each recitation belongs to its
                reciter.
              </Text>
            </View>
            <DisclosureRow
              label="Reciters"
              isOpen={isRecitersOpen}
              onToggle={() => setIsRecitersOpen((open) => !open)}
              palette={palette}
            />
            {isRecitersOpen ? (
              isRecitersLoading ? (
                <View className="flex-row items-center gap-3 px-4 pb-4" accessibilityLiveRegion="polite">
                  <ActivityIndicator color={palette.tint} />
                  <Text className="text-sm text-muted dark:text-muted-dark">Loading reciters…</Text>
                </View>
              ) : recitersError && reciterItems.length === 0 ? (
                <View className="gap-2 px-4 pb-4" accessibilityLiveRegion="polite">
                  <Text className="text-sm text-muted dark:text-muted-dark">
                    The reciter list needs an internet connection.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={refreshReciters}
                    hitSlop={8}
                    className="min-h-[44px] flex-row items-center gap-2 self-start"
                  >
                    <RotateCw color={palette.tint} size={16} strokeWidth={2.2} />
                    <Text className="text-sm font-semibold text-accent dark:text-accent-dark">Retry</Text>
                  </Pressable>
                </View>
              ) : (
                <View className="px-4 pb-2">
                  {reciterItems.map((item) => (
                    <NamedCreditRow key={item.key} item={item} />
                  ))}
                </View>
              )
            ) : null}
          </View>

          <SectionHeading icon={<Type color={palette.tint} size={18} strokeWidth={2.2} />} title="Arabic fonts" />
          <CreditCardList entries={ARABIC_FONT_CREDITS} palette={palette} />

          <Text className="px-1 pt-3 text-xs leading-5 text-muted dark:text-muted-dark">
            Spotted a missing or incorrect attribution? Please let us know through appquran.com so it can be corrected.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function SectionHeading({ icon, title }: { icon: React.ReactNode; title: string }): React.JSX.Element {
  return (
    <View className="mt-4 flex-row items-center gap-2 px-1" accessibilityRole="header">
      {icon}
      <Text className="text-lg font-bold text-foreground dark:text-foreground-dark">{title}</Text>
    </View>
  );
}

function CreditCardList({
  entries,
  palette,
}: {
  entries: readonly CreditEntry[];
  palette: Palette;
}): React.JSX.Element {
  return (
    <View className="rounded-2xl border border-border bg-surface dark:border-border-dark dark:bg-surface-dark">
      {entries.map((entry, index) => (
        <View
          key={entry.id}
          className={`flex-row items-start gap-2 py-3.5 pl-4 pr-2 ${
            index > 0 ? 'border-t border-border dark:border-border-dark' : ''
          }`}
        >
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-base font-semibold text-foreground dark:text-foreground-dark">{entry.title}</Text>
            <Text className="text-sm leading-5 text-foreground dark:text-foreground-dark">{entry.credit}</Text>
            {entry.usage ? (
              <Text className="text-xs leading-5 text-muted dark:text-muted-dark">{entry.usage}</Text>
            ) : null}
            {entry.license ? (
              <Text className="text-xs font-semibold leading-5 text-accent dark:text-accent-dark">{entry.license}</Text>
            ) : null}
          </View>
          {entry.url ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Open website for ${entry.title}`}
              onPress={() => openExternalUrl(entry.url!)}
              className="h-11 w-11 items-center justify-center"
            >
              <ExternalLink color={palette.tint} size={17} strokeWidth={2.2} />
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function GroupedCreditCard({
  summary,
  expandLabel,
  groups,
  palette,
}: {
  summary: string;
  expandLabel: string;
  groups: CreditGroup[];
  palette: Palette;
}): React.JSX.Element {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <View className="rounded-2xl border border-border bg-surface dark:border-border-dark dark:bg-surface-dark">
      <View className="px-4 pb-3 pt-4">
        <Text className="text-sm leading-6 text-foreground dark:text-foreground-dark">{summary}</Text>
      </View>
      <DisclosureRow label={expandLabel} isOpen={isOpen} onToggle={() => setIsOpen((open) => !open)} palette={palette} />
      {isOpen ? (
        <View className="px-4 pb-2">
          {groups.map((group) => (
            <View key={group.language} className="pb-2">
              <Text className="pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-accent dark:text-accent-dark">
                {group.language}
              </Text>
              {group.items.map((item) => (
                <NamedCreditRow key={item.key} item={item} />
              ))}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function DisclosureRow({
  label,
  isOpen,
  onToggle,
  palette,
}: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  palette: Palette;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: isOpen }}
      onPress={onToggle}
      className="min-h-[48px] flex-row items-center justify-between border-t border-border px-4 dark:border-border-dark"
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Text className="text-sm font-semibold text-accent dark:text-accent-dark">
        {isOpen ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
      </Text>
      <View style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}>
        <ChevronDown color={palette.tint} size={18} strokeWidth={2.25} />
      </View>
    </Pressable>
  );
}

function NamedCreditRow({ item }: { item: NamedCredit }): React.JSX.Element {
  return (
    <View className="py-1.5">
      <Text className="text-sm font-medium text-foreground dark:text-foreground-dark">{item.title}</Text>
      {item.subtitle ? (
        <Text className="text-xs leading-5 text-muted dark:text-muted-dark">{item.subtitle}</Text>
      ) : null}
    </View>
  );
}
