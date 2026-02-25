import { GripVertical, RotateCcw, X } from 'lucide-react-native';
import React from 'react';
import {
  Animated,
  LayoutAnimation,
  Platform,
  PanResponder,
  Pressable,
  Text,
  UIManager,
  View,
} from 'react-native';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

type BasicResource = { id: number; name: string };

type SelectionListVariant = 'translation' | 'tafsir';

interface VariantStyles {
  headerClassName: string;
  maxBadgeClassName: string;
  containerClassName: string;
  emptyTextClassName: string;
  itemRowClassName: string;
  removeButtonClassName: string;
}

const VARIANT_STYLES: Record<SelectionListVariant, VariantStyles> = {
  translation: {
    headerClassName: 'flex-row items-center justify-between px-2 mb-3',
    maxBadgeClassName: 'text-xs px-2.5 py-1 rounded-full bg-accent/10 text-accent dark:text-accent-dark font-medium',
    containerClassName: 'rounded-lg p-3 bg-surface dark:bg-surface-dark border border-border dark:border-border-dark',
    emptyTextClassName: 'text-center text-sm py-4 text-muted dark:text-muted-dark font-medium',
    itemRowClassName:
      'h-[54px] flex-row items-center justify-between p-3 rounded-lg bg-background dark:bg-background-dark border border-border/30 dark:border-border-dark/20',
    removeButtonClassName:
      'p-1.5 rounded-full flex-shrink-0 ml-1',
  },
  tafsir: {
    headerClassName: 'flex-row items-center justify-between px-1 mb-2',
    maxBadgeClassName: 'text-xs px-2 py-1 rounded-full bg-accent/10 text-accent dark:text-accent-dark',
    containerClassName: 'rounded-lg p-2 bg-surface dark:bg-surface-dark border border-border dark:border-border-dark',
    emptyTextClassName: 'text-center text-sm py-2 text-muted dark:text-muted-dark',
    itemRowClassName:
      'h-[46px] flex-row items-center justify-between p-2 rounded-lg bg-background dark:bg-background-dark border border-border/30 dark:border-border-dark/20',
    removeButtonClassName:
      'p-1 rounded-full flex-shrink-0 ml-1',
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

let layoutAnimationEnabled = false;

function ensureLayoutAnimationEnabled(): void {
  if (layoutAnimationEnabled) return;
  layoutAnimationEnabled = true;
  if (Platform.OS !== 'android') return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (UIManager as any).setLayoutAnimationEnabledExperimental?.(true);
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

export function ReorderableSelectionList({
  orderedSelection,
  resources,
  onRemove,
  onReorder,
  onReset,
  maxSelections,
  emptyText,
  variant,
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
  variant: SelectionListVariant;
  removeAccessibilityLabel?: string;
  onDragStateChange?: (dragging: boolean) => void;
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

  React.useEffect(() => {
    ensureLayoutAnimationEnabled();
  }, []);

  const styles = VARIANT_STYLES[variant];
  const [localOrder, setLocalOrder] = React.useState(() => normalizeOrderedSelection(orderedSelection));
  const localOrderRef = React.useRef(localOrder);
  const draggingIdRef = React.useRef<number | null>(null);
  const dragIndexRef = React.useRef(-1);
  const reorderOffsetRef = React.useRef(0);
  const dragTranslateY = React.useRef(new Animated.Value(0)).current;
  const [draggingId, setDraggingId] = React.useState<number | null>(null);

  const itemHeight = variant === 'translation' ? 54 : 46;

  React.useEffect(() => {
    setLocalOrder(normalizeOrderedSelection(orderedSelection));
  }, [orderedSelection]);

  React.useEffect(() => {
    localOrderRef.current = localOrder;
  }, [localOrder]);

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
      if (draggingIdRef.current === id) return;
      if (draggingIdRef.current !== null) return;
      const current = localOrderRef.current;
      const idx = current.indexOf(id);
      if (idx === -1) return;

      draggingIdRef.current = id;
      dragIndexRef.current = idx;
      reorderOffsetRef.current = 0;
      dragTranslateY.setValue(0);
      setDraggingId(id);
      onDragStateChange?.(true);
    },
    [canReorder, dragTranslateY, onDragStateChange]
  );

  const updateDrag = React.useCallback(
    (dy: number): void => {
      const id = draggingIdRef.current;
      if (!id) return;

      const current = localOrderRef.current;
      const currentIndex = dragIndexRef.current;
      if (currentIndex < 0) return;

      const effectiveDy = dy - reorderOffsetRef.current;
      dragTranslateY.setValue(effectiveDy);

      // Reorder should kick in quickly without needing a "long" drag.
      const threshold = itemHeight * 0.25;
      const delta = Math.trunc((effectiveDy + Math.sign(effectiveDy) * threshold) / itemHeight);
      if (delta === 0) return;

      const nextIndex = clamp(currentIndex + delta, 0, current.length - 1);
      if (nextIndex === currentIndex) return;

      const next = [...current];
      next.splice(currentIndex, 1);
      next.splice(nextIndex, 0, id);

      reorderOffsetRef.current += delta * itemHeight;
      dragIndexRef.current = nextIndex;

      LayoutAnimation.configureNext({
        duration: 120,
        update: {
          type: LayoutAnimation.Types.easeInEaseOut,
        },
      });
      setLocalOrder(next);
    },
    [dragTranslateY, itemHeight]
  );

  const endDrag = React.useCallback((): void => {
    if (draggingIdRef.current === null) return;
    const finalIds = [...localOrderRef.current];
    draggingIdRef.current = null;
    dragIndexRef.current = -1;
    reorderOffsetRef.current = 0;
    setDraggingId(null);
    onDragStateChange?.(false);

    Animated.spring(dragTranslateY, {
      toValue: 0,
      useNativeDriver: true,
      speed: 24,
      bounciness: 0,
    }).start();

    onReorder?.(finalIds);
  }, [dragTranslateY, onDragStateChange, onReorder]);

  const selectionCount = localOrder.length;

  return (
    <View>
      <View className={styles.headerClassName}>
        <Text className="text-xs font-semibold text-muted dark:text-muted-dark">
          {`MY SELECTIONS (${selectionCount}/${maxSelections})`}
        </Text>
        <View className="flex-row items-center gap-2">
          {selectionCount >= maxSelections ? (
            <Text className={styles.maxBadgeClassName}>MAX</Text>
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
              <RotateCcw size={16} color={palette.text} strokeWidth={2.5} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View className={styles.containerClassName}>
        {selectionCount === 0 ? (
          <Text className={styles.emptyTextClassName}>{emptyText}</Text>
        ) : (
          <View className="gap-2">
            {localOrder.map((id) => {
              const item = resourceById.get(id);
              const name = item?.name ?? `${id}`;

              return (
                <SelectionListRow
                  key={id}
                  id={id}
                  name={name}
                  isDragging={draggingId === id}
                  canReorder={canReorder}
                  beginDrag={beginDrag}
                  updateDrag={updateDrag}
                  endDrag={endDrag}
                  dragTranslateY={dragTranslateY}
                  itemRowClassName={styles.itemRowClassName}
                  removeButtonClassName={styles.removeButtonClassName}
                  removeAccessibilityLabel={removeAccessibilityLabel}
                  onRemove={onRemove}
                  variant={variant}
                  mutedColor={palette.muted}
                />
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

function SelectionListRow({
  id,
  name,
  isDragging,
  canReorder,
  beginDrag,
  updateDrag,
  endDrag,
  dragTranslateY,
  itemRowClassName,
  removeButtonClassName,
  removeAccessibilityLabel,
  onRemove,
  variant,
  mutedColor,
}: {
  id: number;
  name: string;
  isDragging: boolean;
  canReorder: boolean;
  beginDrag: (id: number) => void;
  updateDrag: (dy: number) => void;
  endDrag: () => void;
  dragTranslateY: Animated.Value;
  itemRowClassName: string;
  removeButtonClassName: string;
  removeAccessibilityLabel?: string;
  onRemove: (id: number) => void;
  variant: SelectionListVariant;
  mutedColor: string;
}): React.JSX.Element {
  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => canReorder,
        onMoveShouldSetPanResponder: () => canReorder,
        onStartShouldSetPanResponderCapture: () => canReorder,
        onMoveShouldSetPanResponderCapture: () => canReorder,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => beginDrag(id),
        onPanResponderMove: (_evt, gesture) => updateDrag(gesture.dy),
        onPanResponderRelease: endDrag,
        onPanResponderTerminate: endDrag,
      }),
    [beginDrag, canReorder, endDrag, id, updateDrag]
  );

  return (
    <Animated.View
      className={itemRowClassName}
      style={[
        isDragging
          ? {
              transform: [{ translateY: dragTranslateY }],
              zIndex: 20,
              elevation: 6,
            }
          : undefined,
      ]}
    >
      <View className="flex-row items-center flex-1 min-w-0 pr-1">
        <View
          className={['p-2 mr-2', canReorder ? '' : 'opacity-40'].join(' ')}
          {...panResponder.panHandlers}
          accessible
          accessibilityRole="button"
          accessibilityLabel="Reorder"
        >
          <GripVertical size={18} color={mutedColor} strokeWidth={2.5} />
        </View>
        <View className="flex-1 min-w-0">
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            className="font-medium text-sm text-foreground dark:text-foreground-dark"
          >
            {name}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center gap-1 flex-shrink-0">
        <Pressable
          onPress={() => onRemove(id)}
          disabled={isDragging}
          hitSlop={10}
          accessibilityRole="button"
          {...(removeAccessibilityLabel ? { accessibilityLabel: removeAccessibilityLabel } : {})}
          className={[removeButtonClassName, 'h-7 w-7 items-center justify-center'].join(' ')}
          style={({ pressed }) => ({ opacity: isDragging ? 0.4 : pressed ? 0.7 : 1 })}
        >
          <X size={variant === 'tafsir' ? 16 : 14} color={mutedColor} strokeWidth={2.5} />
        </Pressable>
      </View>
    </Animated.View>
  );
}
