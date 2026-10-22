import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useDownloadIndexItems } from '@/hooks/useDownloadIndexItems';
import { container } from '@/src/core/infrastructure/di/container';
import { getBundledWordStudyPacks } from '@/src/core/infrastructure/word-study';

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

const BUNDLED_ENTRY = getBundledWordStudyPacks()[0] ?? null;

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
  const entry = BUNDLED_ENTRY;
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
      {!entry ? (
        <View style={[styles.card, { backgroundColor: palette.surfaceNavigation }]}>
          <Text style={[styles.status, styles.cardCopy, { color: palette.muted }]}>No Essentials download is included in this app version.</Text>
        </View>
      ) : (
        <StudyPackDownloadCard
          title="Morphology, roots, lemmas & word families"
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
  card: { minHeight: 92, borderRadius: 18, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardCopy: { flex: 1 },
  status: { fontSize: 13, lineHeight: 20 },
});
