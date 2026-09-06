import { ChevronDown } from 'lucide-react-native';
import React from 'react';
import {
  Keyboard,
  Pressable,
  Text,
  type TextInputProps,
  type TextInputSubmitEditingEventData,
  type NativeSyntheticEvent,
  View,
} from 'react-native';

import Colors from '@/constants/Colors';
import {
  normalizeNumeralsToAscii,
  sanitizeNumeralInput,
} from '@/lib/search/numerals';
import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';

import { SearchableSelectorDropdown } from './SearchableSelectorDropdown';

type VerseOption = {
  value: number;
  label: string;
};

type Props = {
  options: VerseOption[];
  selectedValue: number | undefined;
  onSelect: (value: number) => void;
  disabled?: boolean;
  placeholder?: string;
  disabledPlaceholder?: string;
  onSelectionComplete?: (value: number) => void;
  returnKeyType?: TextInputProps['returnKeyType'];
  floatingDropdown?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  dismissRequest?: number;
};

export type VerseSelectorHandle = {
  openDropdown: () => void;
  closeDropdown: () => void;
};

export const VerseSelector = React.forwardRef<VerseSelectorHandle, Props>(function VerseSelector(
  {
    options,
    selectedValue,
    onSelect,
    disabled = false,
    placeholder = 'Select Verse',
    disabledPlaceholder = 'Select Surah first',
    onSelectionComplete,
    returnKeyType = 'done',
    floatingDropdown = false,
    onOpenChange,
    dismissRequest = 0,
  }: Props,
  ref
): React.JSX.Element {
  const { resolvedTheme, isDark } = useAppTheme();
  const { t, formatNumber } = useUiTranslation();
  const palette = Colors[resolvedTheme];
  const fieldBackgroundColor = isDark ? '#334155' : '#F3F4F6';

  const [isOpen, setIsOpen] = React.useState(false);
  const [searchText, setSearchText] = React.useState('');
  const openFrameRef = React.useRef<number | null>(null);
  const handledDismissRequestRef = React.useRef(dismissRequest);

  const selectedLabel = React.useMemo(
    () => (selectedValue ? formatNumber(selectedValue) : ''),
    [formatNumber, selectedValue]
  );

  const filteredOptions = React.useMemo(() => {
    const query = normalizeNumeralsToAscii(searchText.trim());
    if (!query) return options;
    return options.filter((option) => String(option.value).startsWith(query));
  }, [options, searchText]);

  const openDropdown = React.useCallback(() => {
    if (disabled) return;
    if (openFrameRef.current !== null) cancelAnimationFrame(openFrameRef.current);
    setSearchText('');
    onOpenChange?.(true);
    openFrameRef.current = requestAnimationFrame(() => {
      openFrameRef.current = null;
      setIsOpen(true);
    });
  }, [disabled, onOpenChange]);

  const closeDropdown = React.useCallback((dismissKeyboard = true) => {
    if (openFrameRef.current !== null) {
      cancelAnimationFrame(openFrameRef.current);
      openFrameRef.current = null;
    }
    setIsOpen(false);
    setSearchText('');
    if (dismissKeyboard) Keyboard.dismiss();
    onOpenChange?.(false);
  }, [onOpenChange]);

  React.useEffect(() => {
    if (dismissRequest === handledDismissRequestRef.current) return;
    handledDismissRequestRef.current = dismissRequest;
    closeDropdown();
  }, [closeDropdown, dismissRequest]);

  React.useEffect(() => {
    if (disabled && isOpen) closeDropdown();
  }, [closeDropdown, disabled, isOpen]);

  const handleSelect = React.useCallback(
    (value: number) => {
      Keyboard.dismiss();
      onSelect(value);
      setIsOpen(false);
      setSearchText('');
      onOpenChange?.(false);
      onSelectionComplete?.(value);
    },
    [onOpenChange, onSelect, onSelectionComplete]
  );

  React.useEffect(
    () => () => {
      if (openFrameRef.current !== null) cancelAnimationFrame(openFrameRef.current);
      onOpenChange?.(false);
    },
    [onOpenChange]
  );

  const handleSubmitSelection = React.useCallback(
    (_event: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => {
      const normalizedQuery = normalizeNumeralsToAscii(searchText.trim());
      const matchedOption = normalizedQuery
        ? filteredOptions[0]
        : options.find((option) => option.value === selectedValue);
      if (!matchedOption) return;
      handleSelect(matchedOption.value);
    },
    [filteredOptions, handleSelect, options, searchText, selectedValue]
  );

  React.useImperativeHandle(
    ref,
    () => ({
      openDropdown,
      closeDropdown,
    }),
    [closeDropdown, openDropdown]
  );

  return (
    <View>
      {isOpen && !disabled ? (
        <SearchableSelectorDropdown
          accessibilityLabel={t('select_verse')}
          searchPlaceholder={t('select_verse')}
          options={filteredOptions}
          selectedValue={selectedValue}
          searchText={searchText}
          onSearchTextChange={(value) => setSearchText(sanitizeNumeralInput(value))}
          onSelect={handleSelect}
          onClose={closeDropdown}
          onBlurClose={() => closeDropdown(false)}
          onSubmitEditing={handleSubmitSelection}
          keyboardType="number-pad"
          returnKeyType={returnKeyType}
          floating={floatingDropdown}
        />
      ) : (
        <Pressable
          onPress={openDropdown}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={t('select_verse')}
          accessibilityState={{ disabled, expanded: false }}
        >
          <View
            style={{
              backgroundColor: fieldBackgroundColor,
              borderWidth: 1,
              borderColor: isDark
                ? 'rgba(255,255,255,0.12)'
                : 'rgba(0,0,0,0.1)',
              borderRadius: 8,
              height: 46,
              justifyContent: 'center',
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <Text
              style={{
                paddingHorizontal: 12,
                paddingRight: 38,
                paddingVertical: 0,
                fontSize: 16,
                lineHeight: 22,
                color: selectedLabel ? palette.text : palette.muted,
              }}
              numberOfLines={1}
            >
              {selectedLabel || (disabled ? disabledPlaceholder : placeholder)}
            </Text>
            <View pointerEvents="none" style={styles.chevron}>
              <ChevronDown size={18} strokeWidth={2.25} color={palette.muted} />
            </View>
          </View>
        </Pressable>
      )}
    </View>
  );
});

const styles = {
  chevron: {
    position: 'absolute' as const,
    right: 10,
    top: 0,
    bottom: 0,
    justifyContent: 'center' as const,
  },
};
