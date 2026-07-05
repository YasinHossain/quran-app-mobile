import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/providers/ThemeContext';

import { BismillahCalligraphy } from './BismillahCalligraphy';
import { BismillahOrnament } from './BismillahOrnament';

export function BismillahDisplay(): React.JSX.Element {
  const { isDark } = useAppTheme();
  const artworkColor = isDark ? '#D5DED9' : '#3F735B';

  return (
    <View
      className="w-full items-center justify-center"
      accessibilityRole="text"
      accessibilityLabel="Bismillah ir-Rahman ir-Rahim"
    >
      <View style={styles.frame}>
        <View
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <BismillahOrnament color={artworkColor} />
        </View>
        <View pointerEvents="none" style={styles.calligraphyContainer}>
          <BismillahCalligraphy color={artworkColor} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    maxWidth: 560,
    aspectRatio: 560 / 76,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calligraphyContainer: {
    position: 'absolute',
    top: '23%',
    left: '20%',
    width: '60%',
    height: '54%',
  },
});
