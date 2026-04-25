import React from 'react';
import { ActivityIndicator, StyleSheet, View, useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

import type { MushafPageData, MushafScaleStep } from '@/types';
import type {
  MushafHighlightAnchorPayload,
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
  highlightVerseKey?: string;
  initialHeightOverride?: number;
  onFirstContentHeight?: (payload: { height: number; durationMs: number }) => void;
  onHighlightAnchorResolved?: (payload: MushafHighlightAnchorPayload) => void;
  onHeightResolved?: (payload: { height: number }) => void;
  onSelectionChange?: (payload: MushafSelectionPayload) => void;
  onWordLongPress?: (payload: MushafWordPressPayload) => void;
  onWordPress?: (payload: MushafWordPressPayload) => void;
};

const PAGE_MAX_WIDTH = 720;
const ENABLE_MUSHAF_QCF_DEV_LOGS = __DEV__;
const HEIGHT_CHANGE_EPSILON_PX = 1;
const MIN_WEBVIEW_PAGE_HEIGHT = 280;
const WEBVIEW_APP_HORIZONTAL_INSET_PX = 8;
const WEBVIEW_LINE_GAP_PX = 4;
const WEBVIEW_REFLOW_WIDTH_RATIO = 0.95;

let mountedExactWebViews = 0;

type RenderInjectionReason = 'load-end' | 'payload-change' | 'renderer-ready' | 'retry';

function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function logMushafQcfDev(event: string, details: Record<string, unknown>): void {
  if (!ENABLE_MUSHAF_QCF_DEV_LOGS) {
    return;
  }

  console.log(`[mushaf-qcf][MushafWebViewPage] ${event}`, details);
}

function createCollapsedSelectionPayload(pageNumber: number): MushafSelectionPayload {
  return {
    isCollapsed: true,
    pageNumber,
    text: '',
    verseKeys: [],
    wordPositions: [],
  };
}

export function estimateMushafWebViewPageHeight({
  packId,
  lines,
  mushafScaleStep,
  viewportHeight,
  viewportWidth,
}: {
  packId: MushafPageData['pack']['packId'];
  lines: number;
  mushafScaleStep: MushafScaleStep;
  viewportHeight: number;
  viewportWidth: number;
}): number {
  const layout = getMushafWebViewLayoutConfig(packId, mushafScaleStep, viewportHeight);
  const pageWidth = Math.min(Math.max(viewportWidth - 8, 280), PAGE_MAX_WIDTH);
  const appWidth = Math.max(1, pageWidth - WEBVIEW_APP_HORIZONTAL_INSET_PX);
  const reflowThreshold = appWidth * WEBVIEW_REFLOW_WIDTH_RATIO;
  const normalizedLines = Math.max(1, Math.trunc(lines));
  const lineHeight = Math.round(layout.fontSizePx * layout.lineHeightMultiplier);
  const standardHeight =
    normalizedLines * lineHeight +
    Math.max(0, normalizedLines - 1) * WEBVIEW_LINE_GAP_PX;

  if (layout.lineWidthPx <= reflowThreshold) {
    return Math.max(MIN_WEBVIEW_PAGE_HEIGHT, Math.ceil(standardHeight));
  }

  const reflowLineHeight = Math.round(layout.fontSizePx * layout.reflowLineHeightMultiplier);
  const estimatedReflowLines = Math.ceil(
    normalizedLines * Math.max(1, layout.lineWidthPx / Math.max(1, reflowThreshold))
  );

  return Math.max(
    MIN_WEBVIEW_PAGE_HEIGHT,
    Math.ceil(estimatedReflowLines * reflowLineHeight)
  );
}

function getInitialHeight(
  data: MushafPageData,
  mushafScaleStep: MushafScaleStep,
  viewportHeight: number,
  viewportWidth: number
): number {
  return estimateMushafWebViewPageHeight({
    packId: data.pack.packId,
    lines: data.pack.lines,
    mushafScaleStep,
    viewportHeight,
    viewportWidth,
  });
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
  highlightVerseKey,
  initialHeightOverride,
  onFirstContentHeight,
  onHighlightAnchorResolved,
  onHeightResolved,
  onSelectionChange,
  onWordLongPress,
  onWordPress,
}: MushafWebViewPageProps): React.JSX.Element {
  const { width, height } = useWindowDimensions();
  const { resolvedTheme } = useAppTheme();
  const pageWidth = Math.min(Math.max(width - 8, 280), PAGE_MAX_WIDTH);
  const fallbackInitialHeight = React.useMemo(
    () => getInitialHeight(data, mushafScaleStep, height, width),
    [data, height, mushafScaleStep, width]
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
  const normalizedHighlightVerseKey =
    typeof highlightVerseKey === 'string' && highlightVerseKey.trim()
      ? highlightVerseKey.trim()
      : undefined;
  const latestPageIdentityRef = React.useRef({
    packId: data.pack.packId,
    pageNumber: data.pageNumber,
    version: data.pack.version,
  });
  const renderIdentityKey = `${data.pack.packId}:${data.pack.version}:${data.pageNumber}:${mushafScaleStep}:${Math.round(pageWidth)}:${Math.round(height)}:${normalizedHighlightVerseKey ?? ''}`;
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
    onSelectionChange?.(createCollapsedSelectionPayload(data.pageNumber));
  }, [data.pageNumber, onSelectionChange, renderIdentityKey]);

  React.useEffect(() => {
    isShellLoadedRef.current = false;
    lastInjectedPayloadKeyRef.current = null;
  }, [shellIdentityKey]);

  React.useEffect(() => {
    latestPageIdentityRef.current = {
      packId: data.pack.packId,
      pageNumber: data.pageNumber,
      version: data.pack.version,
    };
  }, [data.pageNumber, data.pack.packId, data.pack.version]);

  React.useEffect(() => {
    mountedExactWebViews += 1;
    const identity = latestPageIdentityRef.current;
    logMushafQcfDev('mount', {
      mountedExactWebViews,
      packId: identity.packId,
      pageNumber: identity.pageNumber,
      version: identity.version,
    });

    return () => {
      mountedExactWebViews = Math.max(0, mountedExactWebViews - 1);
      const latestIdentity = latestPageIdentityRef.current;
      logMushafQcfDev('unmount', {
        mountedExactWebViews,
        packId: latestIdentity.packId,
        pageNumber: latestIdentity.pageNumber,
        version: latestIdentity.version,
      });
    };
  }, []);

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
        highlightVerseKey: normalizedHighlightVerseKey,
      }),
    [data, normalizedHighlightVerseKey, shellDocument.layout]
  );
  const packDirectoryUri = data.rendererAssets?.packDirectoryUri;

  const injectRenderPayload = React.useCallback(
    (reason: RenderInjectionReason) => {
      if (!isShellLoadedRef.current) {
        return;
      }

      if (lastInjectedPayloadKeyRef.current === renderIdentityKey && reason !== 'retry') {
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

  React.useEffect(() => {
    if (isMeasured) {
      return;
    }

    const retryTimeouts = [80, 240, 600, 1200].map((delayMs) =>
      setTimeout(() => injectRenderPayload('retry'), delayMs)
    );

    return () => {
      retryTimeouts.forEach(clearTimeout);
    };
  }, [injectRenderPayload, isMeasured, renderIdentityKey]);

  const isPayloadForCurrentPage = React.useCallback(
    (
      messageType: 'highlight-anchor' | 'selection-change' | 'word-long-press' | 'word-press',
      payload: { pageNumber?: number }
    ): boolean => {
      if (
        typeof payload.pageNumber === 'number' &&
        payload.pageNumber !== latestPageIdentityRef.current.pageNumber
      ) {
        logMushafQcfDev('stale-interaction-ignored', {
          currentPageNumber: latestPageIdentityRef.current.pageNumber,
          messageType,
          payloadPageNumber: payload.pageNumber,
        });
        return false;
      }

      return true;
    },
    []
  );

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
        case 'renderer-ready':
          isShellLoadedRef.current = true;
          if (webViewLoadedAtRef.current === null) {
            webViewLoadedAtRef.current = nowMs();
          }
          injectRenderPayload('renderer-ready');
          return;
        case 'content-height': {
          if (parsed.payload.contentReady === false) {
            return;
          }

          const measuredPayloadHeight =
            typeof parsed.payload.height === 'number' && Number.isFinite(parsed.payload.height)
              ? parsed.payload.height
              : 0;
          const height = Math.max(
            MIN_WEBVIEW_PAGE_HEIGHT,
            initialHeight,
            Math.ceil(measuredPayloadHeight)
          );
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
          if (!isPayloadForCurrentPage(parsed.type, parsed.payload)) {
            return;
          }
          onSelectionChange?.(parsed.payload);
          return;
        case 'highlight-anchor':
          if (!isPayloadForCurrentPage(parsed.type, parsed.payload)) {
            return;
          }
          onHighlightAnchorResolved?.(parsed.payload);
          return;
        case 'word-long-press':
          if (!isPayloadForCurrentPage(parsed.type, parsed.payload)) {
            return;
          }
          onWordLongPress?.(parsed.payload);
          return;
        case 'word-press':
          if (!isPayloadForCurrentPage(parsed.type, parsed.payload)) {
            return;
          }
          onWordPress?.(parsed.payload);
          return;
        default:
          return;
      }
    },
    [
      isPayloadForCurrentPage,
      injectRenderPayload,
      initialHeight,
      onHeightResolved,
      onHighlightAnchorResolved,
      onSelectionChange,
      onWordLongPress,
      onWordPress,
    ]
  );

  return (
    <View className="items-center">
      <View style={[styles.webViewShell, { maxWidth: pageWidth }]}>
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
