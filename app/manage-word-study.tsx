import { router, useFocusEffect } from 'expo-router';
import { ArrowLeft, BookMarked, Check, Download, ShieldCheck, Trash2, X } from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useDownloadIndexItems } from '@/hooks/useDownloadIndexItems';
import { useAppTheme } from '@/providers/ThemeContext';
import { container } from '@/src/core/infrastructure/di/container';
import type { ReadyWordGrammarPack, WordGrammarPackCatalogEntry } from '@/src/core/infrastructure/word-grammar';
import type { ReadyWordReferencePack, WordReferencePackCatalogEntry } from '@/src/core/infrastructure/word-reference';
import type { ReadyWordStudyPack, WordStudyPackCatalogEntry } from '@/src/core/infrastructure/word-study';

type LoadState = {
  loading: boolean;
  coreCatalog: readonly WordStudyPackCatalogEntry[];
  grammarCatalog: readonly WordGrammarPackCatalogEntry[];
  dictionaryCatalog: readonly WordReferencePackCatalogEntry[];
  coreInstalled: ReadyWordStudyPack | null;
  grammarInstalled: ReadyWordGrammarPack | null;
  dictionariesInstalled: readonly ReadyWordReferencePack[];
  catalogError: boolean;
};

const EMPTY_STATE: LoadState = {
  loading: true,
  coreCatalog: [],
  grammarCatalog: [],
  dictionaryCatalog: [],
  coreInstalled: null,
  grammarInstalled: null,
  dictionariesInstalled: [],
  catalogError: false,
};

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ManageWordStudyScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const [state, setState] = React.useState<LoadState>(EMPTY_STATE);
  const [nonce, setNonce] = React.useState(0);
  const { items, refresh } = useDownloadIndexItems({
    enabled: true,
    pollIntervalMs: 500,
    pollWhileEnabled: true,
  });

  const reload = React.useCallback(() => {
    setNonce((value) => value + 1);
    void refresh();
  }, [refresh]);

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      setState((current) => ({ ...current, loading: true }));
      void Promise.all([
        Promise.allSettled([
          container.getWordStudyPackCatalogClient().listCompatiblePacksAsync(),
          container.getWordGrammarPackCatalogClient().listCompatiblePacksAsync(),
          container.getWordReferencePackCatalogClient().listCompatiblePacksAsync(),
        ]),
        Promise.all([
          container.getWordStudyPackInstaller().getInstalledAsync().catch(() => null),
          container.getWordGrammarPackInstaller().getInstalledAsync().catch(() => null),
          container.getWordReferencePackInstaller().listInstalledAsync().catch(() => []),
        ]),
      ]).then(async ([catalogs, installed]) => {
        if (!active) return;
        const [coreCatalog, grammarCatalog, dictionaryCatalog] = catalogs;
        const [coreInstalled, grammarInstalled, dictionariesInstalled] = installed;
        if (coreInstalled) {
          await container.getDownloadIndexRepository().upsert(
            {
              kind: 'word-study-pack',
              packId: coreInstalled.packId,
              version: coreInstalled.version,
            },
            { status: 'installed', progress: { kind: 'percent', percent: 100 }, error: null }
          );
        }
        if (!active) return;
        setState({
          loading: false,
          coreCatalog: coreCatalog.status === 'fulfilled' ? coreCatalog.value : [],
          grammarCatalog: grammarCatalog.status === 'fulfilled' ? grammarCatalog.value : [],
          dictionaryCatalog: dictionaryCatalog.status === 'fulfilled' ? dictionaryCatalog.value : [],
          coreInstalled,
          grammarInstalled,
          dictionariesInstalled,
          catalogError: catalogs.some((catalog) => catalog.status === 'rejected'),
        });
        void refresh();
      });
      return () => {
        active = false;
      };
    }, [nonce, refresh])
  );

  const statusFor = React.useCallback(
    (kind: 'word-study-pack' | 'word-grammar-pack' | 'word-reference-pack', packId: string, version: string) =>
      items.find(
        (item) =>
          item.content.kind === kind &&
          item.content.packId === packId &&
          item.content.version === version
      ),
    [items]
  );

  const run = React.useCallback(
    (task: () => Promise<unknown>) => {
      void task()
        .then(reload)
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          if (!/cancel/i.test(message)) Alert.alert('Word Study download', message);
          reload();
        });
    },
    [reload]
  );

  const coreEntry = state.coreCatalog[0];
  const grammarEntry = state.grammarCatalog[0];

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <AppHeader
        title="Manage Word Study"
        left={
          <HeaderActionButton onPress={() => router.back()} accessibilityLabel="Go back">
            <ArrowLeft size={24} color={palette.text} />
          </HeaderActionButton>
        }
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.intro, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <ShieldCheck color={palette.tint} size={25} />
          <View style={styles.flex}>
            <Text style={[styles.introTitle, { color: palette.text }]}>Downloaded only when you choose</Text>
            <Text style={[styles.body, { color: palette.muted }]}>Nothing on this page is required for the reader. Once downloaded, each resource works locally without internet.</Text>
          </View>
        </View>

        {state.catalogError ? (
          <Text style={[styles.offlineNote, { color: palette.muted }]}>Some download choices could not be checked. Installed resources remain available offline.</Text>
        ) : null}

        <SectionTitle text="Essential analysis" color={palette.text} />
        <ResourceCard
          title="Word Study Essentials"
          description="Morphology, word meanings, roots, lemmas, verb forms, and word-family occurrence search. Required before Word Study can open."
          size={coreEntry?.databaseSizeBytes ?? state.coreInstalled?.manifest.databaseSizeBytes}
          installed={Boolean(state.coreInstalled)}
          unavailable={!state.loading && !coreEntry && !state.coreInstalled}
          unavailableText="Connect to the internet to check this download."
          item={coreEntry ? statusFor('word-study-pack', coreEntry.packId, coreEntry.version) : undefined}
          palette={palette}
          onInstall={coreEntry ? () => run(() => container.getWordStudyPackInstaller().installAsync(coreEntry)) : undefined}
          onCancel={coreEntry ? () => container.getWordStudyPackInstaller().cancel(coreEntry.packId, coreEntry.version) : undefined}
          onDelete={state.coreInstalled ? () => confirmDelete('Word Study Essentials', () => run(() => container.getWordStudyPackInstaller().deleteAsync(state.coreInstalled!.packId, state.coreInstalled!.version))) : undefined}
        />

        <SectionTitle text="Grammar" color={palette.text} />
        <ResourceCard
          title={grammarEntry?.title ?? 'Arabic Grammar (I‘rab)'}
          description="Source-provided grammatical analysis. Optional."
          size={grammarEntry?.databaseSizeBytes ?? state.grammarInstalled?.manifest.databaseSizeBytes}
          installed={Boolean(state.grammarInstalled)}
          unavailable={!state.loading && !grammarEntry && !state.grammarInstalled}
          unavailableText="Connect to the internet to check this download."
          item={grammarEntry ? statusFor('word-grammar-pack', grammarEntry.packId, grammarEntry.version) : undefined}
          palette={palette}
          onInstall={grammarEntry ? () => run(() => container.getWordGrammarPackInstaller().installAsync(grammarEntry)) : undefined}
          onCancel={grammarEntry ? () => container.getWordGrammarPackInstaller().cancel(grammarEntry.packId, grammarEntry.version) : undefined}
          onDelete={state.grammarInstalled ? () => confirmDelete('Arabic Grammar', () => run(async () => {
            await container.getGrammarStudyDatabaseProvider().closeAsync();
            await container.getWordGrammarPackInstaller().deleteAsync(state.grammarInstalled!.packId, state.grammarInstalled!.version, state.grammarInstalled!.manifest.source.sourceId);
          })) : undefined}
        />

        <SectionTitle text="Dictionaries" color={palette.text} />
        {state.dictionaryCatalog.map((entry) => {
          const installed = state.dictionariesInstalled.find((pack) => pack.packId === entry.packId);
          return (
            <ResourceCard
              key={`${entry.packId}:${entry.version}`}
              title={entry.title}
              description="Optional dictionary definitions matched locally by root and lemma."
              size={entry.databaseSizeBytes}
              installed={Boolean(installed)}
              item={statusFor('word-reference-pack', entry.packId, entry.version)}
              palette={palette}
              onInstall={() => run(() => container.getWordReferencePackInstaller().installAsync(entry))}
              onCancel={() => container.getWordReferencePackInstaller().cancel(entry.packId, entry.version)}
              onDelete={installed ? () => confirmDelete(entry.title, () => run(async () => {
                await container.getDictionaryReferenceRepository().closePack(entry.packId);
                await container.getWordReferencePackInstaller().deleteAsync(entry.packId, entry.version);
              })) : undefined}
            />
          );
        })}
        {!state.loading && state.dictionaryCatalog.length === 0 ? (
          <Text style={[styles.offlineNote, { color: palette.muted }]}>Connect to the internet to check dictionary downloads.</Text>
        ) : null}
        {state.loading ? <ActivityIndicator color={palette.tint} style={styles.loader} /> : null}
      </ScrollView>
    </View>
  );
}

