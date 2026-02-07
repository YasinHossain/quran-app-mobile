import React from 'react';
import { Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

type AnchorLayout = { x: number; y: number; width: number; height: number };

export function AnchoredDropdownModal({
  isOpen,
  onClose,
  anchorRef,
  maxHeight = 360,
  horizontalInset = 16,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<View>;
  maxHeight?: number;
  horizontalInset?: number;
  children: React.ReactNode;
}): React.JSX.Element | null {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [anchorLayout, setAnchorLayout] = React.useState<AnchorLayout | null>(null);

  const measure = React.useCallback(() => {
    const node = anchorRef.current;
    if (!node) return;
    node.measureInWindow((x, y, width, height) => {
      setAnchorLayout({ x, y, width, height });
    });
  }, [anchorRef]);

  React.useEffect(() => {
    if (!isOpen) return;
    const raf = requestAnimationFrame(measure);
    const timeout = setTimeout(measure, 80);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
    };
  }, [isOpen, measure]);

  React.useEffect(() => {
    if (!isOpen) return;
    measure();
  }, [isOpen, measure, windowHeight, windowWidth]);

  if (!isOpen) return null;

  const margin = 6;
  const availableWidth = Math.max(0, windowWidth - horizontalInset * 2);
  const width = anchorLayout ? Math.min(anchorLayout.width, availableWidth) : availableWidth;
  const left = anchorLayout
    ? Math.min(Math.max(horizontalInset, anchorLayout.x), Math.max(horizontalInset, windowWidth - horizontalInset - width))
    : horizontalInset;

  const spaceBelow = anchorLayout
    ? Math.max(0, windowHeight - (anchorLayout.y + anchorLayout.height) - horizontalInset)
    : 0;
  const spaceAbove = anchorLayout ? Math.max(0, anchorLayout.y - horizontalInset) : 0;
  const wantsHeight = Math.min(maxHeight, Math.max(160, Math.round(windowHeight * 0.5)));

  const shouldFlip = anchorLayout ? spaceBelow < 220 && spaceAbove > spaceBelow : false;
  const maxHeightClamped = Math.max(160, Math.min(wantsHeight, (shouldFlip ? spaceAbove : spaceBelow) - margin));

  const top = anchorLayout
    ? shouldFlip
      ? Math.max(horizontalInset, anchorLayout.y - maxHeightClamped - margin)
      : Math.min(windowHeight - horizontalInset - maxHeightClamped, anchorLayout.y + anchorLayout.height + margin)
    : horizontalInset;

  return (
    <Modal
      transparent
      visible
      onRequestClose={onClose}
      animationType="none"
      statusBarTranslucent
      hardwareAccelerated
      {...(Platform.OS === 'ios' ? { presentationStyle: 'overFullScreen' as const } : {})}
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close dropdown"
      />
      {anchorLayout ? (
        <View style={[styles.dropdown, { left, top, width, maxHeight: maxHeightClamped }]}>
          {children}
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  dropdown: {
    position: 'absolute',
    zIndex: 1000,
    elevation: 16,
  },
});

