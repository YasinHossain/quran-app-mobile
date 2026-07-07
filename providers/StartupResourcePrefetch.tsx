import React from 'react';

import { useTranslationResources } from '@/hooks/useTranslationResources';
import { primeOfflineSurahNavigationPage } from '@/lib/surah/offlineSurahPageCache';
import { useSettings } from '@/providers/SettingsContext';
import { loadLastReadFromStorage } from '@/providers/bookmarks/storage-utils';

export function StartupResourcePrefetch(): null {
  const { settings } = useSettings();
  const [enabled, setEnabled] = React.useState(false);

  React.useEffect(() => {
    setEnabled(true);
  }, []);

  useTranslationResources({ enabled, language: settings.contentLanguage });

  React.useEffect(() => {
    if (!enabled || !settings.tajweed) return;

    let cancelled = false;
    const timeout = setTimeout(() => {
      void loadLastReadFromStorage()
        .then((lastRead) => {
          if (cancelled) return;

          const recentEntries = Object.entries(lastRead ?? {})
            .sort((left, right) => (right[1]?.updatedAt ?? 0) - (left[1]?.updatedAt ?? 0))
            .slice(0, 3);

          if (recentEntries.length === 0) {
            primeOfflineSurahNavigationPage({ surahId: 1, settings });
            return;
          }

          for (const [surahId, entry] of recentEntries) {
            const parsedSurahId = Number(surahId);
            if (!Number.isFinite(parsedSurahId) || parsedSurahId <= 0) continue;
            primeOfflineSurahNavigationPage({
              surahId: Math.trunc(parsedSurahId),
              verseNumber: entry?.verseNumber,
              settings,
            });
          }
        })
        .catch(() => {});
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [enabled, settings]);

  return null;
}
