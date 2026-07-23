import { RefreshCw } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useDownloadIndexItems } from '@/hooks/useDownloadIndexItems';
import { container } from '@/src/core/infrastructure/di/container';
import type { WordGrammarPackCatalogEntry } from '@/src/core/infrastructure/word-grammar';

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

type CatalogState =
  | { status: 'loading' }
  | { status: 'ready'; entry: WordGrammarPackCatalogEntry | null }
  | { status: 'error'; message: string };

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function GrammarPackDownloadPanel({
  palette,
  onInstalled,
}: {
  palette: Palette;
  onInstalled: () => void;
}): React.JSX.Element {
  const installer = container.getWordGrammarPackInstaller();
  const { items, refresh } = useDownloadIndexItems({
    enabled: true,
    pollIntervalMs: 600,
    pollWhileEnabled: true,
  });
  const [catalog, setCatalog] = React.useState<CatalogState>({ status: 'loading' });
  const [retryNonce, setRetryNonce] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();
    setCatalog({ status: 'loading' });
    void container
      .getWordGrammarPackCatalogClient()
      .listCompatiblePacksAsync(controller.signal)
      .then((entries) => setCatalog({ status: 'ready', entry: entries[0] ?? null }))
      .catch((error) => {
        if (!controller.signal.aborted) {
          setCatalog({
            status: 'error',
            message: error instanceof Error ? error.message : 'Grammar download is unavailable.',
          });
        }
      });
    return () => controller.abort();
  }, [retryNonce]);

  const entry = catalog.status === 'ready' ? catalog.entry : null;
  const item = entry
    ? items.find(
        (candidate) =>
          candidate.content.kind === 'word-grammar-pack' &&
          candidate.content.packId === entry.packId &&
          candidate.content.version === entry.version
      )
    : undefined;
  return (
    <View style={styles.section}>
      {catalog.status === 'loading' ? (
        <View style={styles.statusRow} accessibilityLiveRegion="polite">
          <ActivityIndicator color={palette.tint} size="small" />
          <Text style={[styles.statusText, { color: palette.muted }]}>Checking availability…</Text>
        </View>
      ) : catalog.status === 'error' ? (
        <View style={[styles.card, { backgroundColor: palette.surfaceNavigation }]}>
          <View style={styles.cardCopy}>
            <Text style={[styles.statusText, { color: palette.muted }]}>{catalog.message}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry grammar catalog"
            onPress={() => setRetryNonce((value) => value + 1)}
            style={[styles.secondaryButton, { backgroundColor: palette.surfaceNavigation }]}
          >
            <RefreshCw color={palette.tint} size={17} />
            <Text style={[styles.secondaryLabel, { color: palette.tint }]}>Retry</Text>
          </Pressable>
        </View>
      ) : !entry ? (
        <View style={[styles.card, { backgroundColor: palette.surfaceNavigation }]}>
          <View style={styles.cardCopy}>
            <Text style={[styles.cardTitle, { color: palette.text }]}>Not available for download yet</Text>
            <Text style={[styles.statusText, { color: palette.muted }]}>No compatible grammar pack is currently published.</Text>
          </View>
        </View>
      ) : (
        <StudyPackDownloadCard
          title={entry.title}
          detail={formatBytes(entry.databaseSizeBytes)}
          status={item?.status}
          progress={item?.progress}
          error={item?.error}
          palette={palette}
          downloadAccessibilityLabel="Download Arabic grammar"
          cancelAccessibilityLabel="Cancel Arabic grammar download"
          onCancel={() => installer.cancel(entry.packId, entry.version)}
          onDownload={() => {
            void container
              .getGrammarStudyDatabaseProvider()
              .closeAsync()
              .then(() => installer.installAsync(entry))
              .then(() => {
                void refresh();
                onInstalled();
              })
              .catch(() => {
                void refresh();
              });
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12, paddingTop: 4 },
  statusRow: { minHeight: 92, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  statusText: { fontSize: 13, lineHeight: 20 },
  card: { minHeight: 92, borderRadius: 18, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardCopy: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 15, lineHeight: 21, fontWeight: '700' },
  secondaryButton: { minHeight: 42, borderRadius: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  secondaryLabel: { fontSize: 13, fontWeight: '700' },
});
