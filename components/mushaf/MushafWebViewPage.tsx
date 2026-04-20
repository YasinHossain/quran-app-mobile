import React from 'react';
import { ActivityIndicator, StyleSheet, View, useWindowDimensions } from 'react-native';
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
import {
  buildMushafWebViewRenderScript,
  buildMushafWebViewShellDocument,
} from './webview/buildMushafWebViewDocument';

type MushafWebViewPageProps = {
  data: MushafPageData;
  mushafScaleStep: MushafScaleStep;
  initialHeightOverride?: number;
  onFirstContentHeight?: (payload: { height: number; durationMs: number }) => void;
  onHeightResolved?: (payload: { height: number }) => void;
  onSelectionChange?: (payload: MushafSelectionPayload) => void;
  onWordLongPress?: (payload: MushafWordPressPayload) => void;
  onWordPress?: (payload: MushafWordPressPayload) => void;
};

const PAGE_MAX_WIDTH = 720;
const ENABLE_MUSHAF_QCF_DEV_LOGS = __DEV__;
const HEIGHT_CHANGE_EPSILON_PX = 1;

let mountedExactWebViews = 0;

function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function logMushafQcfDev(event: string, details: Record<string, unknown>): void {
  if (!ENABLE_MUSHAF_QCF_DEV_LOGS) {
    return;
  }

  console.log(`[mushaf-qcf][MushafWebViewPage] ${event}`, details);
}

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

