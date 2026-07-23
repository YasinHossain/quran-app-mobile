import { Check, Download, RefreshCw, X } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useDownloadIndexItems } from '@/hooks/useDownloadIndexItems';
import { container } from '@/src/core/infrastructure/di/container';
import type { WordGrammarPackCatalogEntry } from '@/src/core/infrastructure/word-grammar';

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
  const active = item?.status === 'queued' || item?.status === 'downloading';
  const installed = item?.status === 'installed';
  const percent = item?.progress?.kind === 'percent' ? item.progress.percent : 0;

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: palette.text }]}>Arabic Grammar (I‘rab)</Text>
      <Text style={[styles.message, { color: palette.muted }]}>This specialist reference is optional and is stored locally only after you choose to download it.</Text>

      {catalog.status === 'loading' ? (
        <View style={styles.statusRow} accessibilityLiveRegion="polite">
          <ActivityIndicator color={palette.tint} size="small" />
          <Text style={[styles.statusText, { color: palette.muted }]}>Checking availability…</Text>
        </View>
      ) : catalog.status === 'error' ? (
        <View style={[styles.card, { borderColor: palette.border, backgroundColor: palette.surface }]}>
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
        <View style={[styles.card, { borderColor: palette.border, backgroundColor: palette.surface }]}>
          <View style={styles.cardCopy}>
            <Text style={[styles.cardTitle, { color: palette.text }]}>Not available for download yet</Text>
            <Text style={[styles.statusText, { color: palette.muted }]}>No compatible grammar pack is currently published.</Text>
          </View>
        </View>
      ) : (
        <View style={[styles.card, { borderColor: palette.border, backgroundColor: palette.surface }]}>
          <View style={styles.cardCopy}>
            <Text style={[styles.cardTitle, { color: palette.text }]}>{entry.title}</Text>
            <Text style={[styles.statusText, { color: palette.muted }]}>{formatBytes(entry.databaseSizeBytes)} · Version {entry.version}</Text>
            {active ? (
              <Text style={[styles.progress, { color: palette.tint }]}>{percent}% downloaded</Text>
            ) : installed ? (
              <Text style={[styles.progress, { color: palette.tint }]}>Downloaded · available offline</Text>
            ) : item?.status === 'failed' ? (
              <Text style={[styles.progress, { color: palette.error }]}>{item.error ?? 'Download failed'}</Text>
            ) : null}
          </View>
          {installed ? (
            <View style={[styles.actionButton, { backgroundColor: palette.surfaceNavigation }]}>
              <Check color={palette.tint} size={20} />
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={active ? 'Cancel Arabic grammar download' : 'Download Arabic grammar'}
              onPress={() => {
                if (active) {
                  installer.cancel(entry.packId, entry.version);
                } else {
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
                }
              }}
              style={[styles.actionButton, { backgroundColor: palette.tint }]}
            >
              {active ? <X color={palette.onAccent} size={20} /> : <Download color={palette.onAccent} size={20} />}
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12, paddingTop: 4 },
  title: { fontSize: 19, lineHeight: 26, fontWeight: '700' },
  message: { fontSize: 14, lineHeight: 22 },
  statusRow: { minHeight: 92, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  statusText: { fontSize: 13, lineHeight: 20 },
  card: { minHeight: 92, borderWidth: 1, borderRadius: 18, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardCopy: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 15, lineHeight: 21, fontWeight: '700' },
  progress: { fontSize: 12, lineHeight: 18, fontWeight: '700' },
  actionButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  secondaryButton: { minHeight: 42, borderRadius: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  secondaryLabel: { fontSize: 13, fontWeight: '700' },
});
