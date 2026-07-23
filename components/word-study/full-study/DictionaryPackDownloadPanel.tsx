import { Check, Download, RefreshCw, X } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useDownloadIndexItems } from '@/hooks/useDownloadIndexItems';
import { container } from '@/src/core/infrastructure/di/container';
import type { WordReferencePackCatalogEntry } from '@/src/core/infrastructure/word-reference';

type Palette = {
  surface: string;
  surfaceNavigation: string;
  text: string;
  muted: string;
  border: string;
  tint: string;
  onAccent: string;
  error: string;
};

type State =
  | { status: 'loading' }
  | { status: 'ready'; entries: readonly WordReferencePackCatalogEntry[] }
  | { status: 'error' };

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DictionaryPackDownloadPanel({ palette }: { palette: Palette }): React.JSX.Element {
  const installer = container.getWordReferencePackInstaller();
  const { items, refresh } = useDownloadIndexItems({ enabled: true, pollIntervalMs: 500, pollWhileEnabled: true });
  const [state, setState] = React.useState<State>({ status: 'loading' });
  const [retryNonce, setRetryNonce] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    void container
      .getWordReferencePackCatalogClient()
      .listCompatiblePacksAsync(controller.signal)
      .then((entries) => setState({ status: 'ready', entries }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' });
      });
    return () => controller.abort();
  }, [retryNonce]);

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: palette.text }]}>Offline dictionaries</Text>
      <Text style={[styles.message, { color: palette.muted }]}>Download only the references you want. Definitions are stored locally and become usable after Essentials is installed.</Text>
      {state.status === 'loading' ? (
        <View style={styles.loading}><ActivityIndicator color={palette.tint} /></View>
      ) : state.status === 'error' ? (
        <View style={[styles.card, { borderColor: palette.border, backgroundColor: palette.surface }]}>
          <Text style={[styles.status, styles.copy, { color: palette.muted }]}>Connect to the internet to check dictionary downloads.</Text>
          <Pressable accessibilityRole="button" onPress={() => setRetryNonce((value) => value + 1)} style={[styles.secondaryButton, { backgroundColor: palette.surfaceNavigation }]}>
            <RefreshCw color={palette.tint} size={17} />
            <Text style={[styles.secondaryLabel, { color: palette.tint }]}>Retry</Text>
          </Pressable>
        </View>
      ) : state.entries.map((entry) => {
        const item = items.find((candidate) => candidate.content.kind === 'word-reference-pack' && candidate.content.packId === entry.packId && candidate.content.version === entry.version);
        const active = item?.status === 'queued' || item?.status === 'downloading';
        const installed = item?.status === 'installed';
        const percent = item?.progress?.kind === 'percent' ? item.progress.percent : 0;
        return (
          <View key={`${entry.packId}:${entry.version}`} style={[styles.card, { borderColor: palette.border, backgroundColor: palette.surface }]}>
            <View style={styles.copy}>
              <Text style={[styles.cardTitle, { color: palette.text }]}>{entry.title}</Text>
              <Text style={[styles.status, { color: palette.muted }]}>{formatBytes(entry.databaseSizeBytes)} · {entry.languageCode.toUpperCase()}</Text>
              {active ? <Text style={[styles.progress, { color: palette.tint }]}>{percent}% downloaded</Text> : null}
              {installed ? <Text style={[styles.progress, { color: palette.tint }]}>Downloaded · available offline</Text> : null}
              {item?.status === 'failed' ? <Text style={[styles.progress, { color: palette.error }]}>{item.error ?? 'Download failed'}</Text> : null}
            </View>
            {installed ? (
              <View style={[styles.installedIcon, { backgroundColor: palette.surfaceNavigation }]}><Check color={palette.tint} size={20} /></View>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={active ? `Cancel ${entry.title} download` : `Download ${entry.title}`}
                onPress={() => {
                  if (active) installer.cancel(entry.packId, entry.version);
                  else void installer.installAsync(entry).then(() => void refresh()).catch(() => void refresh());
                }}
                style={[styles.actionButton, { backgroundColor: palette.tint }]}
              >
                {active ? <X color={palette.onAccent} size={20} /> : <Download color={palette.onAccent} size={20} />}
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12, paddingTop: 4 },
  title: { fontSize: 19, lineHeight: 26, fontWeight: '700' },
  message: { fontSize: 14, lineHeight: 22 },
  loading: { minHeight: 92, alignItems: 'center', justifyContent: 'center' },
  card: { minHeight: 92, borderWidth: 1, borderRadius: 18, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1 },
  cardTitle: { fontSize: 15, lineHeight: 21, fontWeight: '700', marginBottom: 3 },
  status: { fontSize: 13, lineHeight: 20 },
  progress: { fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: 3 },
  actionButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  installedIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  secondaryButton: { minHeight: 42, borderRadius: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  secondaryLabel: { fontSize: 13, fontWeight: '700' },
});
