import React from 'react';
import { StyleSheet, View } from 'react-native';

type HostOrigin = { x: number; y: number };
type OverlayPortalEntry = { content: React.ReactNode; modal: boolean };

type OverlayPortalContextValue = {
  hostOrigin: HostOrigin;
  mount: (id: string, content: React.ReactNode, modal?: boolean) => void;
  unmount: (id: string) => void;
};

const OverlayPortalContext = React.createContext<OverlayPortalContextValue | null>(null);

export function OverlayPortalProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const hostRef = React.useRef<View>(null);
  const [hostOrigin, setHostOrigin] = React.useState<HostOrigin>({ x: 0, y: 0 });
  const [entries, setEntries] = React.useState<Map<string, OverlayPortalEntry>>(() => new Map());

  const measureHost = React.useCallback(() => {
    hostRef.current?.measureInWindow((x, y) => {
      setHostOrigin((previous) =>
        previous.x === x && previous.y === y ? previous : { x, y }
      );
    });
  }, []);

  const mount = React.useCallback((id: string, content: React.ReactNode, modal = false) => {
    setEntries((previous) => {
      const next = new Map(previous);
      next.set(id, { content, modal });
      return next;
    });
  }, []);

  const unmount = React.useCallback((id: string) => {
    setEntries((previous) => {
      if (!previous.has(id)) return previous;
      const next = new Map(previous);
      next.delete(id);
      return next;
    });
  }, []);

  const contextValue = React.useMemo(
    () => ({ hostOrigin, mount, unmount }),
    [hostOrigin, mount, unmount]
  );

  React.useEffect(() => {
    const animationFrameId = requestAnimationFrame(measureHost);
    return () => cancelAnimationFrame(animationFrameId);
  }, [measureHost]);

  const hasModalEntry = Array.from(entries.values()).some((entry) => entry.modal);

  return (
    <OverlayPortalContext.Provider value={contextValue}>
      <View style={styles.root}>
        <View
          accessibilityElementsHidden={hasModalEntry}
          importantForAccessibility={hasModalEntry ? 'no-hide-descendants' : 'auto'}
          pointerEvents={hasModalEntry ? 'none' : 'auto'}
          style={styles.content}
        >
          {children}
        </View>
        <View
          ref={hostRef}
          pointerEvents="box-none"
          onLayout={measureHost}
          style={styles.host}
        >
          {Array.from(entries.entries()).map(([id, entry]) => (
            <React.Fragment key={id}>{entry.content}</React.Fragment>
          ))}
        </View>
      </View>
    </OverlayPortalContext.Provider>
  );
}

export function OverlayPortal({
  children,
  modal = false,
}: {
  children: React.ReactNode;
  modal?: boolean;
}): React.JSX.Element | null {
  const context = React.useContext(OverlayPortalContext);
  const id = React.useId();

  // Flush portal content before the next paint. This keeps transient surfaces such
  // as drawers and action sheets in the app's existing window, without adding an
  // extra blank frame while a native Modal window is being presented.
  React.useLayoutEffect(() => {
    if (!context) return;
    context.mount(id, children, modal);
  }, [children, context, id, modal]);

  React.useLayoutEffect(() => {
    if (!context) return;
    return () => context.unmount(id);
  }, [context, id]);

  return null;
}

export function useOverlayPortalHost(): OverlayPortalContextValue | null {
  return React.useContext(OverlayPortalContext);
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  host: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 10000,
    elevation: 10000,
  },
});
