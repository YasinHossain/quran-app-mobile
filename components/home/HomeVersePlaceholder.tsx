import { Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

export function HomeVersePlaceholder(): React.JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="items-center justify-center px-5 py-4"
      style={{ minHeight: 168 }}
    >
      <Text
        className="text-center text-[24px] font-semibold leading-[38px]"
        style={{ color: palette.text }}
      >
        Indeed, with hardship comes ease.
      </Text>
      <Text
        className="mt-5 text-center text-sm font-medium tracking-[1px]"
        style={{ color: palette.muted }}
      >
        [ASH-SHARH 94:6]
      </Text>
    </View>
  );
}
