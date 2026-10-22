import React from 'react';

type WelcomeContextValue = {
  hasCompletedWelcome: boolean;
  completeWelcome: () => void;
};

const WelcomeContext = React.createContext<WelcomeContextValue | null>(null);

export function WelcomeProvider({
  children,
  initialCompleted,
}: {
  children: React.ReactNode;
  initialCompleted: boolean;
}): React.JSX.Element {
  const [hasCompletedWelcome, setHasCompletedWelcome] = React.useState(initialCompleted);
  const value = React.useMemo(
    () => ({ hasCompletedWelcome, completeWelcome: () => setHasCompletedWelcome(true) }),
    [hasCompletedWelcome]
  );
  return <WelcomeContext.Provider value={value}>{children}</WelcomeContext.Provider>;
}

export function useWelcome(): WelcomeContextValue {
  const value = React.useContext(WelcomeContext);
  if (!value) throw new Error('useWelcome must be used within WelcomeProvider');
  return value;
}
