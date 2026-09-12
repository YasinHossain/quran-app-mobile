import React from 'react';
import {
  BackHandler,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { OverlayPortal } from '@/providers/OverlayPortalContext';

type PortalOverlayProps = {
  children: React.ReactNode;
  onRequestClose: () => void;
  onShow?: () => void;
  style?: StyleProp<ViewStyle>;
  visible: boolean;
};

/**
 * A full-screen app-window overlay for frequently opened transient surfaces.
 *
 * React Native Modal creates and tears down a separate Android window. That is
 * useful for system-level presentation, but the window startup and full subtree
 * attachment can visibly hitch short drawers and action sheets. Keeping these
 * surfaces in the already-mounted root portal lets their native-driver transform
 * begin as soon as the overlay has been laid out.
 */
export function PortalOverlay({
  children,
  onRequestClose,
  onShow,
  style,
  visible,
}: PortalOverlayProps): React.JSX.Element | null {
  const didShowRef = React.useRef(false);
  const onRequestCloseRef = React.useRef(onRequestClose);

  React.useLayoutEffect(() => {
    onRequestCloseRef.current = onRequestClose;
  }, [onRequestClose]);

  if (!visible) {
    didShowRef.current = false;
  }

  React.useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onRequestCloseRef.current();
      return true;
    });
    return () => subscription.remove();
  }, [visible]);

  const handleLayout = React.useCallback(() => {
    if (didShowRef.current) return;
    didShowRef.current = true;
    onShow?.();
  }, [onShow]);

  if (!visible) return null;

  return (
    <OverlayPortal modal>
      <View
        accessibilityViewIsModal
        importantForAccessibility="yes"
        onLayout={handleLayout}
        style={[styles.root, style]}
      >
        {children}
      </View>
    </OverlayPortal>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
});
