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
  /**
   * Build the surface once the screen is idle and keep it mounted, hidden, while closed.
   * Opening then only reveals it and starts the native-driver transform, instead of
   * creating the whole subtree in the first animation frame. Use for small, frequently
   * opened surfaces whose closed-state rendering is cheap.
   */
  keepMounted?: boolean;
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
  keepMounted = false,
  onRequestClose,
  onShow,
  style,
  visible,
}: PortalOverlayProps): React.JSX.Element | null {
  const didShowRef = React.useRef(false);
  const hasLayoutRef = React.useRef(false);
  const onRequestCloseRef = React.useRef(onRequestClose);
  const onShowRef = React.useRef(onShow);
  const [isWarm, setIsWarm] = React.useState(false);

  React.useLayoutEffect(() => {
    onRequestCloseRef.current = onRequestClose;
    onShowRef.current = onShow;
  }, [onRequestClose, onShow]);

  if (!visible) {
    didShowRef.current = false;
  }

  React.useEffect(() => {
    if (!keepMounted || isWarm) return;
    const handle = requestIdleCallback(() => setIsWarm(true), { timeout: 2000 });
    return () => cancelIdleCallback(handle);
  }, [isWarm, keepMounted]);

  const isMounted = visible || (keepMounted && isWarm);

  React.useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onRequestCloseRef.current();
      return true;
    });
    return () => subscription.remove();
  }, [visible]);

  // A kept-mounted surface is already laid out, so onLayout will not fire again on open.
  React.useLayoutEffect(() => {
    if (!visible || didShowRef.current || !hasLayoutRef.current) return;
    didShowRef.current = true;
    onShowRef.current?.();
  }, [visible]);

  const handleLayout = React.useCallback(() => {
    hasLayoutRef.current = true;
    if (!visible || didShowRef.current) return;
    didShowRef.current = true;
    onShowRef.current?.();
  }, [visible]);

  React.useEffect(() => {
    if (!isMounted) hasLayoutRef.current = false;
  }, [isMounted]);

  if (!isMounted) return null;

  return (
    <OverlayPortal modal={visible} frozen={!visible}>
      <View
        accessibilityViewIsModal={visible}
        accessibilityElementsHidden={!visible}
        importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'}
        pointerEvents={visible ? 'auto' : 'none'}
        onLayout={handleLayout}
        style={[styles.root, style, !visible && styles.hidden]}
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
  hidden: {
    opacity: 0,
  },
});
