import React from 'react';
import { View } from 'react-native';

import { useTafsirResources } from '@/hooks/useTafsirResources';
import { useSettings } from '@/providers/SettingsContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';

import { ManageTafsirsPanel } from './ManageTafsirsPanel';
import { SettingsPanelHeader } from './SettingsPanelHeader';

export function TafsirSelectionPanel({ isActive = true }: { isActive?: boolean }): React.JSX.Element {
  const { settings, setTafsirIds } = useSettings();
  const { tafsirs, isLoading, errorMessage, refresh } = useTafsirResources({ enabled: isActive });
  const records = React.useMemo(
    () => tafsirs.map((tafsir) => ({
      id: tafsir.id, name: tafsir.displayName, lang: tafsir.formattedLanguage,
    })),
    [tafsirs]
  );
  const languageSort = React.useMemo(() => {
    const priorityByLanguage = new Map<string, number>();
    for (const tafsir of tafsirs) {
      const language = tafsir.formattedLanguage;
      priorityByLanguage.set(language, Math.min(
        priorityByLanguage.get(language) ?? Number.POSITIVE_INFINITY,
        tafsir.getLanguagePriority()
      ));
    }
    return (a: string, b: string): number => {
      const priorityA = priorityByLanguage.get(a) ?? Number.POSITIVE_INFINITY;
      const priorityB = priorityByLanguage.get(b) ?? Number.POSITIVE_INFINITY;
      return priorityA !== priorityB ? priorityA - priorityB : a.localeCompare(b);
    };
  }, [tafsirs]);

  return (
    <ManageTafsirsPanel
      tafsirs={records}
      orderedSelection={settings.tafsirIds ?? []}
      onChangeSelection={setTafsirIds}
      isLoading={isLoading}
      errorMessage={errorMessage}
      onRefresh={refresh}
      languageSort={languageSort}
      isActive={isActive}
    />
  );
}

// Direct entry mounts only the tafsir picker; the full settings controller is
// created on demand when the user navigates back to the settings root.
export function TafsirSettingsContent({ onBack, onClose }: {
  onBack: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useUiTranslation();
  return (
    <View className="flex-1">
      <SettingsPanelHeader title={t('tafsir_panel_title')} onBack={onBack} onClose={onClose} />
      <TafsirSelectionPanel />
    </View>
  );
}
