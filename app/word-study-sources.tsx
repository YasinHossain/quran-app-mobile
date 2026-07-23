import { router, useFocusEffect } from 'expo-router';
import { ArrowLeft, BookOpenCheck, ExternalLink, Info, PackageCheck, RotateCw } from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/navigation/AppHeader';
import { HeaderActionButton } from '@/components/search/HeaderSearchBar';
import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';
import { container } from '@/src/core/infrastructure/di/container';
import type { ReadyWordGrammarPack } from '@/src/core/infrastructure/word-grammar';
import { VERB_REFERENCE_PACK_METADATA } from '@/src/core/infrastructure/verb-reference';
import type { ReadyWordReferencePack } from '@/src/core/infrastructure/word-reference';
import type { ReadyWordStudyPack, WordStudyPackSourceMetadata } from '@/src/core/infrastructure/word-study';

type SourcesLoadState =
  | { status: 'loading' }
  | {
      status: 'ready';
      corePack: ReadyWordStudyPack | null;
      grammarPack: ReadyWordGrammarPack | null;
      dictionaries: readonly ReadyWordReferencePack[];
    }
  | { status: 'error' };

const METHODOLOGY_BOUNDARIES = [
  'Morphology, segmentation, part-of-speech labels, lemma, and root records reproduce the installed source annotations. The app does not generate or correct those annotations.',
  'The offline word pack is authoritative for displayed Uthmani word forms and bundled English contextual glosses. The morphology source remains authoritative for structured analysis.',
  'Occurrence indexes group normalized surface forms, lemmas, or roots. A shared index key does not imply that every occurrence has the same contextual meaning.',
  'Arabic i‘rab is source-provided prose stored in a separate optional pack. Selected-word matching changes presentation order only and never rewrites the source text.',
  'Dictionaries are optional local downloads. Their definitions remain attributed to their individual source and are not merged into the morphology analysis.',
  'Verb principal parts remain disabled in public builds until the separate form-specific reference has redistribution permission and qualified review.',
] as const;

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isExternalUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function openExternalUrl(url: string): void {
  if (!isExternalUrl(url)) return;
  void Linking.openURL(url).catch(() => undefined);
}

