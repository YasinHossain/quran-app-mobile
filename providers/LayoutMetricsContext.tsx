import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

type LayoutMetricsContextValue = {
  bottomTabBarHeight: number;
  setBottomTabBarHeight: (height: number) => void;
  audioPlayerBarHeight: number;
  setAudioPlayerBarHeight: (height: number) => void;
};

const LayoutMetricsContext = createContext<LayoutMetricsContextValue | undefined>(undefined);

function normalizeMetric(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

export function LayoutMetricsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [bottomTabBarHeight, setBottomTabBarHeightState] = useState(0);
  const [audioPlayerBarHeight, setAudioPlayerBarHeightState] = useState(0);

  const setBottomTabBarHeight = useCallback((height: number) => {
    const next = normalizeMetric(height);
    setBottomTabBarHeightState((prev) => (prev === next ? prev : next));
  }, []);

  const setAudioPlayerBarHeight = useCallback((height: number) => {
    const next = normalizeMetric(height);
    setAudioPlayerBarHeightState((prev) => (prev === next ? prev : next));
  }, []);

  const value = useMemo<LayoutMetricsContextValue>(
    () => ({
      bottomTabBarHeight,
      setBottomTabBarHeight,
      audioPlayerBarHeight,
      setAudioPlayerBarHeight,
    }),
    [audioPlayerBarHeight, bottomTabBarHeight, setAudioPlayerBarHeight, setBottomTabBarHeight]
  );

  return <LayoutMetricsContext.Provider value={value}>{children}</LayoutMetricsContext.Provider>;
}

export function useLayoutMetrics(): LayoutMetricsContextValue {
  const ctx = useContext(LayoutMetricsContext);
  if (!ctx) throw new Error('useLayoutMetrics must be used within LayoutMetricsProvider');
  return ctx;
}

