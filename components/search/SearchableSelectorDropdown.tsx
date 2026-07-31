import { ChevronDown } from 'lucide-react-native';
import React from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type StyleProp,
  type TextInputProps,
  type TextInputSubmitEditingEventData,
  type NativeSyntheticEvent,
  type ViewStyle,
  useWindowDimensions,
  View,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import Colors from '@/constants/Colors';
import { OverlayPortal, useOverlayPortalHost } from '@/providers/OverlayPortalContext';
import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';

export type SearchableSelectorOption = {
  value: number;
  label: string;
};

type FieldLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function AnimatedSelectorList({
  children,
  style,
}: {
  children: React.ReactNode;
  style: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const reduceMotion = Boolean(useReducedMotion());
  const progress = React.useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  React.useEffect(() => {
    progress.stopAnimation();
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      isInteraction: false,
      useNativeDriver: true,
    }).start();
    return () => progress.stopAnimation();
  }, [progress, reduceMotion]);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [-10, 0],
              }),
            },
            {
              scale: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0.97, 1],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

export function SearchableSelectorDropdown({
  accessibilityLabel,
  searchPlaceholder,
  options,
  selectedValue,
  searchText,
  onSearchTextChange,
  onSelect,
  onClose,
  onSubmitEditing,
  keyboardType = 'default',
  returnKeyType = 'done',
  floating = false,
}: {
  accessibilityLabel: string;
  searchPlaceholder: string;
  options: SearchableSelectorOption[];
  selectedValue: number | undefined;
  searchText: string;
  onSearchTextChange: (value: string) => void;
  onSelect: (value: number) => void;
  onClose: () => void;
  onSubmitEditing: (
    event: NativeSyntheticEvent<TextInputSubmitEditingEventData>
  ) => void;
  keyboardType?: TextInputProps['keyboardType'];
  returnKeyType?: TextInputProps['returnKeyType'];
  floating?: boolean;
}): React.JSX.Element {
  const { resolvedTheme, isDark } = useAppTheme();
  const { t } = useUiTranslation();
  const palette = Colors[resolvedTheme];
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const portalHost = useOverlayPortalHost();
  const fieldRef = React.useRef<View>(null);
  const inputRef = React.useRef<TextInput>(null);
  const keepOpenOnBlurRef = React.useRef(false);
  const keepOpenTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fieldLayout, setFieldLayout] = React.useState<FieldLayout | null>(null);
  const [keyboardTop, setKeyboardTop] = React.useState(
    () => Keyboard.metrics()?.screenY ?? windowHeight
  );

  const shouldFloat = floating && portalHost !== null;

  const measureField = React.useCallback(() => {
    fieldRef.current?.measureInWindow((x, y, width, height) => {
      setFieldLayout((previous) =>
        previous &&
        previous.x === x &&
        previous.y === y &&
        previous.width === width &&
        previous.height === height
          ? previous
          : { x, y, width, height }
      );
    });
  }, []);

  const scheduleFieldMeasurement = React.useCallback(() => {
    requestAnimationFrame(measureField);
    setTimeout(measureField, 100);
  }, [measureField]);

  const temporarilyKeepOpenOnBlur = React.useCallback(() => {
    keepOpenOnBlurRef.current = true;
    if (keepOpenTimeoutRef.current) clearTimeout(keepOpenTimeoutRef.current);
    keepOpenTimeoutRef.current = setTimeout(() => {
      keepOpenOnBlurRef.current = false;
      keepOpenTimeoutRef.current = null;
    }, 300);
  }, []);

  React.useEffect(() => {
    const animationFrameId = requestAnimationFrame(() => {
      measureField();
      inputRef.current?.focus();
    });
    const focusTimeoutId = setTimeout(() => {
      measureField();
      inputRef.current?.focus();
    }, 80);
    const settledMeasurementIds = [220, 420].map((delay) =>
      setTimeout(measureField, delay)
    );
    return () => {
      cancelAnimationFrame(animationFrameId);
      clearTimeout(focusTimeoutId);
      settledMeasurementIds.forEach(clearTimeout);
    };
  }, [measureField]);

  React.useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardTop(event.endCoordinates.screenY);
      scheduleFieldMeasurement();
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardTop(windowHeight);
      scheduleFieldMeasurement();
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [scheduleFieldMeasurement, windowHeight]);

  React.useEffect(() => {
    scheduleFieldMeasurement();
  }, [scheduleFieldMeasurement, windowHeight, windowWidth]);

  React.useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose]);

  React.useEffect(() => {
    return () => {
      if (keepOpenTimeoutRef.current) clearTimeout(keepOpenTimeoutRef.current);
    };
  }, []);

  const inlineListMaxHeight = Math.min(360, Math.max(220, Math.round(windowHeight * 0.4)));

  const floatingLayout = React.useMemo(() => {
    if (!fieldLayout || !portalHost) return null;
    const gap = 8;
    const viewportBottom = Math.min(windowHeight, keyboardTop);
    const spaceBelow = Math.max(0, viewportBottom - fieldLayout.y - fieldLayout.height - gap);
    const spaceAbove = Math.max(0, fieldLayout.y - gap - 12);
    const shouldFlip = spaceBelow < 280 && spaceAbove > spaceBelow;
    const availableSpace = shouldFlip ? spaceAbove : spaceBelow;
    const desiredHeight = Math.min(420, Math.max(300, Math.round(windowHeight * 0.52)));
    const maxHeight = Math.max(160, Math.min(desiredHeight, availableSpace - 12));
    const rawLeft = fieldLayout.x - portalHost.hostOrigin.x;
    const maxLeft = Math.max(8, windowWidth - fieldLayout.width - 8);
    const left = Math.min(Math.max(8, rawLeft), maxLeft);
    const top = shouldFlip
      ? Math.max(8, fieldLayout.y - portalHost.hostOrigin.y - maxHeight - gap)
      : fieldLayout.y - portalHost.hostOrigin.y + fieldLayout.height + gap;
    return { left, top, width: fieldLayout.width, maxHeight };
  }, [fieldLayout, keyboardTop, portalHost, windowHeight, windowWidth]);

  const handleListInteraction = React.useCallback(() => {
    temporarilyKeepOpenOnBlur();
    Keyboard.dismiss();
  }, [temporarilyKeepOpenOnBlur]);

  const renderOptionList = (maxHeight: number): React.JSX.Element => (
    <View
      style={[
        styles.dropdown,
        {
          maxHeight,
          backgroundColor: palette.surface,
          borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
        },
      ]}
      onTouchStart={handleListInteraction}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'on-drag' : 'none'}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={handleListInteraction}
        style={{ maxHeight }}
        contentContainerStyle={styles.listContent}
      >
        {options.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ color: palette.muted, fontSize: 14, textAlign: 'center' }}>
              {t('search_no_results_title')}
            </Text>
          </View>
        ) : null}
        {options.map((item, index) => {
          const isSelected = item.value === selectedValue;
          const isActive = isSelected || (selectedValue === undefined && index === 0);
          return (
            <React.Fragment key={item.value}>
              <View
                style={[
                  styles.optionContainer,
                  {
                    backgroundColor: isActive
                      ? isDark
                        ? '#475569'
                        : palette.interactive
                      : 'transparent',
                  },
                ]}
              >
                <Pressable
                  onPressIn={handleListInteraction}
                  onPress={() => onSelect(item.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  style={({ pressed }) => [
                    styles.optionPressable,
                    {
                      opacity: pressed ? 0.82 : 1,
                      backgroundColor: pressed ? palette.interactiveHover : 'transparent',
                    },
                  ]}
                >
                  <View style={styles.optionContent}>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: 18,
                        lineHeight: 25,
                        color: palette.text,
                        fontWeight: '400',
                      }}
                    >
                      {item.label}
                    </Text>
                  </View>
                </Pressable>
              </View>
              {index < options.length - 1 ? (
                <View
                  pointerEvents="none"
                  style={[
                    styles.optionDivider,
                    {
                      backgroundColor: isDark
                        ? 'rgba(255,255,255,0.20)'
                        : 'rgba(0,0,0,0.14)',
                    },
                  ]}
                />
              ) : null}
            </React.Fragment>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <View style={styles.root}>
      <View
        ref={fieldRef}
        onLayout={scheduleFieldMeasurement}
        style={[
          styles.inputFrame,
          {
            backgroundColor: isDark ? '#334155' : '#F3F4F6',
            borderColor: palette.tint,
          },
        ]}
      >
        <TextInput
          ref={inputRef}
          autoFocus
          value={searchText}
          onChangeText={onSearchTextChange}
          onSubmitEditing={onSubmitEditing}
          onBlur={() => {
            setTimeout(() => {
              if (!keepOpenOnBlurRef.current) onClose();
            }, 0);
          }}
          placeholder={searchPlaceholder}
          placeholderTextColor={palette.muted}
          keyboardType={keyboardType}
          autoCorrect={false}
          autoCapitalize="none"
          blurOnSubmit={false}
          returnKeyType={returnKeyType}
          accessibilityLabel={accessibilityLabel}
          style={[styles.input, { color: palette.text }]}
        />
        <View pointerEvents="none" style={styles.chevron}>
          <ChevronDown size={18} strokeWidth={2.25} color={palette.muted} />
        </View>
      </View>

      {shouldFloat ? (
        floatingLayout ? (
          <OverlayPortal>
            <AnimatedSelectorList
              style={[
                styles.floatingDropdown,
                {
                  left: floatingLayout.left,
                  top: floatingLayout.top,
                  width: floatingLayout.width,
                  maxHeight: floatingLayout.maxHeight,
                },
              ]}
            >
              {renderOptionList(floatingLayout.maxHeight)}
            </AnimatedSelectorList>
          </OverlayPortal>
        ) : null
      ) : (
        <AnimatedSelectorList style={styles.inlineDropdown}>
          {renderOptionList(inlineListMaxHeight)}
        </AnimatedSelectorList>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    zIndex: 1000,
  },
  inputFrame: {
    height: 46,
    minHeight: 42,
    borderWidth: 1.5,
    borderRadius: 8,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  input: {
    height: 46,
    paddingLeft: 12,
    paddingRight: 38,
    paddingVertical: 0,
    fontSize: 16,
    lineHeight: 22,
    textAlignVertical: 'center',
  },
  chevron: {
    position: 'absolute',
    right: 10,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  inlineDropdown: {
    marginTop: 8,
  },
  floatingDropdown: {
    position: 'absolute',
    zIndex: 10001,
    elevation: 10001,
  },
  dropdown: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 24,
  },
  listContent: {
    paddingVertical: 0,
  },
  optionContainer: {
    borderRadius: 0,
    overflow: 'hidden',
  },
  optionPressable: {
    minHeight: 80,
    justifyContent: 'center',
    paddingVertical: 24,
  },
  optionContent: {
    paddingHorizontal: 20,
  },
  optionDivider: {
    height: 1,
  },
  empty: {
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
});