export default function WordStudySourcesScreen(): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const insets = useSafeAreaInsets();
  const [retryNonce, setRetryNonce] = React.useState(0);
  const [loadState, setLoadState] = React.useState<SourcesLoadState>({ status: 'loading' });

  useFocusEffect(
    React.useCallback(() => {
      let cancelled = false;
      setLoadState({ status: 'loading' });
      void Promise.all([
        container.getWordStudyPackInstaller().getInstalledAsync(),
        container.getWordGrammarPackInstaller().getInstalledAsync(),
        container.getWordReferencePackInstaller().listInstalledAsync(),
      ])
        .then(([corePack, grammarPack, dictionaries]) => {
          if (!cancelled) setLoadState({ status: 'ready', corePack, grammarPack, dictionaries });
        })
        .catch(() => {
          if (!cancelled) setLoadState({ status: 'error' });
        });
      return () => {
        cancelled = true;
      };
    }, [retryNonce])
  );

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <AppHeader
        title="Word Study Sources"
        left={
          <HeaderActionButton onPress={() => router.back()} accessibilityLabel="Go back">
            <ArrowLeft size={24} color={palette.text} />
          </HeaderActionButton>
        }
      />

      {loadState.status === 'loading' ? (
        <View style={styles.centeredState} accessibilityLiveRegion="polite">
          <ActivityIndicator color={palette.tint} size="large" />
          <Text style={[styles.stateTitle, { color: palette.text }]}>Reading installed source records</Text>
        </View>
      ) : loadState.status === 'error' ? (
        <View style={styles.centeredState} accessibilityLiveRegion="polite">
          <Text style={[styles.stateTitle, { color: palette.text }]}>Source details are unavailable</Text>
          <Text style={[styles.stateMessage, { color: palette.muted }]}>The installed Word Study pack could not be read.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setRetryNonce((value) => value + 1)}
            style={styles.retryButton}
          >
            <RotateCw color={palette.tint} size={17} strokeWidth={2.2} />
            <Text style={[styles.retryText, { color: palette.tint }]}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        >
          <View style={styles.hero}>
            <View style={[styles.heroIcon, { backgroundColor: palette.interactive }]}>
              <BookOpenCheck color={palette.tint} size={27} strokeWidth={2.1} />
            </View>
            <Text style={[styles.heroTitle, { color: palette.text }]}>Provenance and analytical scope</Text>
            <Text style={[styles.heroCopy, { color: palette.muted }]}>Titles, versions, rights, and checksums below come from the installed pack manifests. Word Study works from these local packs after installation.</Text>
          </View>

          <SectionTitle title="Core analysis pack" palette={palette} />
          {loadState.corePack ? (
            <>
              <PackCard
                title={loadState.corePack.packId}
                version={loadState.corePack.version}
                rows={[
                  ['Format', loadState.corePack.manifest.format],
                  ['Schema', String(loadState.corePack.manifest.schemaVersion)],
                  ['Compiler', loadState.corePack.manifest.compilerVersion],
                  ['Database size', formatBytes(loadState.corePack.manifest.databaseSizeBytes)],
                  ['Database SHA-256', loadState.corePack.manifest.databaseChecksumSha256],
                ]}
                palette={palette}
              />
              <View style={styles.cardList}>
                {loadState.corePack.manifest.sources.map((source) => (
                  <ManifestSourceCard key={source.sourceId} source={source} palette={palette} />
                ))}
              </View>
            </>
          ) : (
            <View style={[styles.notice, { borderColor: palette.border, backgroundColor: palette.surface }]}>
              <PackageCheck color={palette.tint} size={20} strokeWidth={2.2} />
              <Text style={[styles.noticeText, { color: palette.muted }]}>Word Study Essentials is not downloaded. Install it from Manage Word Study to see its source and checksum details.</Text>
            </View>
          )}

          <SectionTitle title="Arabic grammar pack" palette={palette} />
          {loadState.grammarPack ? (
            <PackCard
              title={loadState.grammarPack.manifest.source.title}
              version={loadState.grammarPack.manifest.source.version}
              rows={[
                ['Pack', loadState.grammarPack.packId],
                ['Schema', String(loadState.grammarPack.manifest.schemaVersion)],
                ['Compiler', loadState.grammarPack.manifest.compilerVersion],
                ['Coverage', `${loadState.grammarPack.manifest.verseCount.toLocaleString()} ayahs · ${loadState.grammarPack.manifest.passageCount.toLocaleString()} passages`],
                ['Database size', formatBytes(loadState.grammarPack.manifest.databaseSizeBytes)],
                ['Source SHA-256', loadState.grammarPack.manifest.source.checksumSha256],
              ]}
              externalUrl={loadState.grammarPack.manifest.source.url}
              palette={palette}
            />
          ) : (
            <View style={[styles.notice, { borderColor: palette.border, backgroundColor: palette.surface }]}>
              <PackageCheck color={palette.tint} size={20} strokeWidth={2.2} />
              <Text style={[styles.noticeText, { color: palette.muted }]}>Arabic grammar is not installed. It can be downloaded directly from the Grammar tab.</Text>
            </View>
          )}

          <SectionTitle title="Optional dictionary packs" palette={palette} />
          {loadState.dictionaries.length ? (
            <View style={styles.cardList}>
              {loadState.dictionaries.map((dictionary) => (
                <PackCard
                  key={dictionary.packId}
                  title={dictionary.manifest.source.title}
                  version={dictionary.manifest.source.version}
                  rows={[
                    ['Pack', dictionary.packId],
                    ['Language', dictionary.manifest.source.languageCode],
                    ['Attribution', dictionary.manifest.source.attribution],
                    ['Source SHA-256', dictionary.manifest.source.checksumSha256],
                  ]}
                  externalUrl={dictionary.manifest.source.url}
                  palette={palette}
                />
              ))}
            </View>
          ) : (
            <View style={[styles.notice, { borderColor: palette.border, backgroundColor: palette.surface }]}>
              <PackageCheck color={palette.tint} size={20} strokeWidth={2.2} />
              <Text style={[styles.noticeText, { color: palette.muted }]}>No optional dictionaries are installed. When installed, their manifest attribution appears here and beside their definitions.</Text>
            </View>
          )}

          <SectionTitle title="Verb reference pack" palette={palette} />
          <View style={[styles.notice, { borderColor: palette.border, backgroundColor: palette.surface }]}>
            <PackageCheck color={palette.tint} size={20} strokeWidth={2.2} />
            <Text style={[styles.noticeText, { color: palette.muted }]}>Not distributed. {VERB_REFERENCE_PACK_METADATA.manifest.source.title} remains disabled while its license is “{VERB_REFERENCE_PACK_METADATA.manifest.source.license}” and qualified review is pending.</Text>
          </View>

          <SectionTitle title="Methodology boundaries" palette={palette} />
          <View style={[styles.boundariesCard, { borderColor: palette.border, backgroundColor: palette.surface }]}>
            <View style={styles.boundariesHeading}>
              <Info color={palette.tint} size={20} strokeWidth={2.2} />
              <Text style={[styles.boundariesTitle, { color: palette.text }]}>How to read this analysis</Text>
            </View>
            {METHODOLOGY_BOUNDARIES.map((boundary, index) => (
              <View key={boundary} style={styles.boundaryRow}>
                <Text style={[styles.boundaryIndex, { color: palette.tint }]}>{index + 1}</Text>
                <Text style={[styles.boundaryText, { color: palette.muted }]}>{boundary}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function SectionTitle({ title, palette }: { title: string; palette: (typeof Colors)['light'] }): React.JSX.Element {
  return <Text style={[styles.sectionTitle, { color: palette.text }]}>{title}</Text>;
}

function ManifestSourceCard({
  source,
  palette,
}: {
  source: WordStudyPackSourceMetadata;
  palette: (typeof Colors)['light'];
}): React.JSX.Element {
  return (
    <PackCard
      title={source.title}
      version={source.version}
      rows={[
        ['Source ID', source.sourceId],
        ['License', source.license],
        ['Attribution', source.attribution],
        ['Source SHA-256', source.checksumSha256],
      ]}
      externalUrl={isExternalUrl(source.url) ? source.url : undefined}
      palette={palette}
    />
  );
}

function PackCard({
  title,
  version,
  rows,
  externalUrl,
  palette,
}: {
  title: string;
  version: string;
  rows: readonly (readonly [string, string])[];
  externalUrl?: string;
  palette: (typeof Colors)['light'];
}): React.JSX.Element {
  return (
    <View style={[styles.card, { borderColor: palette.border, backgroundColor: palette.surface }]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderCopy}>
          <Text style={[styles.cardTitle, { color: palette.text }]}>{title}</Text>
          <Text style={[styles.version, { color: palette.tint }]}>Version {version}</Text>
        </View>
        {externalUrl ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Open source website for ${title}`}
            hitSlop={10}
            onPress={() => openExternalUrl(externalUrl)}
            style={styles.linkButton}
          >
            <ExternalLink color={palette.tint} size={18} strokeWidth={2.2} />
          </Pressable>
        ) : null}
      </View>
      <View style={[styles.metadata, { borderTopColor: palette.border }]}>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.metadataRow}>
            <Text style={[styles.metadataLabel, { color: palette.muted }]}>{label}</Text>
            <Text
              selectable={label.includes('SHA-256')}
              style={[
                styles.metadataValue,
                label.includes('SHA-256') ? styles.checksum : null,
                { color: palette.text },
              ]}
            >
              {value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centeredState: { flex: 1, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center', gap: 11 },
  stateTitle: { fontSize: 18, lineHeight: 25, fontWeight: '700', textAlign: 'center' },
  stateMessage: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
  retryButton: { minHeight: 44, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  retryText: { fontSize: 14, fontWeight: '700' },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 24, gap: 14 },
  hero: { paddingBottom: 8, gap: 7 },
  heroIcon: { width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
  heroTitle: { fontSize: 25, lineHeight: 33, fontWeight: '800' },
  heroCopy: { fontSize: 14, lineHeight: 22 },
  sectionTitle: { marginTop: 10, paddingHorizontal: 2, fontSize: 19, lineHeight: 26, fontWeight: '700' },
  cardList: { gap: 11 },
  card: { borderWidth: 1, borderRadius: 18, padding: 15, gap: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardHeaderCopy: { flex: 1, gap: 3 },
  cardTitle: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  version: { fontSize: 12, lineHeight: 18, fontWeight: '700' },
  linkButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  metadata: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 9 },
  metadataRow: { gap: 2 },
  metadataLabel: { fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 0.2 },
  metadataValue: { fontSize: 12, lineHeight: 18 },
  checksum: { fontFamily: 'monospace', fontSize: 10, lineHeight: 16 },
  notice: { borderWidth: 1, borderRadius: 17, padding: 15, flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 20 },
  boundariesCard: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 13 },
  boundariesHeading: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  boundariesTitle: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  boundaryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  boundaryIndex: { width: 20, fontSize: 12, lineHeight: 20, fontWeight: '800', textAlign: 'center' },
  boundaryText: { flex: 1, fontSize: 13, lineHeight: 20 },
});
