import { Text, View } from 'react-native';

export function HomeVersePlaceholder(): React.JSX.Element {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="items-center justify-center px-5 py-4"
      style={{ minHeight: 168 }}
    >
      <Text
        className="text-center text-[24px] font-semibold leading-[38px] text-content-primary dark:text-content-primary-dark"
      >
        Indeed, with hardship comes ease.
      </Text>
      <Text className="mt-5 text-center text-sm font-medium tracking-[1px] text-content-secondary dark:text-content-secondary-dark">
        [ASH-SHARH 94:6]
      </Text>
    </View>
  );
}
