import React from 'react';
import { SlidingSegmentedControl } from '@/components/ui/SlidingSegmentedControl';

import { useUiTranslation } from '@/providers/UiLanguageContext';

export type HomeTab = 'surah' | 'juz' | 'page';

const TABS: HomeTab[] = ['surah', 'juz', 'page'];

export function HomeTabToggle({
  activeTab,
  width,
  onTabChange,
}: {
  activeTab: HomeTab;
  width?: number;
  onTabChange: (tab: HomeTab) => void;
}): React.JSX.Element {
  const { t } = useUiTranslation();
  return (
    <SlidingSegmentedControl
      items={TABS.map((tab) => ({
        key: tab,
        label: tab === 'surah' ? t('surah_tab') : tab === 'juz' ? t('juz_tab') : t('page_tab'),
      }))}
      selectedKey={activeTab}
      width={width}
      onSelect={onTabChange}
    />
  );
}
