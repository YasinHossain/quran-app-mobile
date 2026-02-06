import { CheckCircle2, Flag, Target } from 'lucide-react-native';
import React from 'react';
import { Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

import type { PlannerCardViewModel, PlannerStatsGroup } from './utils/plannerCard';

function SecondaryStat({
  value,
  unit,
}: {
  value: number | string | null;
  unit: string;
}): React.JSX.Element | null {
  if (value === null || value === undefined) return null;
  return (
    <Text className="text-lg font-semibold text-foreground dark:text-foreground-dark">
      {String(value)}
      <Text className="text-xs font-medium text-muted dark:text-muted-dark"> {unit}</Text>
    </Text>
  );
}

function StatsCard({
  title,
  icon: Icon,
  stats,
}: {
  title: string;
  icon: typeof CheckCircle2;
  stats: PlannerStatsGroup;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

  return (
    <View
      style={{ minWidth: 120 }}
      className="flex-1 min-w-0 rounded-xl border border-border/60 bg-background/60 px-4 py-4 dark:border-border-dark/50 dark:bg-background-dark/40"
    >
      <View className="flex-row items-center gap-2">
        <Icon size={16} strokeWidth={2.25} color={palette.tint} />
        <Text className="text-sm font-semibold text-muted dark:text-muted-dark">{title}</Text>
      </View>
      <View className="mt-3 gap-1">
        <SecondaryStat value={stats.verses} unit="Verses" />
        <SecondaryStat value={stats.pages} unit="Pages" />
        <SecondaryStat value={stats.juz} unit="Juz" />
      </View>
    </View>
  );
}

export function PlannerStatsSection({
  stats,
}: {
  stats: PlannerCardViewModel['stats'];
}): React.JSX.Element {
  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap gap-3">
        <StatsCard title="Completed" icon={CheckCircle2} stats={stats.completed} />
        <StatsCard title="Remaining" icon={Flag} stats={stats.remaining} />
        <StatsCard title="Goal" icon={Target} stats={stats.goal} />
      </View>
    </View>
  );
}
