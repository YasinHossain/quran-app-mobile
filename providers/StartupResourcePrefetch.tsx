import React from 'react';

import { useTranslationResources } from '@/hooks/useTranslationResources';
import { useSettings } from '@/providers/SettingsContext';

export function StartupResourcePrefetch(): null {
  const { settings } = useSettings();
  const [enabled, setEnabled] = React.useState(false);

  React.useEffect(() => {
    setEnabled(true);
  }, []);

  useTranslationResources({ enabled, language: settings.contentLanguage });

  return null;
}
