import React from 'react';
import { NavigationContext } from 'expo-router/react-navigation';

// Longer than a native stack push (300 ms slide plus mount) so the fallback never lands mid-slide.
const TRANSITION_SETTLED_FALLBACK_MS = 800;

type TransitionEventSource = {
  addListener?: (type: 'transitionEnd', callback: () => void) => () => void;
};

/**
 * Becomes true once the host screen's native stack transition has ended, and stays true.
 *
 * The JS thread is idle while a native push is still sliding, so idle callbacks and list
 * batching land mid-transition and mount views on the UI thread that is drawing the slide.
 * Gate optional, offscreen work on this instead. The timer covers screens that never emit
 * `transitionEnd` (tab scenes) and components that mount after the transition finished.
 */
export function useScreenTransitionSettled(): boolean {
  const navigation = React.useContext(NavigationContext);
  const [isSettled, setIsSettled] = React.useState(false);

  React.useEffect(() => {
    if (isSettled) return;
    const settle = () => setIsSettled(true);
    const unsubscribe = (navigation as TransitionEventSource | undefined)?.addListener?.(
      'transitionEnd',
      settle
    );
    const fallback = setTimeout(settle, TRANSITION_SETTLED_FALLBACK_MS);
    return () => {
      unsubscribe?.();
      clearTimeout(fallback);
    };
  }, [isSettled, navigation]);

  return isSettled;
}
