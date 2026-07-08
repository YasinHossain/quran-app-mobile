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
      editable = true,
    }: {
      value: string;
      onChangeText: (value: string) => void;
      placeholder?: string;
      onFocus?: () => void;
      onSubmitEditing?: () => void;
      onClear?: () => void;
      editable?: boolean;
    },
    ref: React.ForwardedRef<TextInput>
  ): React.JSX.Element {
    const { resolvedTheme } = useAppTheme();
    const palette = Colors[resolvedTheme];
    const showClear = value.trim().length > 0;
    const inputRef = React.useRef<TextInput>(null);

    React.useImperativeHandle(ref, () => inputRef.current as TextInput);

    const focusInput = React.useCallback(() => {
      if (!editable) return;
      inputRef.current?.focus();
    }, [editable]);

    return (
      <View className="w-full" style={{ width: '100%' }}>
        <Pressable
          onPressIn={focusInput}
          className="flex-row items-center gap-2 rounded-xl bg-interactive px-3 py-2 dark:bg-interactive-dark border border-border/30 dark:border-border-dark/20"
          style={{ minHeight: 44 }}
          accessibilityRole="search"
        >
          <View className="h-4 w-4 items-center justify-center">
            <Search color={palette.muted} size={16} strokeWidth={2.25} />
          </View>

          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={onChangeText}
            onFocus={onFocus}
            placeholder={placeholder}
            placeholderTextColor={palette.muted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={onSubmitEditing}
            editable={editable}
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
        </Pressable>
      </View>
    );
  }
);
