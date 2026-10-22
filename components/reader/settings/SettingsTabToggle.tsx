import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';
import { useUiTranslation } from '@/providers/UiLanguageContext';

export type SettingsTab = 'translations' | 'mushaf';

export function SettingsTabToggle({
  activeTab,
  onTabChange,
}: {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}): React.JSX.Element {
  const { t } = useUiTranslation();
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const [measuredWidth, setMeasuredWidth] = React.useState(0);
  const activeIndex = activeTab === 'mushaf' ? 1 : 0;
  const indicatorWidth = measuredWidth > 8 ? (measuredWidth - 8) / 2 : 0;
  const activeShadow =
    Platform.OS === 'android'
      ? { elevation: 2 }
      : {
          shadowColor: '#000',
          shadowOpacity: 0.1,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 2 },
        };

  return (
    <View
      className="relative flex-row items-center p-1"
      onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width;
        setMeasuredWidth((currentWidth) =>
          Math.abs(currentWidth - nextWidth) < 1 ? currentWidth : nextWidth
        );
      }}
      style={{
        backgroundColor: palette.interactive,
        borderColor: `${palette.border}55`,
        borderRadius: 24,
        borderWidth: 1,
      }}
    >
      {indicatorWidth > 0 ? (
        <View
          pointerEvents="none"
          style={[
            activeShadow,
            {
              position: 'absolute',
              bottom: 4,
              left: 4,
              top: 4,
              width: indicatorWidth,
              backgroundColor: palette.surfaceNavigation,
              borderRadius: 999,
              transform: [{ translateX: activeIndex * indicatorWidth }],
            },
          ]}
        />
      ) : null}
      <TabButton
        label={t('translations')}
        isActive={activeTab === 'translations'}
        palette={palette}
        onPress={() => onTabChange('translations')}
      />
      <TabButton
        label={t('mushaf')}
        isActive={activeTab === 'mushaf'}
        palette={palette}
        onPress={() => onTabChange('mushaf')}
      />
    </View>
  );
}

function TabButton({
  label,
  isActive,
  palette,
  onPress,
}: {
  label: string;
  isActive: boolean;
  palette: (typeof Colors)['light'];
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      className={[
        'z-10 h-11 flex-1 items-center justify-center px-3',
      ].join(' ')}
      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
    >
      <Text
        numberOfLines={1}
        className="text-xs font-semibold"
        style={{ color: isActive ? palette.text : palette.muted }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
