import React from 'react';
import { Pressable, Text, View } from 'react-native';

type ActionTone = 'default' | 'accent' | 'danger';

type MushafPackOptionAction = {
  label: string;
  onPress: () => void;
  disabled?: boolean | undefined;
  tone?: ActionTone | undefined;
};

function ActionButton({
  action,
}: {
  action: MushafPackOptionAction;
}): React.JSX.Element {
  const tone = action.tone ?? 'default';

  return (
    <Pressable
      onPress={action.onPress}
      disabled={action.disabled}
      accessibilityRole="button"
      className={[
        'rounded-full px-4 py-2',
        tone === 'accent'
          ? 'bg-accent'
          : tone === 'danger'
            ? 'bg-error dark:bg-error-dark'
            : 'bg-interactive dark:bg-interactive-dark',
      ].join(' ')}
      style={({ pressed }) => ({
        opacity: action.disabled ? 0.45 : pressed ? 0.88 : 1,
      })}
    >
      <Text
        className={[
          'text-xs font-semibold',
          tone === 'accent' || tone === 'danger'
            ? 'text-on-accent'
            : 'text-foreground dark:text-foreground-dark',
        ].join(' ')}
      >
        {action.label}
      </Text>
    </Pressable>
  );
}

export function MushafPackOptionCard({
  title,
  description,
  statusLabel,
  progressLabel,
  errorMessage,
  sourceLabel,
  isSelected,
  primaryAction,
  secondaryAction,
}: {
  title: string;
  description: string;
  statusLabel: string;
  progressLabel?: string | null;
  errorMessage?: string | null;
  sourceLabel?: string | null;
  isSelected?: boolean;
  primaryAction?: MushafPackOptionAction | undefined;
  secondaryAction?: MushafPackOptionAction | undefined;
}): React.JSX.Element {
  return (
    <View
      className={[
        'rounded-2xl border px-4 py-4',
        isSelected
          ? 'border-accent/60 bg-accent/10'
          : 'border-border/30 bg-interactive dark:border-border-dark/20 dark:bg-interactive-dark',
      ].join(' ')}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-sm font-semibold text-foreground dark:text-foreground-dark">
            {title}
          </Text>
          <Text className="mt-1 text-xs leading-5 text-muted dark:text-muted-dark">
            {description}
          </Text>
        </View>
        <View
          className={[
            'rounded-full px-3 py-1.5',
            isSelected ? 'bg-accent' : 'bg-surface dark:bg-surface-dark',
          ].join(' ')}
        >
          <Text
            className={[
              'text-[11px] font-semibold uppercase tracking-[0.3px]',
              isSelected
                ? 'text-on-accent'
                : 'text-foreground dark:text-foreground-dark',
            ].join(' ')}
          >
            {statusLabel}
          </Text>
        </View>
      </View>

      {progressLabel ? (
        <Text className="mt-3 text-xs text-muted dark:text-muted-dark">{progressLabel}</Text>
      ) : null}

      {sourceLabel ? (
        <Text className="mt-2 text-xs leading-5 text-muted dark:text-muted-dark">
          Source: {sourceLabel}
        </Text>
      ) : null}

      {errorMessage ? (
        <Text className="mt-3 text-xs leading-5 text-error dark:text-error-dark">
          {errorMessage}
        </Text>
      ) : null}

      {primaryAction || secondaryAction ? (
        <View className="mt-4 flex-row flex-wrap gap-3">
          {primaryAction ? <ActionButton action={primaryAction} /> : null}
          {secondaryAction ? <ActionButton action={secondaryAction} /> : null}
        </View>
      ) : null}
    </View>
  );
}
