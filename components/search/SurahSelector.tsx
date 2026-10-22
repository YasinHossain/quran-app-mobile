import { ChevronDown } from 'lucide-react-native';
import React from 'react';
import {
  Keyboard,
  Pressable,
  Text,
  type TextInputProps,
  type TextInputSubmitEditingEvent,
  View,
} from 'react-native';

import Colors from '@/constants/Colors';
import { normalizeNumeralsToAscii } from '@/lib/search/numerals';
import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';

import { SearchableSelectorDropdown } from './SearchableSelectorDropdown';

type SurahOption = {
  value: number;
  label: string;
  searchLabel: string;
};

type Props = {
  options: SurahOption[];
  selectedValue: number | undefined;
  onSelect: (value: number) => void;
  placeholder?: string;
  /** Return `true` when another field takes focus next, so the keyboard stays up for it. */
  onSelectionComplete?: (value: number) => boolean | void;
  returnKeyType?: TextInputProps['returnKeyType'];
  floatingDropdown?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  dismissRequest?: number;
  dismissKeyboardOnListTouch?: boolean;
};

export type SurahSelectorHandle = {
  openDropdown: () => void;
  closeDropdown: () => void;
};

export const SurahSelector = React.forwardRef<SurahSelectorHandle, Props>(function SurahSelector(
  {
    options,
    selectedValue,
    onSelect,
    placeholder = 'Select Surah',
    onSelectionComplete,
    returnKeyType = 'done',
    floatingDropdown = false,
    onOpenChange,
    dismissRequest = 0,
    dismissKeyboardOnListTouch = false,
  }: Props,
  ref
): React.JSX.Element {
  const { resolvedTheme, isDark } = useAppTheme();
  const { t, formatNumber } = useUiTranslation();
  const palette = Colors[resolvedTheme];
  const fieldBackgroundColor = isDark ? '#334155' : '#F3F4F6';

  const [isOpen, setIsOpen] = React.useState(false);
  const [searchText, setSearchText] = React.useState('');
  const [isHandingOff, setIsHandingOff] = React.useState(false);
  const openFrameRef = React.useRef<number | null>(null);
  const handledDismissRequestRef = React.useRef(dismissRequest);

  const selectedLabel = React.useMemo(() => {
    if (!selectedValue) return '';
    const option = options.find((item) => item.value === selectedValue);
    return option?.label ?? `${t('surah_tab')} ${formatNumber(selectedValue)}`;
  }, [formatNumber, options, selectedValue, t]);

  const filteredOptions = React.useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return options;
    const normalizedQuery = normalizeNumeralsToAscii(query);
    return options.filter((option) => {
      const idMatch = String(option.value).startsWith(normalizedQuery);
      const labelMatch = normalizeNumeralsToAscii(option.searchLabel).includes(normalizedQuery);
      return idMatch || labelMatch;
    });
  }, [options, searchText]);

  const openDropdown = React.useCallback(() => {
    if (openFrameRef.current !== null) cancelAnimationFrame(openFrameRef.current);
    setSearchText('');
    onOpenChange?.(true);
    openFrameRef.current = requestAnimationFrame(() => {
      openFrameRef.current = null;
      setIsOpen(true);
    });
  }, [onOpenChange]);

  const closeDropdown = React.useCallback((dismissKeyboard = true) => {
    if (openFrameRef.current !== null) {
      cancelAnimationFrame(openFrameRef.current);
      openFrameRef.current = null;
    }
    setIsOpen(false);
    setIsHandingOff(false);
    setSearchText('');
    if (dismissKeyboard) Keyboard.dismiss();
    onOpenChange?.(false);
  }, [onOpenChange]);

  // If the next field never takes focus, close normally.
  React.useEffect(() => {
    if (!isHandingOff) return;
    const timeoutId = setTimeout(() => closeDropdown(), 800);
    return () => clearTimeout(timeoutId);
  }, [closeDropdown, isHandingOff]);

  React.useEffect(() => {
    if (dismissRequest === handledDismissRequestRef.current) return;
    handledDismissRequestRef.current = dismissRequest;
    closeDropdown();
  }, [closeDropdown, dismissRequest]);

  const handleSelect = React.useCallback(
    (value: number) => {
      onSelect(value);
      setSearchText('');
      if (onSelectionComplete?.(value) === true) {
        // The verse field takes focus next; this input closes once it loses focus to it.
        setIsHandingOff(true);
        return;
      }
      // Clear native focus before removing the input so Android does not
      // transfer it to the header search field.
      Keyboard.dismiss();
      setIsOpen(false);
      onOpenChange?.(false);
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
    (_event: TextInputSubmitEditingEvent) => {
      const normalizedQuery = searchText.trim().toLowerCase();
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
      {isOpen ? (
        <SearchableSelectorDropdown
          accessibilityLabel={t('select_surah')}
          searchPlaceholder={t('search')}
          options={filteredOptions}
          selectedValue={selectedValue}
          searchText={searchText}
          onSearchTextChange={setSearchText}
          onSelect={handleSelect}
          onClose={closeDropdown}
          onBlurClose={() => closeDropdown(false)}
          onSubmitEditing={handleSubmitSelection}
          returnKeyType={returnKeyType}
          floating={floatingDropdown}
          handingOff={isHandingOff}
          dismissKeyboardOnListTouch={dismissKeyboardOnListTouch}
        />
      ) : (
        <Pressable
          onPress={openDropdown}
          accessibilityRole="button"
          accessibilityLabel={t('select_surah')}
          accessibilityState={{ expanded: false }}
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
              {selectedLabel || placeholder}
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
