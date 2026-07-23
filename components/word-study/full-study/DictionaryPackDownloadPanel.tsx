import { RefreshCw } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useDownloadIndexItems } from '@/hooks/useDownloadIndexItems';
import { container } from '@/src/core/infrastructure/di/container';
import type { WordReferencePackCatalogEntry } from '@/src/core/infrastructure/word-reference';

import { StudyPackDownloadCard } from './StudyPackDownloadCard';

type Palette = {
  surface: string;
  surfaceNavigation: string;
  text: string;
  muted: string;
  border: string;
  tint: string;
  interactive: string;
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
      {state.status === 'loading' ? (
        <View style={styles.loading}><ActivityIndicator color={palette.tint} /></View>
      ) : state.status === 'error' ? (
        <View style={[styles.card, { backgroundColor: palette.surfaceNavigation }]}>
          <Text style={[styles.status, styles.copy, { color: palette.muted }]}>Connect to the internet to check dictionary downloads.</Text>
          <Pressable accessibilityRole="button" onPress={() => setRetryNonce((value) => value + 1)} style={[styles.secondaryButton, { backgroundColor: palette.surfaceNavigation }]}>
            <RefreshCw color={palette.tint} size={17} />
            <Text style={[styles.secondaryLabel, { color: palette.tint }]}>Retry</Text>
          </Pressable>
        </View>
      ) : state.entries.map((entry) => {
        const item = items.find((candidate) => candidate.content.kind === 'word-reference-pack' && candidate.content.packId === entry.packId && candidate.content.version === entry.version);
        return (
          <StudyPackDownloadCard
            key={`${entry.packId}:${entry.version}`}
            title={entry.title}
            detail={`${formatBytes(entry.databaseSizeBytes)} · ${entry.languageCode.toUpperCase()}`}
            status={item?.status}
            progress={item?.progress}
            error={item?.error}
            palette={palette}
            downloadAccessibilityLabel={`Download ${entry.title}`}
            cancelAccessibilityLabel={`Cancel ${entry.title} download`}
            onCancel={() => installer.cancel(entry.packId, entry.version)}
            onDownload={() => {
              void installer
                .installAsync(entry)
                .then(() => void refresh())
                .catch(() => void refresh());
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12, paddingTop: 4 },
  loading: { minHeight: 92, alignItems: 'center', justifyContent: 'center' },
  card: { minHeight: 92, borderRadius: 18, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1 },
  status: { fontSize: 13, lineHeight: 20 },
  secondaryButton: { minHeight: 42, borderRadius: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  secondaryLabel: { fontSize: 13, fontWeight: '700' },
});
