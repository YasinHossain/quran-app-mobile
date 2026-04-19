import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

import type { MushafPageData, MushafScaleStep } from '@/types';
import type {
  MushafSelectionPayload,
  MushafWebViewMessage,
  MushafWordPressPayload,
} from '@/components/mushaf/mushafWordPayload';

import { getMushafWebViewLayoutConfig } from './mushafLayoutPresets';
import { buildMushafWebViewDocument } from './webview/buildMushafWebViewDocument';

type MushafWebViewPageProps = {
  data: MushafPageData;
  mushafName: string;
  mushafScaleStep: MushafScaleStep;
  onSelectionChange?: (payload: MushafSelectionPayload) => void;
  onWordLongPress?: (payload: MushafWordPressPayload) => void;
  onWordPress?: (payload: MushafWordPressPayload) => void;
};

const PAGE_MAX_WIDTH = 720;

function getInitialHeight(
  data: MushafPageData,
  mushafScaleStep: MushafScaleStep,
  viewportHeight: number
): number {
  const layout = getMushafWebViewLayoutConfig(data.pack.packId, mushafScaleStep, viewportHeight);
  const lineHeight = Math.round(layout.fontSizePx * layout.lineHeightMultiplier);
  return lineHeight * data.pack.lines + 168;
}

function isMushafWebViewMessage(value: unknown): value is MushafWebViewMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const message = value as Partial<MushafWebViewMessage>;
  return typeof message.type === 'string';
}

export function MushafWebViewPage({
  data,
  mushafName,
  mushafScaleStep,
  onSelectionChange,
  onWordLongPress,
  onWordPress,
}: MushafWebViewPageProps): React.JSX.Element {
  const { width, height } = useWindowDimensions();
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const pageWidth = Math.min(Math.max(width - 32, 280), PAGE_MAX_WIDTH);
  const initialHeight = React.useMemo(
    () => getInitialHeight(data, mushafScaleStep, height),
    [data, height, mushafScaleStep]
  );
  const [webViewHeight, setWebViewHeight] = React.useState(initialHeight);
  const [isMeasured, setIsMeasured] = React.useState(false);

  React.useEffect(() => {
    setWebViewHeight(initialHeight);
    setIsMeasured(false);
  }, [initialHeight, data.pageNumber, data.pack.packId, data.pack.version]);

  const html = React.useMemo(
    () =>
      buildMushafWebViewDocument({
        data,
        mushafName,
        mushafScaleStep,
        theme: resolvedTheme,
        viewportHeight: height,
      }),
    [data, height, mushafName, mushafScaleStep, resolvedTheme]
  );
  const packDirectoryUri = data.rendererAssets?.packDirectoryUri;

  const handleMessage = React.useCallback(
    (rawMessage: string) => {
      let parsed: unknown;

      try {
        parsed = JSON.parse(rawMessage);
      } catch {
        return;
      }

      if (!isMushafWebViewMessage(parsed)) {
        return;
      }

      switch (parsed.type) {
        case 'content-height': {
          const height = Math.max(initialHeight, Math.ceil(parsed.payload.height));
          setWebViewHeight((current) => (Math.abs(current - height) > 1 ? height : current));
          setIsMeasured(true);
          return;
        }
        case 'selection-change':
          onSelectionChange?.(parsed.payload);
          return;
        case 'word-long-press':
          onWordLongPress?.(parsed.payload);
          return;
        case 'word-press':
          onWordPress?.(parsed.payload);
          return;
        default:
          return;
      }
    },
    [initialHeight, onSelectionChange, onWordLongPress, onWordPress]
  );

  return (
    <View className="items-center">
      <View
        className="w-full rounded-[32px] border border-border/40 bg-surface px-4 py-4 dark:border-border-dark/30 dark:bg-surface-dark"
        style={{ maxWidth: pageWidth }}
      >
        <View className="flex-row items-center justify-between gap-3 border-b border-border/30 pb-3 dark:border-border-dark/20">
          <View className="flex-1">
            <Text className="text-base font-semibold text-foreground dark:text-foreground-dark">
              {mushafName}
            </Text>
            <Text className="mt-1 text-xs text-muted dark:text-muted-dark">
              Exact presets with auto reflow
            </Text>
          </View>
          <View className="rounded-full bg-interactive px-3 py-1.5 dark:bg-interactive-dark">
            <Text className="text-xs font-semibold text-foreground dark:text-foreground-dark">
              Page {data.pageNumber}
            </Text>
          </View>
        </View>

        <View
          className="mt-4 overflow-hidden rounded-[28px] border border-border/30 dark:border-border-dark/20"
          style={styles.webViewFrame}
        >
          {!isMeasured ? (
            <View pointerEvents="none" style={styles.loadingOverlay}>
              <ActivityIndicator color={palette.text} />
            </View>
          ) : null}
          <WebView
            originWhitelist={['*']}
            source={{
              html,
              ...(packDirectoryUri ? { baseUrl: packDirectoryUri } : {}),
            }}
            scrollEnabled={false}
            nestedScrollEnabled={false}
            javaScriptEnabled
            domStorageEnabled
            setSupportMultipleWindows={false}
            allowFileAccess
            allowFileAccessFromFileURLs
            allowUniversalAccessFromFileURLs
            {...(packDirectoryUri ? { allowingReadAccessToURL: packDirectoryUri } : {})}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            bounces={false}
            automaticallyAdjustContentInsets={false}
            onMessage={(event) => handleMessage(event.nativeEvent.data)}
            style={[
              styles.webView,
              {
                backgroundColor: resolvedTheme === 'dark' ? '#102033' : '#F7F9F9',
                height: webViewHeight,
              },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingOverlay: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1,
  },
  webView: {
    width: '100%',
  },
  webViewFrame: {
    minHeight: 280,
  },
});
