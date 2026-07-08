import { CheckCircle2, Flag, Target } from 'lucide-react-native';
import React from 'react';
import { Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';

import type { PlannerCardViewModel, PlannerStatsGroup } from './utils/plannerCard';

function SecondaryStat({
  value,
  unit,
  formatNumber,
}: {
  value: number | string | null;
  unit: string;
  formatNumber: (value: number) => string;
}): React.JSX.Element | null {
  if (value === null || value === undefined) return null;
  const displayValue = typeof value === 'number' ? formatNumber(value) : value;
  return (
    <Text className="text-lg font-semibold text-foreground dark:text-foreground-dark">
      {displayValue}
      <Text className="text-xs font-medium text-muted dark:text-muted-dark"> {unit}</Text>
    </Text>
  );
}

function StatsCard({
  title,
  labels,
  icon: Icon,
  stats,
  formatNumber,
}: {
  title: string;
  labels: { verses: string; pages: string; juz: string };
  icon: typeof CheckCircle2;
  stats: PlannerStatsGroup;
  formatNumber: (value: number) => string;
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
        <SecondaryStat value={stats.verses} unit={labels.verses} formatNumber={formatNumber} />
        <SecondaryStat value={stats.pages} unit={labels.pages} formatNumber={formatNumber} />
        <SecondaryStat value={stats.juz} unit={labels.juz} formatNumber={formatNumber} />
      </View>
    </View>
  );
}

export function PlannerStatsSection({
  stats,
}: {
  stats: PlannerCardViewModel['stats'];
}): React.JSX.Element {
  const { t, formatNumber } = useUiTranslation();
  const labels = React.useMemo(
    () => ({ verses: t('verses'), pages: t('pages'), juz: t('juz_tab') }),
    [t]
  );

  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap gap-3">
        <StatsCard title={t('completed')} labels={labels} icon={CheckCircle2} stats={stats.completed} formatNumber={formatNumber} />
        <StatsCard title={t('remaining')} labels={labels} icon={Flag} stats={stats.remaining} formatNumber={formatNumber} />
        <StatsCard title={t('goal')} labels={labels} icon={Target} stats={stats.goal} formatNumber={formatNumber} />
      </View>
    </View>
  );
}
