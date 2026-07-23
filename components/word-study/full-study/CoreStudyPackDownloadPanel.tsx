import { RefreshCw } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useDownloadIndexItems } from '@/hooks/useDownloadIndexItems';
import { container } from '@/src/core/infrastructure/di/container';
import type { WordStudyPackCatalogEntry } from '@/src/core/infrastructure/word-study';

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
  | { status: 'ready'; entry: WordStudyPackCatalogEntry | null }
  | { status: 'error' };

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CoreStudyPackDownloadPanel({
  palette,
  showHeading = true,
  onInstalled,
}: {
  palette: Palette;
  showHeading?: boolean;
  onInstalled: () => void;
}): React.JSX.Element {
  const installer = container.getWordStudyPackInstaller();
  const { items, refresh } = useDownloadIndexItems({
    enabled: true,
    pollIntervalMs: 500,
    pollWhileEnabled: true,
  });
  const [catalog, setCatalog] = React.useState<CatalogState>({ status: 'loading' });
  const [retryNonce, setRetryNonce] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();
    setCatalog({ status: 'loading' });
    void container
      .getWordStudyPackCatalogClient()
      .listCompatiblePacksAsync(controller.signal)
      .then((entries) => setCatalog({ status: 'ready', entry: entries[0] ?? null }))
      .catch(() => {
        if (!controller.signal.aborted) setCatalog({ status: 'error' });
      });
    return () => controller.abort();
  }, [retryNonce]);

  const entry = catalog.status === 'ready' ? catalog.entry : null;
  const item = entry
    ? items.find(
        (candidate) =>
          candidate.content.kind === 'word-study-pack' &&
          candidate.content.packId === entry.packId &&
          candidate.content.version === entry.version
      )
    : undefined;
  return (
    <View style={styles.section}>
      {showHeading ? (
        <Text style={[styles.title, { color: palette.text }]}>Word Study Essentials</Text>
      ) : null}
      {catalog.status === 'loading' ? (
        <View style={styles.loading} accessibilityLiveRegion="polite">
          <ActivityIndicator color={palette.tint} />
          <Text style={[styles.status, { color: palette.muted }]}>Checking download…</Text>
        </View>
      ) : catalog.status === 'error' || !entry ? (
        <View style={[styles.card, { backgroundColor: palette.surfaceNavigation }]}>
          <Text style={[styles.status, styles.cardCopy, { color: palette.muted }]}>Connect to the internet to check the Essentials download.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry Word Study Essentials catalog"
            onPress={() => setRetryNonce((value) => value + 1)}
            style={[styles.secondaryButton, { backgroundColor: palette.surfaceNavigation }]}
          >
            <RefreshCw color={palette.tint} size={17} />
            <Text style={[styles.secondaryLabel, { color: palette.tint }]}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <StudyPackDownloadCard
          title="Morphology, meanings, roots & word families"
          detail={formatBytes(entry.databaseSizeBytes)}
          status={item?.status}
          progress={item?.progress}
          error={item?.error}
          palette={palette}
          downloadAccessibilityLabel="Download Word Study Essentials"
          cancelAccessibilityLabel="Cancel Word Study Essentials download"
          onCancel={() => installer.cancel(entry.packId, entry.version)}
          onDownload={() => {
            void installer
              .installAsync(entry)
              .then(() => {
                void refresh();
                onInstalled();
              })
              .catch(() => void refresh());
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12, paddingTop: 4 },
  title: { fontSize: 19, lineHeight: 26, fontWeight: '700' },
  loading: { minHeight: 92, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  card: { minHeight: 92, borderRadius: 18, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardCopy: { flex: 1 },
  status: { fontSize: 13, lineHeight: 20 },
  secondaryButton: { minHeight: 42, borderRadius: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  secondaryLabel: { fontSize: 13, fontWeight: '700' },
});