function confirmDelete(title: string, onConfirm: () => void): void {
  Alert.alert(`Delete ${title}?`, 'This removes the offline files from this device. You can download them again later.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onConfirm },
  ]);
}

function SectionTitle({ text, color }: { text: string; color: string }): React.JSX.Element {
  return <Text style={[styles.sectionTitle, { color }]}>{text}</Text>;
}

function ResourceCard({
  title,
  description,
  size,
  installed,
  unavailable = false,
  unavailableText,
  item,
  palette,
  onInstall,
  onCancel,
  onDelete,
}: {
  title: string;
  description: string;
  size?: number;
  installed: boolean;
  unavailable?: boolean;
  unavailableText?: string;
  item?: { status: string; progress?: { kind: string; percent?: number }; error?: string };
  palette: (typeof Colors)['light'];
  onInstall?: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
}): React.JSX.Element {
  const active = item?.status === 'queued' || item?.status === 'downloading' || item?.status === 'deleting';
  const percent = item?.progress?.kind === 'percent' ? item.progress.percent : undefined;
  const action = active ? onCancel : installed ? onDelete : onInstall;
  return (
    <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <View style={[styles.icon, { backgroundColor: palette.interactive }]}>
        <BookMarked color={palette.tint} size={21} />
      </View>
      <View style={styles.flex}>
        <View style={styles.titleRow}>
          <Text style={[styles.cardTitle, { color: palette.text }]}>{title}</Text>
          {installed ? (
            <View style={[styles.badge, { backgroundColor: palette.interactive }]}>
              <Check color={palette.tint} size={12} />
              <Text style={[styles.badgeText, { color: palette.tint }]}>Installed</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.body, { color: palette.muted }]}>{description}</Text>
        <Text style={[styles.meta, { color: unavailable ? palette.muted : palette.tint }]}>
          {unavailable ? unavailableText : active ? (percent !== undefined ? `Downloading ${percent}%` : 'Downloading…') : size ? formatBytes(size) : 'Optional download'}
        </Text>
        {item?.status === 'failed' && item.error ? <Text style={[styles.error, { color: palette.error }]}>{item.error}</Text> : null}
      </View>
      {action && !unavailable ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={active ? `Cancel ${title} download` : installed ? `Delete ${title}` : `Download ${title}`}
          onPress={action}
          style={[styles.action, { backgroundColor: palette.interactive }]}
        >
          {active ? <X color={palette.tint} size={20} /> : installed ? <Trash2 color={palette.error} size={20} /> : <Download color={palette.tint} size={20} />}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 16, gap: 12 },
  intro: { borderWidth: 1, borderRadius: 18, padding: 16, flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  introTitle: { fontSize: 16, lineHeight: 22, fontWeight: '800', marginBottom: 4 },
  body: { fontSize: 13, lineHeight: 20 },
  flex: { flex: 1 },
  offlineNote: { fontSize: 12, lineHeight: 18, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 18, lineHeight: 24, fontWeight: '800', marginTop: 10, paddingHorizontal: 2 },
  card: { borderWidth: 1, borderRadius: 18, padding: 14, flexDirection: 'row', gap: 11, alignItems: 'flex-start' },
  icon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7, marginBottom: 3 },
  cardTitle: { flexShrink: 1, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  badge: { borderRadius: 20, paddingHorizontal: 7, paddingVertical: 3, flexDirection: 'row', gap: 3, alignItems: 'center' },
  badgeText: { fontSize: 10, fontWeight: '800' },
  meta: { fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: 6 },
  error: { fontSize: 11, lineHeight: 17, marginTop: 3 },
  action: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  loader: { marginVertical: 24 },
});
