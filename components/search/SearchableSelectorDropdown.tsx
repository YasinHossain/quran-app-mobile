import { ChevronDown } from 'lucide-react-native';
import React from 'react';
import {
  Animated,
  BackHandler,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type StyleProp,
  type TextInputProps,
  type TextInputSubmitEditingEvent,
  type ViewStyle,
  useWindowDimensions,
  View,
  type TextInputInstance,
  type ViewInstance,
} from 'react-native';
import { KeyboardController, KeyboardEvents } from 'react-native-keyboard-controller';
import { useReducedMotion } from 'react-native-reanimated';

import { useDialogKeyboard } from '@/components/motion/Dialog';
import { modalSpringConfig } from '@/components/motion/modalTransition';
import Colors from '@/constants/Colors';
import { OverlayPortal, useOverlayPortalHost } from '@/providers/OverlayPortalContext';
import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';

export type SearchableSelectorOption = {
  value: number;
  label: string;
};

/** The field's resting frame, relative to the overlay portal host. */
type FieldLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const FLOATING_GAP = 8;
/** Enough 45 pt rows to fill the tallest list; the rest render in later batches. */
const OPTION_LIST_INITIAL_ROWS = 10;
/**
 * After the first paint, keep rendering well ahead of the viewport: a short window left rows
 * blank while they mounted during a quick fling. 114 surahs (or up to 286 verses) are cheap
 * once the open animation has started.
 */
const OPTION_LIST_BATCH_ROWS = 24;
const OPTION_LIST_WINDOW_SIZE = 21;

