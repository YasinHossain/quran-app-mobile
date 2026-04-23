import { Download, Trash2, X } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

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

function CompactProgressRing({
  percent,
  tintColor,
  trackColor,
  crossColor,
}: {
  percent: number;
  tintColor: string;
  trackColor: string;
  crossColor: string;
}): React.JSX.Element {
  const size = 24;
  const strokeWidth = 3;
  const clampedPercent = clampPercent(percent);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clampedPercent / 100) * circumference;

  return (
    <View className="h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-interactive dark:border-border-dark/60 dark:bg-interactive-dark">
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={tintColor}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </Svg>

      <View className="absolute inset-0 items-center justify-center">
        <X color={crossColor} size={12} strokeWidth={2.75} />
      </View>
    </View>
  );
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
  const destructiveColor = isSelected ? '#FFFFFF' : isDark ? '#F87171' : '#DC2626';
  const iconColor = isSelected ? '#FFFFFF' : tintColor;
  const trackColor = isSelected
    ? 'rgba(255,255,255,0.35)'
    : isDark
      ? 'rgba(20,184,166,0.35)'
      : 'rgba(13,148,136,0.35)';
  const progressColor = isSelected ? '#FFFFFF' : tintColor;
  const crossColor = isSelected ? '#FFFFFF' : tintColor;

  if (isDeleting) {
    return (
      <View
        className={[
          'h-8 w-8 items-center justify-center rounded-full border',
          isSelected ? 'border-white/30 bg-white/15' : 'border-error/40 bg-error/10',
        ].join(' ')}
      >
        <ActivityIndicator size="small" color={destructiveColor} />
      </View>
    );
  }

  if (isDownloading) {
    return (
      <CompactProgressRing
        percent={progressPercent}
        tintColor={progressColor}
        trackColor={trackColor}
        crossColor={crossColor}
      />
    );
  }

  if (isInstalled) {
    return (
      <View
        className={[
          'h-8 w-8 items-center justify-center rounded-full border',
          isSelected ? 'border-white/30 bg-white/15' : 'border-error/40 bg-error/10',
        ].join(' ')}
      >
        <Trash2 color={destructiveColor} size={16} strokeWidth={2.25} />
      </View>
    );
  }

  return (
    <View
      className={[
        'h-8 w-8 items-center justify-center rounded-full border',
        isSelected
          ? 'border-white/30 bg-white/15'
          : 'border-border/60 bg-interactive dark:border-border-dark/60 dark:bg-interactive-dark',
      ].join(' ')}
    >
      <Download color={isFailed ? destructiveColor : iconColor} size={16} strokeWidth={2.25} />
    </View>
  );
}
