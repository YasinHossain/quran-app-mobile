import { Download, Trash2 } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { DownloadProgressRing } from '@/components/downloads/DownloadProgressRing';
import type { DownloadProgress, DownloadStatus } from '@/src/core/domain/entities/DownloadIndexItem';

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function toProgressPercent(progress: DownloadProgress | undefined): number {
  if (!progress) return 0;
  if (progress.kind === 'percent') return clampPercent(progress.percent);
  if (progress.kind === 'items') {
    if (!Number.isFinite(progress.total) || progress.total <= 0) return 0;
    const rawPercent = clampPercent((progress.completed / progress.total) * 100);
    if (progress.completed > 0 && rawPercent < 12) return 12;
    return rawPercent;
  }
  return 0;
}

export function ResourceDownloadAction({
  status,
  progress,
  isSelected,
  isDark,
  tintColor,
}: {
  status: DownloadStatus | undefined;
  progress: DownloadProgress | undefined;
  isSelected: boolean;
  isDark: boolean;
  tintColor: string;
}): React.JSX.Element {
  const isDownloading = status === 'queued' || status === 'downloading';
  const isDeleting = status === 'deleting';
  const isInstalled = status === 'installed';
  const isFailed = status === 'failed';
  const progressPercent = toProgressPercent(progress);
  const destructiveColor = isDark ? '#F87171' : '#DC2626';
  const iconColor = isSelected ? '#FFFFFF' : tintColor;
  const trackColor = isSelected
    ? 'rgba(255,255,255,0.35)'
    : isDark
      ? 'rgba(20,184,166,0.35)'
      : 'rgba(13,148,136,0.35)';
  const progressColor = isSelected ? '#FFFFFF' : tintColor;
  const crossColor = isSelected ? '#FFFFFF' : tintColor;
  const neutralSurface = {
    backgroundColor: isDark ? '#334155' : '#F3F4F6',
    borderColor: isDark ? 'rgba(51,65,85,0.6)' : 'rgba(229,231,235,0.6)',
    borderRadius: 16,
    borderWidth: 1,
  };
  const selectedDownloadSurface = {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 16,
    borderWidth: 1,
  };
  const selectedDestructiveSurface = {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderColor: 'rgba(255,255,255,0.82)',
    borderRadius: 16,
    borderWidth: 1,
  };

  if (isDeleting) {
    return (
      <View
        className="h-8 w-8 items-center justify-center"
        style={isSelected ? selectedDestructiveSurface : {
          backgroundColor: 'rgba(220, 38, 38, 0.10)',
          borderColor: 'rgba(220, 38, 38, 0.40)',
          borderRadius: 16,
          borderWidth: 1,
        }}
      >
        <ActivityIndicator size="small" color={destructiveColor} />
      </View>
    );
  }

  if (isDownloading) {
    return (
      <DownloadProgressRing
        percent={progressPercent}
        tintColor={progressColor}
        trackColor={trackColor}
        crossColor={crossColor}
        emphasized={isSelected}
      />
    );
  }

  if (isInstalled) {
    return (
      <View
        className="h-8 w-8 items-center justify-center"
        style={isSelected ? selectedDestructiveSurface : {
          backgroundColor: 'rgba(220, 38, 38, 0.10)',
          borderColor: 'rgba(220, 38, 38, 0.40)',
          borderRadius: 16,
          borderWidth: 1,
        }}
      >
        <Trash2 color={destructiveColor} size={16} strokeWidth={2.25} />
      </View>
    );
  }

  return (
    <View
      className="h-8 w-8 items-center justify-center"
      style={isSelected ? selectedDownloadSurface : neutralSurface}
    >
      <Download color={isFailed ? destructiveColor : iconColor} size={16} strokeWidth={2.25} />
    </View>
  );
}