const optionKey = (option: SearchableSelectorOption): string => String(option.value);
/** A floating list opens below its field unless less than this fits above the keyboard. */
const FLOATING_MIN_HEIGHT = 160;

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
    // A spring, not native timing, so the reveal advances on every frame of 90/120 Hz screens.
    Animated.spring(progress, {
      toValue: 1,
      ...modalSpringConfig('open', 200),
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
  onBlurClose,
  onSubmitEditing,
  keyboardType = 'default',
  returnKeyType = 'done',
  floating = false,
  handingOff = false,
  dismissKeyboardOnListTouch = false,
}: {
  accessibilityLabel: string;
  searchPlaceholder: string;
  options: SearchableSelectorOption[];
  selectedValue: number | undefined;
  searchText: string;
  onSearchTextChange: (value: string) => void;
  onSelect: (value: number) => void;
  onClose: () => void;
  onBlurClose: () => void;
  onSubmitEditing: (
    event: TextInputSubmitEditingEvent
  ) => void;
  keyboardType?: TextInputProps['keyboardType'];
  returnKeyType?: TextInputProps['returnKeyType'];
  floating?: boolean;
  /**
   * A selection was made and the next field is about to take focus: hide the list and close on
   * blur. The input stays mounted and focused until then, so the keyboard carries over instead of
   * hiding (unmounting a focused input blurs it) and showing again for the next field.
   */
  handingOff?: boolean;
  /**
   * Hide the keyboard (keeping the input focused, so the list stays open) as soon as the list is
   * touched. For selectors outside a dialog, where nothing moves when the keyboard hides.
   */
  dismissKeyboardOnListTouch?: boolean;
}): React.JSX.Element {
  const { resolvedTheme, isDark } = useAppTheme();
  const { t } = useUiTranslation();
  const palette = Colors[resolvedTheme];
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const portalHost = useOverlayPortalHost();
  const dialogKeyboard = useDialogKeyboard();
  const dialogRootRef = dialogKeyboard?.rootRef;
  const fieldRef = React.useRef<ViewInstance>(null);
  const inputRef = React.useRef<TextInputInstance>(null);
  const keepOpenOnBlurRef = React.useRef(false);
  const keepOpenTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const handingOffRef = React.useRef(handingOff);
  handingOffRef.current = handingOff;
  const [fieldLayout, setFieldLayout] = React.useState<FieldLayout | null>(null);
  // `willShow` reports the destination height as the keyboard starts to move, so the list is
  // placed once for where everything will settle.
  const [keyboardHeight, setKeyboardHeight] = React.useState(() =>
    KeyboardController.isVisible() ? KeyboardController.state().height : 0
  );

  const shouldFloat = floating && portalHost !== null;

  const measureField = React.useCallback(() => {
    const field = fieldRef.current;
    if (!field) return;
    const apply = (x: number, y: number, width: number, height: number) => {
      setFieldLayout((previous) =>
        previous &&
        previous.x === x &&
        previous.y === y &&
        previous.width === width &&
        previous.height === height
          ? previous
          : { x, y, width, height }
      );
    };
    const dialogRoot = dialogRootRef?.current;
    if (dialogRoot) {
      // Inside a dialog, measure against its untransformed root (which fills the portal host):
      // the resting position, independent of the dialog's entrance and keyboard lift.
      field.measureLayout(dialogRoot, apply, () => {});
      return;
    }
    field.measureInWindow((x, y, width, height) =>
      apply(x - (portalHost?.hostOrigin.x ?? 0), y - (portalHost?.hostOrigin.y ?? 0), width, height)
    );
  }, [dialogRootRef, portalHost?.hostOrigin.x, portalHost?.hostOrigin.y]);

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
    // Fallbacks for a missed `autoFocus`. Focusing an input that already has focus asks Android
    // for the keyboard again mid-animation, which cancels the app's per-frame keyboard insets
    // animation: the dialog then stood still and jumped once the keyboard had finished.
    const focusIfNeeded = () => {
      if (!inputRef.current?.isFocused()) inputRef.current?.focus();
    };
    const animationFrameId = requestAnimationFrame(() => {
      measureField();
      focusIfNeeded();
    });
    const focusTimeoutId = setTimeout(() => {
      measureField();
      focusIfNeeded();
    }, 80);
    const settledMeasurementIds = [220, 420].map((delay) =>
      setTimeout(() => measureField(), delay)
    );
    return () => {
      cancelAnimationFrame(animationFrameId);
      clearTimeout(focusTimeoutId);
      settledMeasurementIds.forEach(clearTimeout);
    };
  }, [measureField]);

  React.useEffect(() => {
    const subscriptions = [
      KeyboardEvents.addListener('keyboardWillShow', (event) => setKeyboardHeight(event.height)),
      KeyboardEvents.addListener('keyboardWillHide', () => setKeyboardHeight(0)),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, []);

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
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    };
  }, []);

  const inlineListMaxHeight = Math.min(360, Math.max(220, Math.round(windowHeight * 0.4)));

  const liftTarget = dialogKeyboard?.liftTarget ?? 0;
  const floatingLayout = React.useMemo(() => {
    if (!fieldLayout || !portalHost) return null;
    const gap = FLOATING_GAP;
    // Decide from where the field and keyboard will settle; a dialog lifts the field with it.
    const settledFieldTop = fieldLayout.y - liftTarget + portalHost.hostOrigin.y;
    const keyboardTop = windowHeight - keyboardHeight;
    const spaceBelow = Math.max(0, keyboardTop - settledFieldTop - fieldLayout.height - gap);
    const spaceAbove = Math.max(0, settledFieldTop - gap - 12);
    // Opening upwards covered the dialog title above the field, so prefer below while it fits.
    const flipped = spaceBelow < FLOATING_MIN_HEIGHT + 12 && spaceAbove > spaceBelow;
    const availableSpace = flipped ? spaceAbove : spaceBelow;
    const desiredHeight = Math.min(420, Math.max(300, Math.round(windowHeight * 0.52)));
    const maxHeight = Math.max(FLOATING_MIN_HEIGHT, Math.min(desiredHeight, availableSpace - 12));
    const maxLeft = Math.max(8, windowWidth - fieldLayout.width - 8);
    const left = Math.min(Math.max(8, fieldLayout.x), maxLeft);
    // Resting position; a dialog's lift is applied by the shared native transform below.
    const top = flipped
      ? Math.max(8 + liftTarget, fieldLayout.y - maxHeight - gap)
      : fieldLayout.y + fieldLayout.height + gap;
    return { left, top, width: fieldLayout.width, maxHeight };
  }, [fieldLayout, keyboardHeight, liftTarget, portalHost, windowHeight, windowWidth]);

  // Inside a dialog, touching the list keeps the keyboard up. Dismissing it there dropped the
  // dialog (and the list with it) back to the centre under the user's finger; it now settles
  // once, after a selection. Elsewhere the caller can opt into hiding it for a larger list.
  const handleListInteraction = React.useCallback(() => {
    temporarilyKeepOpenOnBlur();
    if (dismissKeyboardOnListTouch && KeyboardController.isVisible()) {
      void KeyboardController.dismiss({ keepFocus: true });
    }
  }, [dismissKeyboardOnListTouch, temporarilyKeepOpenOnBlur]);

  const renderOption = ({
    item,
    index,
  }: {
    item: SearchableSelectorOption;
    index: number;
  }): React.JSX.Element => {
    const isSelected = item.value === selectedValue;
    const isActive = isSelected || (selectedValue === undefined && index === 0);
    return (
      <>
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
                  fontSize: 17,
                  lineHeight: 24,
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
      </>
    );
  };

  const emptyOptions = (
    <View style={styles.empty}>
      <Text style={{ color: palette.muted, fontSize: 14, textAlign: 'center' }}>
        {t('search_no_results_title')}
      </Text>
    </View>
  );

  const renderOptionList = (maxHeight: number, virtualized: boolean): React.JSX.Element => (
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
      {/*
        The floating list is virtualized: mounting all 114 surah rows at once took ~200 ms of
        native view creation on a budget phone, right as the keyboard and dialog start to move.
        Inline lists sit inside their screen's ScrollView, where a FlatList would be a nested
        virtualized list.
      */}
      {virtualized ? (
        <FlatList
          data={options}
          renderItem={renderOption}
          keyExtractor={optionKey}
          extraData={selectedValue}
          initialNumToRender={OPTION_LIST_INITIAL_ROWS}
          maxToRenderPerBatch={OPTION_LIST_BATCH_ROWS}
          windowSize={OPTION_LIST_WINDOW_SIZE}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={handleListInteraction}
          style={{ maxHeight }}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={emptyOptions}
        />
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={handleListInteraction}
          style={{ maxHeight }}
          contentContainerStyle={styles.listContent}
        >
          {options.length === 0 ? emptyOptions : null}
          {options.map((item, index) => (
            <React.Fragment key={item.value}>{renderOption({ item, index })}</React.Fragment>
          ))}
        </ScrollView>
      )}
    </View>
  );

  return (
    <View style={styles.root}>
      <View
        ref={fieldRef}
        onLayout={() => scheduleFieldMeasurement()}
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
            if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
            blurTimeoutRef.current = setTimeout(() => {
              blurTimeoutRef.current = null;
              // A removed or refocused input must not close a newer selector.
              if (
                inputRef.current &&
                !inputRef.current.isFocused() &&
                (handingOffRef.current || !keepOpenOnBlurRef.current)
              ) {
                onBlurClose();
              }
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

      {handingOff ? null : shouldFloat ? (
        floatingLayout ? (
          <OverlayPortal>
            <Animated.View
              pointerEvents="box-none"
              style={[
                styles.floatingDropdown,
                {
                  left: floatingLayout.left,
                  top: floatingLayout.top,
                  width: floatingLayout.width,
                },
                // The same native node that lifts the dialog, so the list moves with its field.
                dialogKeyboard && { transform: [{ translateY: dialogKeyboard.translateY }] },
              ]}
            >
              <AnimatedSelectorList style={{ maxHeight: floatingLayout.maxHeight }}>
                {renderOptionList(floatingLayout.maxHeight, true)}
              </AnimatedSelectorList>
            </Animated.View>
          </OverlayPortal>
        ) : null
      ) : (
        <AnimatedSelectorList style={styles.inlineDropdown}>
          {renderOptionList(inlineListMaxHeight, false)}
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
    justifyContent: 'center',
  },
  // Row sizing lives on the inner View: sizing set on the Pressable's style
  // callback was not applied on device, collapsing rows to the text height.
  optionContent: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  optionDivider: {
    height: 1,
  },
  empty: {
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
});
