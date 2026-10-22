import { Clock } from 'lucide-react-native';
import React from 'react';
import { Text, View } from 'react-native';

import { useUiTranslation } from '@/providers/UiLanguageContext';

export function LastReadHeader(): React.JSX.Element {
  const { t } = useUiTranslation();

  return (
    <View className="mb-2">
      <View className="flex-row items-center gap-3">
        <View className="h-9 w-9 rounded-xl bg-accent items-center justify-center shadow-sm flex-shrink-0">
          <Clock size={20} strokeWidth={2.25} color="#FFFFFF" />
        </View>
        <View className="min-w-0">
          <Text className="text-lg font-bold text-foreground dark:text-foreground-dark">
            {t('binder_tab_recent')}
          </Text>
          <Text className="text-xs text-muted dark:text-muted-dark">{t('binder_tab_recent_desc')}</Text>
        </View>
      </View>
    </View>
  );
}
