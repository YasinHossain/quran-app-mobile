import Feather from '@expo/vector-icons/Feather';
import { GripVertical, RotateCcw } from 'lucide-react-native';
import React from 'react';
import { PanResponder, Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LayoutAnimationConfig,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';

type BasicResource = { id: number; name: string };

const SELECTION_STYLES = {
  headerClassName: 'flex-row items-center justify-between px-2 mb-3',
  maxBadgeClassName: 'text-xs px-2.5 py-1 rounded-full font-medium',
  containerClassName: 'p-3',
  emptyTextClassName: 'text-center text-sm py-4 font-medium',
  itemRowClassName: 'h-[54px] flex-row items-center justify-between p-3',
  removeButtonClassName: 'p-1.5 rounded-full flex-shrink-0 ml-1',
  emptyContentHeight: 54,
  itemHeight: 54,
  rowGap: 4,
};

// Distance between the tops of two adjacent rows.
const ROW_PITCH = SELECTION_STYLES.itemHeight + SELECTION_STYLES.rowGap;
const NO_ACTIVE_ROW = -1;
const SETTLE_TIMING = { duration: 180, easing: Easing.out(Easing.cubic) };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeOrderedSelection(ids: number[]): number[] {
  const normalized: number[] = [];
  const seen = new Set<number>();

  for (const raw of ids ?? []) {
    if (!Number.isFinite(raw)) continue;
    const id = Math.trunc(raw);
    if (id <= 0) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }

  return normalized;
}

function getSelectionContentHeight(selectionCount: number): number {
  if (selectionCount <= 0) return SELECTION_STYLES.emptyContentHeight;
  return (
    selectionCount * SELECTION_STYLES.itemHeight +
    Math.max(0, selectionCount - 1) * SELECTION_STYLES.rowGap
  );
}

function areOrdersEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/**
 * Rows are absolutely positioned and driven by shared values, so dragging and the
 * neighbours sliding out of the way never re-render React. The new order is
 * committed once, when the drag ends.
 */
export function ReorderableSelectionList({
  orderedSelection,
  resources,
  onRemove,
  onReorder,
  onReset,
  maxSelections,
  emptyText,
  removeAccessibilityLabel,
  onDragStateChange,
}: {
  orderedSelection: number[];
  resources: BasicResource[];
  onRemove: (id: number) => void;
  onReorder?: (ids: number[]) => void;
  onReset?: () => void;
  maxSelections: number;
  emptyText: string;
  removeAccessibilityLabel?: string;
  onDragStateChange?: (dragging: boolean) => void;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const isDark = resolvedTheme === 'dark';
  const cloudBackground = isDark ? '#1E293B' : '#FFFFFF';
  const cloudBorder = isDark ? '#334155' : '#E5E7EB';
  const rowBackground = isDark ? '#0F172A' : '#F7F9F9';
  const rowBorder = isDark ? 'rgba(51,65,85,0.2)' : 'rgba(229,231,235,0.3)';
  const { t, localizeDigits } = useUiTranslation();

  const styles = SELECTION_STYLES;
  const [localOrder, setLocalOrder] = React.useState(() => normalizeOrderedSelection(orderedSelection));
  // JS-side mirror of `order` used to compute swaps while dragging.
  const orderRef = React.useRef(localOrder);
  const dragStartOrderRef = React.useRef<number[]>([]);
  const draggingIdRef = React.useRef<number | null>(null);
  const dragStartTopRef = React.useRef(0);

  const order = useSharedValue(localOrder);
  const activeId = useSharedValue(NO_ACTIVE_ROW);
  const dragTop = useSharedValue(0);
  const contentHeight = useSharedValue(getSelectionContentHeight(localOrder.length));

  React.useLayoutEffect(() => {
    setLocalOrder(normalizeOrderedSelection(orderedSelection));
  }, [orderedSelection]);

  React.useEffect(() => {
    if (draggingIdRef.current !== null) return;
    orderRef.current = localOrder;
    order.value = localOrder;
  }, [localOrder, order]);

  React.useEffect(() => {
    contentHeight.value = withTiming(getSelectionContentHeight(localOrder.length), {
      duration: 185,
      easing: Easing.out(Easing.cubic),
    });
  }, [contentHeight, localOrder.length]);

  const contentHeightStyle = useAnimatedStyle(() => ({ height: contentHeight.value }));

  const resourceById = React.useMemo(() => {
    const map = new Map<number, BasicResource>();
    for (const resource of resources) {
      map.set(resource.id, resource);
    }
    return map;
  }, [resources]);

  const canReorder = typeof onReorder === 'function' && localOrder.length > 1;

  const beginDrag = React.useCallback(
    (id: number): void => {
      if (!canReorder) return;
      if (draggingIdRef.current !== null) return;
      const idx = orderRef.current.indexOf(id);
      if (idx === -1) return;

      draggingIdRef.current = id;
      dragStartOrderRef.current = orderRef.current;
      dragStartTopRef.current = idx * ROW_PITCH;
      dragTop.value = dragStartTopRef.current;
      activeId.value = id;
      onDragStateChange?.(true);
    },
    [activeId, canReorder, dragTop, onDragStateChange]
  );

  const updateDrag = React.useCallback(
    (dy: number): void => {
      const id = draggingIdRef.current;
      if (id === null) return;

      const current = orderRef.current;
      const maxTop = (current.length - 1) * ROW_PITCH;
      const top = clamp(dragStartTopRef.current + dy, 0, maxTop);
      dragTop.value = top;

      // Swap as soon as the dragged row's centre crosses into a neighbour's slot.
      const nextIndex = clamp(Math.round(top / ROW_PITCH), 0, current.length - 1);
      const currentIndex = current.indexOf(id);
      if (currentIndex === -1 || nextIndex === currentIndex) return;

      const next = [...current];
      next.splice(currentIndex, 1);
      next.splice(nextIndex, 0, id);
      orderRef.current = next;
      order.value = next;
    },
    [dragTop, order]
  );

  const endDrag = React.useCallback((): void => {
    const id = draggingIdRef.current;
    if (id === null) return;
    const finalIds = orderRef.current;
    draggingIdRef.current = null;

    dragTop.value = withTiming(finalIds.indexOf(id) * ROW_PITCH, SETTLE_TIMING, (finished) => {
      // A new drag interrupts this settle and owns `activeId`.
      if (finished) activeId.value = NO_ACTIVE_ROW;
    });
    onDragStateChange?.(false);

    if (!areOrdersEqual(finalIds, dragStartOrderRef.current)) {
      setLocalOrder(finalIds);
      onReorder?.(finalIds);
    }
  }, [activeId, dragTop, onDragStateChange, onReorder]);

  const handleRemove = React.useCallback(
    (id: number): void => {
      if (draggingIdRef.current !== null) return;
      onRemove(id);
    },
    [onRemove]
  );

  const selectionCount = localOrder.length;
  const selectionsLabel = t('my_selections', { fallback: 'MY SELECTIONS' }).toUpperCase();
  const localizedCountStr = localizeDigits(`${selectionCount}/${maxSelections}`);

  return (
    <View>
      <View className={styles.headerClassName}>
        <Text className="text-xs font-semibold" style={{ color: palette.muted }}>
          {`${selectionsLabel} (${localizedCountStr})`}
        </Text>
        <View className="flex-row items-center gap-2">
          {selectionCount >= maxSelections ? (
            <Text
              className={styles.maxBadgeClassName}
              style={{ backgroundColor: `${palette.tint}1A`, color: palette.tint }}
            >
              MAX
            </Text>
          ) : null}

          {onReset ? (
            <Pressable
              onPress={onReset}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Reset to Default"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              className="p-1.5 rounded-full"
            >
              <RotateCcw color={palette.text} size={16} strokeWidth={2.25} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View
        className={styles.containerClassName}
        style={{
          backgroundColor: cloudBackground,
          borderColor: cloudBorder,
          borderRadius: 8,
          borderWidth: 1,
        }}
      >
        <Animated.View style={[{ overflow: 'hidden' }, contentHeightStyle]}>
          {selectionCount === 0 ? (
            <View style={{ height: styles.emptyContentHeight, justifyContent: 'center' }}>
              <Text className={styles.emptyTextClassName} style={{ color: palette.muted }}>
                {emptyText}
              </Text>
            </View>
          ) : (
            <LayoutAnimationConfig skipEntering>
              {localOrder.map((id, index) => {
                const item = resourceById.get(id);
                const name = item?.name ?? `${id}`;

                return (
                  <SelectionListRow
                    key={id}
                    id={id}
                    initialIndex={index}
                    name={name}
                    canReorder={canReorder}
                    order={order}
                    activeId={activeId}
                    dragTop={dragTop}
                    beginDrag={beginDrag}
                    updateDrag={updateDrag}
                    endDrag={endDrag}
                    itemRowClassName={styles.itemRowClassName}
                    removeButtonClassName={styles.removeButtonClassName}
                    removeAccessibilityLabel={removeAccessibilityLabel}
                    onRemove={handleRemove}
                    backgroundColor={rowBackground}
                    borderColor={rowBorder}
                    mutedColor={palette.muted}
                    textColor={palette.text}
                  />
                );
              })}
            </LayoutAnimationConfig>
          )}
        </Animated.View>
      </View>
    </View>
  );
}

function SelectionListRow({
  id,
  initialIndex,
  name,
  canReorder,
  order,
  activeId,
  dragTop,
  beginDrag,
  updateDrag,
  endDrag,
  itemRowClassName,
  removeButtonClassName,
  removeAccessibilityLabel,
  onRemove,
  backgroundColor,
  borderColor,
  mutedColor,
  textColor,
}: {
  id: number;
  initialIndex: number;
  name: string;
  canReorder: boolean;
  order: SharedValue<number[]>;
  activeId: SharedValue<number>;
  dragTop: SharedValue<number>;
  beginDrag: (id: number) => void;
  updateDrag: (dy: number) => void;
  endDrag: () => void;
  itemRowClassName: string;
  removeButtonClassName: string;
  removeAccessibilityLabel?: string;
  onRemove: (id: number) => void;
  backgroundColor: string;
  borderColor: string;
  mutedColor: string;
  textColor: string;
}): React.JSX.Element {
  const slotTop = useSharedValue(initialIndex * ROW_PITCH);

  useAnimatedReaction(
    () => order.value.indexOf(id),
    (nextIndex, previousIndex) => {
      if (nextIndex < 0 || nextIndex === previousIndex) return;
      const target = nextIndex * ROW_PITCH;
      // The dragged row follows `dragTop`; its slot only needs to be ready for release.
      slotTop.value = activeId.value === id ? target : withTiming(target, SETTLE_TIMING);
    }
  );

  const rowStyle = useAnimatedStyle(() => {
    const isActive = activeId.value === id;
    return {
      transform: [{ translateY: isActive ? dragTop.value : slotTop.value }],
      zIndex: isActive ? 20 : 0,
      elevation: isActive ? 6 : 0,
      shadowOpacity: isActive ? 0.14 : 0,
    };
  });

  // Keep one responder per row for its lifetime; recreating it mid-gesture resets `dy`.
  const handlersRef = React.useRef({ beginDrag, updateDrag, endDrag, canReorder });
  handlersRef.current = { beginDrag, updateDrag, endDrag, canReorder };

  const panResponder = React.useMemo(() => {
    const shouldSet = () => handlersRef.current.canReorder;
    return PanResponder.create({
      onStartShouldSetPanResponder: shouldSet,
      onMoveShouldSetPanResponder: shouldSet,
      onStartShouldSetPanResponderCapture: shouldSet,
      onMoveShouldSetPanResponderCapture: shouldSet,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => handlersRef.current.beginDrag(id),
      onPanResponderMove: (_evt, gesture) => handlersRef.current.updateDrag(gesture.dy),
      onPanResponderRelease: () => handlersRef.current.endDrag(),
      onPanResponderTerminate: () => handlersRef.current.endDrag(),
    });
  }, [id]);

  return (
    <Animated.View
      entering={FadeIn.duration(165)}
      exiting={FadeOut.duration(165)}
      className={itemRowClassName}
      style={[
        {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          backgroundColor,
          borderColor,
          borderRadius: 8,
          borderWidth: 1,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 3 },
          shadowRadius: 6,
        },
        rowStyle,
      ]}
    >
      <View className="flex-row items-center flex-1 min-w-0 pr-1">
        <View
          className={['p-2 mr-2', canReorder ? '' : 'opacity-40'].join(' ')}
          {...panResponder.panHandlers}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
          accessible
          accessibilityRole="button"
          accessibilityLabel="Reorder"
        >
          <GripVertical color={mutedColor} size={18} strokeWidth={2.25} />
        </View>
        <View className="flex-1 min-w-0">
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            className="font-medium text-sm"
            style={{ color: textColor }}
          >
            {name}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center gap-1 flex-shrink-0">
        <Pressable
          onPress={() => onRemove(id)}
          hitSlop={10}
          accessibilityRole="button"
          {...(removeAccessibilityLabel ? { accessibilityLabel: removeAccessibilityLabel } : {})}
          className={[removeButtonClassName, 'h-7 w-7 items-center justify-center'].join(' ')}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Feather name="x" color={mutedColor} size={14} />
        </Pressable>
      </View>
    </Animated.View>
  );
}
