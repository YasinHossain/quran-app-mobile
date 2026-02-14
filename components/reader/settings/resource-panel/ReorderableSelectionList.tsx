import { GripVertical, RotateCcw, X } from 'lucide-react-native';
import React from 'react';
import { Animated, PanResponder, Pressable, Text, View } from 'react-native';

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
      'flex-row items-center justify-between p-3 rounded-lg bg-background dark:bg-background-dark border border-border dark:border-border-dark',
    removeButtonClassName:
      'p-1.5 rounded-full flex-shrink-0 ml-2',
  },
  tafsir: {
    headerClassName: 'flex-row items-center justify-between px-1 mb-2',
    maxBadgeClassName: 'text-xs px-2 py-1 rounded-full bg-accent/10 text-accent dark:text-accent-dark',
    containerClassName: 'rounded-lg p-2 bg-background dark:bg-background-dark border border-border dark:border-border-dark',
    emptyTextClassName: 'text-center text-sm py-2 text-muted dark:text-muted-dark',
    itemRowClassName:
      'flex-row items-center justify-between p-2 rounded-lg bg-background dark:bg-background-dark border border-border dark:border-border-dark',
    removeButtonClassName:
      'p-1 rounded-full flex-shrink-0 ml-2',
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
}): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

  const styles = VARIANT_STYLES[variant];
  const [localOrder, setLocalOrder] = React.useState(orderedSelection);
  const localOrderRef = React.useRef(localOrder);
  const draggingIdRef = React.useRef<number | null>(null);
  const dragIndexRef = React.useRef(-1);
  const reorderOffsetRef = React.useRef(0);
  const dragTranslateY = React.useRef(new Animated.Value(0)).current;
  const [draggingId, setDraggingId] = React.useState<number | null>(null);

  const itemHeight = variant === 'translation' ? 54 : 46;

  React.useEffect(() => {
    setLocalOrder(orderedSelection);
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
      const current = localOrderRef.current;
      const idx = current.indexOf(id);
      if (idx === -1) return;

      draggingIdRef.current = id;
      dragIndexRef.current = idx;
      reorderOffsetRef.current = 0;
      dragTranslateY.setValue(0);
      setDraggingId(id);
    },
    [canReorder, dragTranslateY]
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

      const delta = Math.round(effectiveDy / itemHeight);
      if (delta === 0) return;

      const nextIndex = clamp(currentIndex + delta, 0, current.length - 1);
      if (nextIndex === currentIndex) return;

      const next = [...current];
      next.splice(currentIndex, 1);
      next.splice(nextIndex, 0, id);

      reorderOffsetRef.current += delta * itemHeight;
      dragIndexRef.current = nextIndex;
      setLocalOrder(next);
    },
    [dragTranslateY, itemHeight]
  );

  const endDrag = React.useCallback((): void => {
    const finalIds = [...localOrderRef.current];
    draggingIdRef.current = null;
    dragIndexRef.current = -1;
    reorderOffsetRef.current = 0;
    setDraggingId(null);

    Animated.spring(dragTranslateY, {
      toValue: 0,
      useNativeDriver: true,
      speed: 24,
      bounciness: 0,
    }).start();

    onReorder?.(finalIds);
  }, [dragTranslateY, onReorder]);

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
            {localOrder.map((id, index) => {
              const item = resourceById.get(id);
              const name = item?.name ?? `${id}`;
              const isDragging = draggingId === id;

              const handlePanResponder = React.useMemo(() => {
                if (!canReorder) return null;
                return PanResponder.create({
                  onStartShouldSetPanResponder: () => false,
                  onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dy) > 4,
                  onPanResponderGrant: () => beginDrag(id),
                  onPanResponderMove: (_evt, gesture) => updateDrag(gesture.dy),
                  onPanResponderRelease: endDrag,
                  onPanResponderTerminate: endDrag,
                });
              }, [beginDrag, canReorder, endDrag, id, updateDrag]);

              return (
                <Animated.View
                  key={id}
                  className={styles.itemRowClassName}
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
                  <View className="flex-row items-center flex-1 min-w-0">
                    <View
                      className={['p-1 mr-2', canReorder ? '' : 'opacity-40'].join(' ')}
                      {...(handlePanResponder ? handlePanResponder.panHandlers : {})}
                      accessibilityRole="button"
                      accessibilityLabel="Reorder"
                    >
                      <GripVertical size={18} color={palette.muted} strokeWidth={2.5} />
                    </View>
                    <Text
                      numberOfLines={1}
                      className="font-medium text-sm truncate text-foreground dark:text-foreground-dark"
                    >
                      {name}
                    </Text>
                  </View>

                  <View className="flex-row items-center gap-1 flex-shrink-0">
                    <Pressable
                      onPress={() => onRemove(id)}
                      disabled={isDragging}
                      hitSlop={10}
                      accessibilityRole="button"
                      {...(removeAccessibilityLabel ? { accessibilityLabel: removeAccessibilityLabel } : {})}
                      className={styles.removeButtonClassName}
                      style={({ pressed }) => ({ opacity: isDragging ? 0.4 : pressed ? 0.7 : 1 })}
                    >
                      <X size={variant === 'tafsir' ? 16 : 14} color={palette.muted} strokeWidth={2.5} />
                    </Pressable>
                  </View>
                </Animated.View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}
