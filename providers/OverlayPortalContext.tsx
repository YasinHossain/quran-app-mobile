import React from 'react';
import { StyleSheet, View } from 'react-native';

type HostOrigin = { x: number; y: number };

type OverlayPortalContextValue = {
  hostOrigin: HostOrigin;
  mount: (id: string, content: React.ReactNode) => void;
  unmount: (id: string) => void;
};

const OverlayPortalContext = React.createContext<OverlayPortalContextValue | null>(null);

export function OverlayPortalProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const hostRef = React.useRef<View>(null);
  const [hostOrigin, setHostOrigin] = React.useState<HostOrigin>({ x: 0, y: 0 });
  const [entries, setEntries] = React.useState<Map<string, React.ReactNode>>(() => new Map());

  const measureHost = React.useCallback(() => {
    hostRef.current?.measureInWindow((x, y) => {
      setHostOrigin((previous) =>
        previous.x === x && previous.y === y ? previous : { x, y }
      );
    });
  }, []);

  const mount = React.useCallback((id: string, content: React.ReactNode) => {
    setEntries((previous) => {
      const next = new Map(previous);
      next.set(id, content);
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

  return (
    <OverlayPortalContext.Provider value={contextValue}>
      <View style={styles.root}>
        {children}
        <View
          ref={hostRef}
          pointerEvents="box-none"
          onLayout={measureHost}
          style={styles.host}
        >
          {Array.from(entries.entries()).map(([id, content]) => (
            <React.Fragment key={id}>{content}</React.Fragment>
          ))}
        </View>
      </View>
    </OverlayPortalContext.Provider>
  );
}

export function OverlayPortal({ children }: { children: React.ReactNode }): React.JSX.Element | null {
  const context = React.useContext(OverlayPortalContext);
  const id = React.useId();

  React.useEffect(() => {
    if (!context) return;
    context.mount(id, children);
    return () => context.unmount(id);
  }, [children, context, id]);

  return null;
}

export function useOverlayPortalHost(): OverlayPortalContextValue | null {
  return React.useContext(OverlayPortalContext);
}

const styles = StyleSheet.create({
  root: {
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
