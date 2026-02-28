import { Search, X } from 'lucide-react-native';
import React from 'react';
import { Pressable, TextInput, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

export const HeaderSearchInput = React.forwardRef(
  function HeaderSearchInput(
    {
      value,
      onChangeText,
      placeholder = 'Search…',
      onFocus,
      onSubmitEditing,
      onClear,
    }: {
      value: string;
      onChangeText: (value: string) => void;
      placeholder?: string;
      onFocus?: () => void;
      onSubmitEditing?: () => void;
      onClear?: () => void;
    },
    ref: React.ForwardedRef<TextInput>
  ): React.JSX.Element {
    const { resolvedTheme } = useAppTheme();
    const palette = Colors[resolvedTheme];
    const showClear = value.trim().length > 0;

    return (
      <View className="w-full" style={{ width: '100%' }}>
        <View
          className="flex-row items-center gap-2 rounded-xl bg-interactive px-3 py-2 dark:bg-interactive-dark border border-border/30 dark:border-border-dark/20"
          style={{ minHeight: 44 }}
        >
          <View className="h-4 w-4 items-center justify-center">
            <Search color={palette.muted} size={16} strokeWidth={2.25} />
          </View>

          <TextInput
            ref={ref}
            value={value}
            onChangeText={onChangeText}
            onFocus={onFocus}
            placeholder={placeholder}
            placeholderTextColor={palette.muted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={onSubmitEditing}
            style={{ paddingVertical: 0 }}
            className="flex-1 text-sm text-foreground dark:text-foreground-dark"
          />

          {showClear ? (
            <Pressable
              onPress={() => {
                onClear?.();
                onChangeText('');
              }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <X color={palette.muted} size={18} strokeWidth={2.25} />
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }
);
