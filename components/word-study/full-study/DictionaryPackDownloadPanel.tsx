import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useDownloadIndexItems } from '@/hooks/useDownloadIndexItems';
import { container } from '@/src/core/infrastructure/di/container';
import { getBundledWordReferencePacks } from '@/src/core/infrastructure/word-reference';

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
  | { status: 'installed' }
  | { status: 'ready' };

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const BUNDLED_ENTRIES = getBundledWordReferencePacks();

export function DictionaryPackDownloadPanel({ palette }: { palette: Palette }): React.JSX.Element {
  const installer = container.getWordReferencePackInstaller();
  const { items, refresh } = useDownloadIndexItems({ enabled: true, pollIntervalMs: 500, pollWhileEnabled: true });
  const [state, setState] = React.useState<State>({ status: 'ready' });

  React.useEffect(() => {
    let active = true;
    void container
      .getDictionaryReferenceRepository()
      .listInstalledSources()
      .then((installedSources) => {
        if (!active) return;
        if (installedSources.length > 0) {
          setState({ status: 'installed' });
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return (
    <View style={styles.section}>
      {state.status === 'installed' ? (
        <View style={styles.loading}>
          <ActivityIndicator color={palette.tint} />
          <Text style={[styles.status, { color: palette.muted }]}>Loading this word…</Text>
        </View>
      ) : BUNDLED_ENTRIES.map((entry) => {
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
  loading: { minHeight: 92, alignItems: 'center', justifyContent: 'center', gap: 10 },
  status: { fontSize: 13, lineHeight: 20 },
});
