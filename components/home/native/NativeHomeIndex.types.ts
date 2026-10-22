import type { NativeSyntheticEvent, ViewProps } from 'react-native';

export type NativeHomeIndexItemType = 'surah' | 'juz' | 'page';

export type NativeHomeIndexItem = {
  accessibilityLabel: string;
  number: number;
  numberLabel: string;
  subtitle: string;
  title: string;
  trailingText: string;
  type: NativeHomeIndexItemType;
};

export type NativeHomeIndexContent =
  | {
      items: NativeHomeIndexItem[];
      kind: 'items';
    }
  | {
      count: number;
      digits: string;
      kind: 'pages';
      titleTemplate: string;
    };

export type NativeHomeIndexTheme = {
  accentColor: string;
  backgroundColor: string;
  cardColor: string;
  numberBadgeColor: string;
  primaryTextColor: string;
  secondaryTextColor: string;
};

export type NativeHomeIndexPressEvent = {
  number: number;
  type: NativeHomeIndexItemType;
};

export type NativeHomeIndexHeaderVisibilityEvent = {
  visible: boolean;
};

export type NativeHomeIndexTabPressEvent = {
  tab: 'surah' | 'juz' | 'page';
};

export type NativeHomeIndexProps = ViewProps & {
  bottomInset: number;
  content: NativeHomeIndexContent;
  headerHeight: number;
  headerIntroHeight: number;
  numColumns: number;
  onHeaderVisibilityChange?: (
    event: NativeSyntheticEvent<NativeHomeIndexHeaderVisibilityEvent>
  ) => void;
  onItemPress?: (event: NativeSyntheticEvent<NativeHomeIndexPressEvent>) => void;
  onTabPress?: (event: NativeSyntheticEvent<NativeHomeIndexTabPressEvent>) => void;
  tabsHeight: number;
  theme: NativeHomeIndexTheme;
};

export type NativeHomeIndexHandle = {
  scrollToTop: (animated?: boolean) => void;
};
