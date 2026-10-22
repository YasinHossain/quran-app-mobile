import { Check, Download, RefreshCw } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DownloadProgressRing } from '@/components/downloads/DownloadProgressRing';
import type {
  DownloadProgress,
  DownloadStatus,
} from '@/src/core/domain/entities/DownloadIndexItem';

export type StudyPackPalette = {
  surfaceNavigation: string;
  text: string;
  muted: string;
  border: string;
  tint: string;
  interactive: string;
  error: string;
};

export function StudyPackDownloadCard({
  title,
  detail,
  status,
  progress,
  error,
  palette,
  downloadAccessibilityLabel,
  cancelAccessibilityLabel,
  onDownload,
  onCancel,
}: {
  title: string;
  detail: string;
  status?: DownloadStatus;
  progress?: DownloadProgress;
  error?: string | null;
  palette: StudyPackPalette;
  downloadAccessibilityLabel: string;
  cancelAccessibilityLabel: string;
  onDownload?: () => void;
  onCancel?: () => void;
}): React.JSX.Element {
  const active = status === 'queued' || status === 'downloading';
  const installed = status === 'installed';
  const failed = status === 'failed';
  const percent = progress?.kind === 'percent'
    ? progress.percent
    : progress?.kind === 'items' && progress.total > 0
      ? (progress.completed / progress.total) * 100
      : 0;

  return (
    <View style={[styles.card, { backgroundColor: palette.surfaceNavigation }]}>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
        <Text style={[styles.detail, { color: palette.muted }]}>{detail}</Text>
        {installed ? (
          <Text style={[styles.progress, { color: palette.tint }]}>
            Downloaded · available offline
          </Text>
        ) : failed ? (
          <Text style={[styles.progress, { color: palette.error }]}>
            {error ?? 'Download failed'}
          </Text>
        ) : null}
      </View>

      {installed ? (
        <View style={[styles.action, { backgroundColor: palette.interactive }]}>
          <Check color={palette.tint} size={20} strokeWidth={2.4} />
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            active ? cancelAccessibilityLabel : downloadAccessibilityLabel
          }
          disabled={active ? !onCancel : !onDownload}
          onPress={active ? onCancel : onDownload}
          style={({ pressed }) => [
            styles.action,
            {
              backgroundColor: palette.interactive,
              opacity: pressed ? 0.68 : 1,
            },
          ]}
        >
          {active ? (
            <DownloadProgressRing
              percent={percent}
              tintColor={palette.tint}
              trackColor={palette.border}
              crossColor={palette.tint}
            />
          ) : failed ? (
            <RefreshCw color={palette.error} size={20} strokeWidth={2.25} />
          ) : (
            <Download color={palette.tint} size={20} strokeWidth={2.25} />
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 92,
    borderRadius: 18,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    overflow: 'hidden',
  },
  copy: { flex: 1, gap: 3 },
  title: { fontSize: 15, lineHeight: 21, fontWeight: '700' },
  detail: { fontSize: 13, lineHeight: 20 },
  progress: { fontSize: 12, lineHeight: 18, fontWeight: '700' },
  action: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
