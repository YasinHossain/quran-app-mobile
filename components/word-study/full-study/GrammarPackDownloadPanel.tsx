import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useDownloadIndexItems } from '@/hooks/useDownloadIndexItems';
import { container } from '@/src/core/infrastructure/di/container';
import {
  getBundledWordGrammarPacks,
  type ReadyWordGrammarPack,
} from '@/src/core/infrastructure/word-grammar';

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

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const BUNDLED_ENTRY = getBundledWordGrammarPacks()[0] ?? null;

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
  const [installedPack, setInstalledPack] = React.useState<ReadyWordGrammarPack | null>(null);

  React.useEffect(() => {
    let active = true;
    const loadInstalled = (): void => {
      void installer
        .getInstalledAsync()
        .then((installed) => {
          if (active) setInstalledPack(installed);
        })
        .catch(() => {
          if (active) setInstalledPack(null);
        });
    };
    loadInstalled();
    const unsubscribe = installer.subscribe(loadInstalled);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [installer]);

  const entry = BUNDLED_ENTRY;
  const item = entry
    ? items.find(
        (candidate) =>
          candidate.content.kind === 'word-grammar-pack' &&
          candidate.content.packId === entry.packId &&
          candidate.content.version === entry.version
      )
    : undefined;
  const itemIsActive = item?.status === 'queued' || item?.status === 'downloading';
  const entryIsInstalled = Boolean(
    entry &&
      installedPack?.packId === entry.packId &&
      installedPack.version === entry.version
  );

  React.useEffect(() => {
    if (entryIsInstalled) onInstalled();
  }, [entryIsInstalled, onInstalled]);

  const displayStatus = itemIsActive ? item.status : item?.status;

  return (
    <View style={styles.section}>
      {entryIsInstalled || item?.status === 'installed' ? (
        <View style={styles.statusRow} accessibilityLiveRegion="polite">
          <ActivityIndicator color={palette.tint} size="small" />
          <Text style={[styles.statusText, { color: palette.muted }]}>Opening Arabic grammar…</Text>
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
          status={displayStatus}
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
              .then((installed) => {
                setInstalledPack(installed);
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
});
