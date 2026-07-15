import { GripVertical, RotateCcw, X } from 'lucide-react-native';
import React from 'react';
import {
  Animated,
  Easing,
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
import { useUiTranslation } from '@/providers/UiLanguageContext';

type BasicResource = { id: number; name: string };

type SelectionListVariant = 'translation' | 'tafsir';

interface VariantStyles {
  headerClassName: string;
  maxBadgeClassName: string;
  containerClassName: string;
  emptyTextClassName: string;
  itemRowClassName: string;
  removeButtonClassName: string;
  emptyContentHeight: number;
  itemHeight: number;
  rowGap: number;
}

const VARIANT_STYLES: Record<SelectionListVariant, VariantStyles> = {
  translation: {
    headerClassName: 'flex-row items-center justify-between px-2 mb-3',
    maxBadgeClassName: 'text-xs px-2.5 py-1 rounded-full font-medium',
    containerClassName: 'p-3',
    emptyTextClassName: 'text-center text-sm py-4 font-medium',
    itemRowClassName:
      'h-[54px] flex-row items-center justify-between p-3',
    removeButtonClassName:
      'p-1.5 rounded-full flex-shrink-0 ml-1',
    emptyContentHeight: 54,
    itemHeight: 54,
    rowGap: 4,
  },
  tafsir: {
    headerClassName: 'flex-row items-center justify-between px-1 mb-2',
    maxBadgeClassName: 'text-xs px-2 py-1 rounded-full',
    containerClassName: 'p-2',
    emptyTextClassName: 'text-center text-sm py-2',
    itemRowClassName:
      'h-[46px] flex-row items-center justify-between p-2',
    removeButtonClassName:
      'p-1 rounded-full flex-shrink-0 ml-1',
    emptyContentHeight: 38,
    itemHeight: 46,
    rowGap: 4,
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
  const isFabric = !!(globalThis as any).nativeFabricUIManager;
  if (isFabric) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (UIManager as any).setLayoutAnimationEnabledExperimental?.(true);
}

export function configureSelectionLayoutAnimation(): void {
  ensureLayoutAnimationEnabled();
  LayoutAnimation.configureNext({
    duration: 165,
    create: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
    update: {
      type: LayoutAnimation.Types.easeInEaseOut,
    },
    delete: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
  });
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

function getSelectionContentHeight(selectionCount: number, styles: VariantStyles): number {
  if (selectionCount <= 0) return styles.emptyContentHeight;
  return selectionCount * styles.itemHeight + Math.max(0, selectionCount - 1) * styles.rowGap;
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
  const isDark = resolvedTheme === 'dark';
  const cloudBackground = isDark ? '#1E293B' : '#FFFFFF';
  const cloudBorder = isDark ? '#334155' : '#E5E7EB';
  const rowBackground = isDark ? '#0F172A' : '#F7F9F9';
  const rowBorder = isDark ? 'rgba(51,65,85,0.2)' : 'rgba(229,231,235,0.3)';
  const { t, localizeDigits } = useUiTranslation();

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
  const contentHeight = React.useRef(
    new Animated.Value(getSelectionContentHeight(localOrder.length, styles))
  ).current;
  const [draggingId, setDraggingId] = React.useState<number | null>(null);

  const itemHeight = styles.itemHeight;

  React.useLayoutEffect(() => {
    setLocalOrder(normalizeOrderedSelection(orderedSelection));
  }, [orderedSelection]);

  React.useEffect(() => {
    localOrderRef.current = localOrder;
  }, [localOrder]);

  React.useEffect(() => {
    Animated.timing(contentHeight, {
      toValue: getSelectionContentHeight(localOrder.length, styles),
      duration: 185,
      easing: Easing.out(Easing.cubic),
      isInteraction: false,
      useNativeDriver: false,
    }).start();
  }, [contentHeight, localOrder.length, styles]);

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

      configureSelectionLayoutAnimation();
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
        <Animated.View style={{ height: contentHeight, overflow: 'hidden' }}>
          {selectionCount === 0 ? (
            <View style={{ height: styles.emptyContentHeight, justifyContent: 'center' }}>
              <Text className={styles.emptyTextClassName} style={{ color: palette.muted }}>
                {emptyText}
              </Text>
            </View>
          ) : (
            <View style={{ gap: styles.rowGap }}>
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
                    backgroundColor={rowBackground}
                    borderColor={rowBorder}
                    mutedColor={palette.muted}
                    textColor={palette.text}
                  />
                );
              })}
            </View>
          )}
        </Animated.View>
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
  backgroundColor,
  borderColor,
  mutedColor,
  textColor,
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
  backgroundColor: string;
  borderColor: string;
  mutedColor: string;
  textColor: string;
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
        {
          backgroundColor,
          borderColor,
          borderRadius: 8,
          borderWidth: 1,
        },
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
          disabled={isDragging}
          hitSlop={10}
          accessibilityRole="button"
          {...(removeAccessibilityLabel ? { accessibilityLabel: removeAccessibilityLabel } : {})}
          className={[removeButtonClassName, 'h-7 w-7 items-center justify-center'].join(' ')}
          style={({ pressed }) => ({ opacity: isDragging ? 0.4 : pressed ? 0.7 : 1 })}
        >
          <X color={mutedColor} size={variant === 'tafsir' ? 16 : 14} strokeWidth={2.25} />
        </Pressable>
      </View>
    </Animated.View>
  );
}
