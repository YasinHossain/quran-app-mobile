import { SlidersHorizontal, Trash2, X } from 'lucide-react-native';
import React from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';

import { BottomSheet } from '@/components/motion/BottomSheet';
import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';

export function FolderActionsSheet({
  isOpen,
  onClose,
  onAfterClose,
  folderName,
  onEdit,
  onDelete,
}: {
  isOpen: boolean;
  onClose: () => void;
  onAfterClose?: () => void;
  folderName: string;
  onEdit: () => void;
  onDelete: () => void;
}): React.JSX.Element {
  const { height: windowHeight } = useWindowDimensions();
  const { resolvedTheme, isDark } = useAppTheme();
  const { t } = useUiTranslation();
  const palette = Colors[resolvedTheme];

  const pendingActionRef = React.useRef<(() => void) | null>(null);
  const [instantClose, setInstantClose] = React.useState(false);

  React.useEffect(() => {
    if (isOpen) pendingActionRef.current = null;
  }, [isOpen]);

  // Reset after the sheet is hidden, so opening never triggers a re-render mid-slide.
  const handleAfterClose = React.useCallback(() => {
    setInstantClose(false);
    const action = pendingActionRef.current;
    if (action) {
      pendingActionRef.current = null;
      requestAnimationFrame(() => {
        action();
      });
    }
    onAfterClose?.();
  }, [onAfterClose]);

  const maxSheetHeight = Math.max(0, Math.round(windowHeight * 0.56));

  const handleDeferredAction = React.useCallback(
    (fn: () => void) => {
      pendingActionRef.current = fn;
      setInstantClose(true);
      onClose();
    },
    [onClose]
  );

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      maxHeight={maxSheetHeight}
      closeDuration={instantClose ? 0 : undefined}
      onAfterClose={handleAfterClose}
    >
      <View className={isDark ? 'dark' : ''}>
        <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
          <View className="flex-1 pr-3">
            <Text
              numberOfLines={1}
              className="text-base font-semibold text-foreground dark:text-foreground-dark"
            >
              {folderName}
            </Text>
            <Text className="text-xs text-muted dark:text-muted-dark">{t('folder_options')}</Text>
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('close')}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            className="p-2 rounded-full"
          >
            <X size={18} strokeWidth={2.25} color={palette.muted} />
          </Pressable>
        </View>

        <View className="px-4 pt-2 pb-4">
          <View>
            <ActionRow
              icon={<SlidersHorizontal color={palette.muted} size={20} strokeWidth={2.25} />}
              label={t('edit_folder')}
              onPress={() => handleDeferredAction(onEdit)}
              accessibilityLabel={t('edit_folder')}
            />
            <ActionRow
              icon={
                <Trash2
                  color={isDark ? '#F87171' : '#DC2626'}
                  size={20}
                  strokeWidth={2.25}
                />
              }
              label={t('delete_folder')}
              onPress={() => handleDeferredAction(onDelete)}
              accessibilityLabel={t('delete_folder')}
              destructive
            />
          </View>
        </View>
      </View>
    </BottomSheet>
  );
}

function ActionRow({
  icon,
  label,
  onPress,
  accessibilityLabel,
  destructive = false,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  destructive?: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={[
        'flex-row items-center gap-4 rounded-2xl px-4 py-4',
        destructive ? 'bg-error/10 border border-error/20' : 'bg-transparent',
      ].join(' ')}
      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
    >
      <View className="h-5 w-5 items-center justify-center">{icon}</View>
      <Text
        className={[
          'text-sm font-medium',
          destructive ? 'text-error dark:text-error-dark' : 'text-foreground dark:text-foreground-dark',
        ].join(' ')}
      >
        {label}
      </Text>
    </Pressable>
  );
}