export function MushafWebViewPagePlaceholder({
  estimatedHeight,
  showLoadingIndicator = false,
}: {
  estimatedHeight: number;
  showLoadingIndicator?: boolean;
}): React.JSX.Element {
  const { width } = useWindowDimensions();
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const pageWidth = Math.min(Math.max(width - 8, 280), PAGE_MAX_WIDTH);

  return (
    <View className="items-center">
      <View style={[styles.webViewShell, { maxWidth: pageWidth }]}>
        <View
          style={[
            styles.placeholderSurface,
            {
              backgroundColor: resolvedTheme === 'dark' ? '#102033' : '#F7F9F9',
              borderColor:
                resolvedTheme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)',
              height: Math.max(estimatedHeight, 280),
            },
          ]}
        >
          <View style={styles.placeholderContent}>
            <View style={[styles.placeholderLine, { backgroundColor: palette.border }]} />
            <View style={[styles.placeholderLineWide, { backgroundColor: palette.border }]} />
            <View style={[styles.placeholderLine, { backgroundColor: palette.border }]} />
          </View>
          {showLoadingIndicator ? (
            <View pointerEvents="none" style={styles.loadingOverlay}>
              <ActivityIndicator color={palette.text} />
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export function MushafWebViewPage({
  data,
  mushafScaleStep,
  initialHeightOverride,
  onFirstContentHeight,
  onHeightResolved,
  onSelectionChange,
  onWordLongPress,
  onWordPress,
}: MushafWebViewPageProps): React.JSX.Element {
  const { width, height } = useWindowDimensions();
  const { resolvedTheme } = useAppTheme();
  const palette = Colors[resolvedTheme];
  const pageWidth = Math.min(Math.max(width - 8, 280), PAGE_MAX_WIDTH);
  const fallbackInitialHeight = React.useMemo(
    () => getInitialHeight(data, mushafScaleStep, height),
    [data, height, mushafScaleStep]
  );
  const initialHeight = initialHeightOverride ?? fallbackInitialHeight;
  const [webViewHeight, setWebViewHeight] = React.useState(initialHeight);
  const [isMeasured, setIsMeasured] = React.useState(false);
  const mountStartedAtRef = React.useRef(nowMs());
  const webViewLoadedAtRef = React.useRef<number | null>(null);
  const hasReportedFirstHeightRef = React.useRef(false);
  const lastResolvedHeightRef = React.useRef<number | null>(null);
  const webViewRef = React.useRef<WebView>(null);
  const isShellLoadedRef = React.useRef(false);
  const lastInjectedPayloadKeyRef = React.useRef<string | null>(null);
  const renderIdentityKey = `${data.pack.packId}:${data.pack.version}:${data.pageNumber}:${mushafScaleStep}:${Math.round(pageWidth)}:${Math.round(height)}`;
  const shellIdentityKey = `${data.pack.packId}:${data.pack.version}:${mushafScaleStep}:${resolvedTheme}:${Math.round(height)}`;

  React.useEffect(() => {
    mountStartedAtRef.current = nowMs();
    webViewLoadedAtRef.current = null;
    hasReportedFirstHeightRef.current = false;
    lastResolvedHeightRef.current = initialHeightOverride ?? null;
    setWebViewHeight(initialHeight);
    setIsMeasured(false);
  }, [renderIdentityKey]);

  React.useEffect(() => {
    isShellLoadedRef.current = false;
    lastInjectedPayloadKeyRef.current = null;
  }, [shellIdentityKey]);

  React.useEffect(() => {
    mountedExactWebViews += 1;
    logMushafQcfDev('mount', {
      mountedExactWebViews,
      packId: data.pack.packId,
      pageNumber: data.pageNumber,
      version: data.pack.version,
    });

    return () => {
      mountedExactWebViews = Math.max(0, mountedExactWebViews - 1);
      logMushafQcfDev('unmount', {
        mountedExactWebViews,
        packId: data.pack.packId,
        pageNumber: data.pageNumber,
        version: data.pack.version,
      });
    };
  }, [data.pageNumber, data.pack.packId, data.pack.version]);

  const shellDocument = React.useMemo(
    () =>
      buildMushafWebViewShellDocument({
        packId: data.pack.packId,
        mushafScaleStep,
        theme: resolvedTheme,
        viewportHeight: height,
      }),
    [data.pack.packId, height, mushafScaleStep, resolvedTheme]
  );
  const renderPayloadScript = React.useMemo(
    () =>
      buildMushafWebViewRenderScript({
        data,
        layout: shellDocument.layout,
      }),
    [data, shellDocument.layout]
  );
  const packDirectoryUri = data.rendererAssets?.packDirectoryUri;

  const injectRenderPayload = React.useCallback(
    (reason: 'load-end' | 'payload-change') => {
      if (!isShellLoadedRef.current) {
        return;
      }

      if (lastInjectedPayloadKeyRef.current === renderIdentityKey) {
        return;
      }

      webViewRef.current?.injectJavaScript(renderPayloadScript);
      lastInjectedPayloadKeyRef.current = renderIdentityKey;

      logMushafQcfDev('render-payload-injected', {
        pageNumber: data.pageNumber,
        packId: data.pack.packId,
        reason,
        version: data.pack.version,
      });
    },
    [data.pageNumber, data.pack.packId, data.pack.version, renderIdentityKey, renderPayloadScript]
  );

  React.useEffect(() => {
    injectRenderPayload('payload-change');
  }, [injectRenderPayload]);

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
          const height = Math.max(fallbackInitialHeight, Math.ceil(parsed.payload.height));
          const durationMs = Math.round(nowMs() - mountStartedAtRef.current);
          setWebViewHeight((current) =>
            Math.abs(current - height) > HEIGHT_CHANGE_EPSILON_PX ? height : current
          );
          setIsMeasured(true);

          if (
            lastResolvedHeightRef.current === null ||
            Math.abs(lastResolvedHeightRef.current - height) > HEIGHT_CHANGE_EPSILON_PX
          ) {
            lastResolvedHeightRef.current = height;
            onHeightResolved?.({ height });
          }

          if (!hasReportedFirstHeightRef.current) {
            hasReportedFirstHeightRef.current = true;
            logMushafQcfDev('first-content-height', {
              durationMs,
              height,
              mountedExactWebViews,
              pageNumber: data.pageNumber,
              packId: data.pack.packId,
              version: data.pack.version,
              webViewLoadToHeightMs:
                webViewLoadedAtRef.current === null
                  ? null
                  : Math.round(nowMs() - webViewLoadedAtRef.current),
            });
            onFirstContentHeight?.({ height, durationMs });
          }
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
    [fallbackInitialHeight, onHeightResolved, onSelectionChange, onWordLongPress, onWordPress]
  );

  return (
    <View className="items-center">
      <View style={[styles.webViewShell, { maxWidth: pageWidth }]}>
        {!isMeasured ? (
          <View pointerEvents="none" style={styles.loadingOverlay}>
            <ActivityIndicator color={palette.text} />
          </View>
        ) : null}
        <WebView
          key={shellIdentityKey}
          ref={webViewRef}
          originWhitelist={['*']}
          source={{
            html: shellDocument.html,
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
          onLoadEnd={() => {
            isShellLoadedRef.current = true;
            webViewLoadedAtRef.current = nowMs();
            logMushafQcfDev('load-end', {
              durationMs: Math.round(webViewLoadedAtRef.current - mountStartedAtRef.current),
              mountedExactWebViews,
              pageNumber: data.pageNumber,
              packId: data.pack.packId,
              version: data.pack.version,
            });
            injectRenderPayload('load-end');
          }}
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
  webViewShell: {
    minHeight: 280,
    position: 'relative',
    width: '100%',
  },
  placeholderContent: {
    gap: 18,
    paddingHorizontal: 20,
    width: '100%',
  },
  placeholderLine: {
    borderRadius: 999,
    height: 12,
    opacity: 0.45,
    width: '72%',
  },
  placeholderLineWide: {
    borderRadius: 999,
    height: 12,
    opacity: 0.35,
    width: '88%',
  },
  placeholderSurface: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    overflow: 'hidden',
    width: '100%',
  },
});
