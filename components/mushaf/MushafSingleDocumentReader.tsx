import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';

import {
  type MushafSelectionPayload,
  type MushafWordPressPayload,
  resolveMushafVerseKey,
} from '@/components/mushaf/mushafWordPayload';
import {
  buildMushafReaderWebViewPagesScript,
  buildMushafReaderWebViewShellDocument,
  type MushafReaderSurahNavigation,
  type MushafReaderSurahIntro,
} from '@/components/mushaf/webview/buildMushafReaderWebViewDocument';
import { estimateMushafWebViewPageHeight } from '@/components/mushaf/MushafWebViewPage';
import { useAppTheme } from '@/providers/ThemeContext';
import { container } from '@/src/core/infrastructure/di/container';

import type { MushafPackId, MushafPageData, MushafScaleStep, MushafVerse } from '@/types';

export type MushafSingleDocumentVersePress = {
  title: string;
  surahId: number;
  verseKey: string;
  verseApiId?: number;
  arabicText: string;
  translationTexts: string[];
  wordPosition: number;
  surfaceText?: string;
  verseWords?: readonly { wordPosition: number; surfaceText: string }[];
};

export type MushafAudioWord = {
  verseKey: string;
  wordPosition: number;
};

export type MushafSingleDocumentReaderHandle = {
  scrollToPage: (pageNumber: number) => void;
};

type MushafSingleDocumentReaderProps = {
  activeAudioWord?: MushafAudioWord | null;
  backgroundWarmEnabled?: boolean;
  backgroundPageNumbers: number[];
  chapterNamesById: Map<number, string>;
  compactPageLines?: boolean;
  expectedVersion: string;
  filterChapterId?: number;
  focusBottomInsetPx?: number;
  focusTopInsetPx: number;
  highlightVerseKey?: string | null;
  initialPageData?: MushafPageData | null;
  initialPageNumber: number;
  mushafScaleStep: MushafScaleStep;
  onActivePageChange?: (pageNumber: number) => void;
  onActiveVerseChange?: (verseKey: string) => void;
  onInitialPositioned?: () => void;
  onSelectionChange: (payload: MushafSelectionPayload) => void;
  onScrollActivity?: (scrollY?: number) => void;
  onSurahNavigation?: (direction: 'next' | 'previous') => void;
  onVersePress: (verse: MushafSingleDocumentVersePress) => void;
  onWordSeek?: (word: MushafAudioWord) => void;
  pageNumbers?: number[];
  packId: MushafPackId;
  surahIntro?: MushafReaderSurahIntro;
  surahNavigation?: MushafReaderSurahNavigation;
  totalPages: number;
  wordSeekEnabled?: boolean;
};

type ReaderMessage =
  | {
      type: 'renderer-ready';
      payload?: { ready?: boolean };
    }
  | {
      type: 'reader-page-rendered';
      payload?: { pageNumber?: number };
    }
  | {
      type: 'reader-initial-positioned';
      payload?: { pageNumber?: number; scrollY?: number };
    }
  | {
      type: 'reader-active-page-change';
      payload?: { pageNumber?: number; verseKey?: string };
    }
  | {
      type: 'reader-scroll';
      payload?: { scrollY?: number };
    }
  | {
      type: 'page-window-request';
      payload?: { pageNumbers?: number[] };
    }
  | {
      type: 'selection-change';
      payload: MushafSelectionPayload;
    }
  | {
      type: 'word-press';
      payload: MushafWordPressPayload;
    }
  | {
      type: 'surah-navigation';
      payload?: { direction?: 'next' | 'previous' };
    }
  | {
      type: string;
      payload?: unknown;
    };

type MushafWebViewSurfaceProps = {
  allowingReadAccessToURL?: string;
  backgroundColor: string;
  html: string;
  onLoadEnd: () => void;
  onLoadStart: () => void;
  onMessage: (event: WebViewMessageEvent) => void;
  sessionKey: string;
};

const MUSHAF_ORIGIN_WHITELIST = ['*'];

/**
 * Keep the native WebView subtree out of ordinary reader rerenders. On Android,
 * applying an HTML source again calls loadDataWithBaseURL even when the document
 * text is unchanged, briefly clearing every rendered Mushaf glyph.
 */
const MushafWebViewSurface = React.memo(
  React.forwardRef<WebView, MushafWebViewSurfaceProps>(function MushafWebViewSurface(
    {
      allowingReadAccessToURL,
      backgroundColor,
      html,
      onLoadEnd,
      onLoadStart,
      onMessage,
      sessionKey,
    },
    ref
  ): React.JSX.Element {
    const source = React.useMemo(
      () => ({
        html,
        ...(allowingReadAccessToURL ? { baseUrl: allowingReadAccessToURL } : {}),
      }),
      [allowingReadAccessToURL, html]
    );

    return (
      <WebView
        key={sessionKey}
        ref={ref}
        originWhitelist={MUSHAF_ORIGIN_WHITELIST}
        source={source}
        scrollEnabled
        nestedScrollEnabled
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        {...(allowingReadAccessToURL ? { allowingReadAccessToURL } : {})}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        bounces={false}
        automaticallyAdjustContentInsets={false}
        onLoadStart={onLoadStart}
        onLoadEnd={onLoadEnd}
        onMessage={onMessage}
        style={[styles.webView, { backgroundColor }]}
      />
    );
  })
);

const BACKGROUND_WARM_BATCH_SIZE = 2;
const BACKGROUND_WARM_BATCH_DELAY_MS = 180;
const BACKGROUND_WARM_START_DELAY_MS = 220;
// Covers every page of the longest Surah, so scrubbing lands on already-rendered pages.
const MAX_BACKGROUND_WARM_PAGE_COUNT = 64;
const DEFERRED_PAGE_RELEASE_FALLBACK_MS = 1500;
const QCF_FONT_DATA_URI_CACHE_MAX_ENTRIES = 12;
const qcfFontDataUriCache = new Map<string, Promise<string | null>>();
let qcfFontDataUriReadQueue: Promise<void> = Promise.resolve();

function getFontMimeType(fileUri: string): string {
  const normalizedUri = fileUri.split('?')[0]?.toLowerCase() ?? '';
  if (normalizedUri.endsWith('.woff2')) return 'font/woff2';
  if (normalizedUri.endsWith('.woff')) return 'font/woff';
  if (normalizedUri.endsWith('.otf')) return 'font/otf';
  return 'font/ttf';
}

function getQcfFontDataUri(fileUri: string): Promise<string | null> {
  const cached = qcfFontDataUriCache.get(fileUri);
  if (cached) {
    qcfFontDataUriCache.delete(fileUri);
    qcfFontDataUriCache.set(fileUri, cached);
    return cached;
  }

  // Fallback only: the WebView normally reads page fonts from their files. Reading several
  // large font files concurrently can intermittently fail on lower-memory Android devices,
  // so serialize the native reads and retry transient failures.
  const loadPromise = qcfFontDataUriReadQueue.then(async () => {
    const retryDelaysMs = [0, 80, 240];

    for (let attempt = 0; attempt < retryDelaysMs.length; attempt += 1) {
      const delayMs = retryDelaysMs[attempt] ?? 0;
      if (delayMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }

      try {
        const base64 = await FileSystem.readAsStringAsync(fileUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        if (base64) {
          return `data:${getFontMimeType(fileUri)};base64,${base64}`;
        }
      } catch {
        // Retry below. The installed-pack validation owns permanent file errors.
      }
    }

    return null;
  });
  qcfFontDataUriReadQueue = loadPromise.then(() => undefined);

  qcfFontDataUriCache.set(fileUri, loadPromise);
  void loadPromise.then((dataUri) => {
    // Never retain a transient read failure as the cached result. A later page
    // injection can then retry instead of remaining stuck on the file URL path.
    if (dataUri === null && qcfFontDataUriCache.get(fileUri) === loadPromise) {
      qcfFontDataUriCache.delete(fileUri);
    }
  });
  while (qcfFontDataUriCache.size > QCF_FONT_DATA_URI_CACHE_MAX_ENTRIES) {
    const oldestKey = qcfFontDataUriCache.keys().next().value;
    if (typeof oldestKey !== 'string') break;
    qcfFontDataUriCache.delete(oldestKey);
  }

  return loadPromise;
}

async function hydrateQcfFontDataUri(pageData: MushafPageData): Promise<MushafPageData> {
  const rendererAssets = pageData.rendererAssets;
  if (
    !rendererAssets?.qcfVersion ||
    !rendererAssets.pageFontFileUri ||
    rendererAssets.pageFontDataUri
  ) {
    return pageData;
  }

  const pageFontDataUri = await getQcfFontDataUri(rendererAssets.pageFontFileUri);
  if (!pageFontDataUri) {
    return pageData;
  }

  return {
    ...pageData,
    rendererAssets: {
      ...rendererAssets,
      pageFontDataUri,
    },
  };
}

function parseVerseKeyNumbers(
  verseKey: string | null
): { surahId: number; verseNumber: number } | null {
  if (!verseKey) return null;
  const [surahRaw, verseRaw] = verseKey.split(':');
  const surahId = Number.parseInt(surahRaw ?? '', 10);
  const verseNumber = Number.parseInt(verseRaw ?? '', 10);
  if (!Number.isFinite(surahId) || !Number.isFinite(verseNumber)) return null;
  const normalizedSurahId = Math.trunc(surahId);
  const normalizedVerseNumber = Math.trunc(verseNumber);
  if (normalizedSurahId <= 0 || normalizedVerseNumber <= 0) return null;
  return { surahId: normalizedSurahId, verseNumber: normalizedVerseNumber };
}

function resolveMushafVerseText(verse: MushafVerse): string {
  const directText = verse.textUthmani ?? verse.textIndopak ?? '';
  if (directText.trim()) {
    return directText.trim();
  }

  return verse.words
    .map((word) => word.textUthmani ?? word.textIndopak ?? word.textQpcHafs ?? '')
    .filter((wordText) => wordText.trim().length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePageNumbers(pageNumbers: number[], totalPages: number): number[] {
  return Array.from(
    new Set(
      pageNumbers
        .filter((pageNumber) => Number.isInteger(pageNumber))
        .map((pageNumber) => Math.trunc(pageNumber))
        .filter((pageNumber) => pageNumber >= 1 && pageNumber <= totalPages)
    )
  );
}

function normalizeAllowedPageNumbers(
  pageNumbers: number[] | undefined,
  totalPages: number
): Set<number> | null {
  if (!Array.isArray(pageNumbers) || pageNumbers.length === 0) {
    return null;
  }

  const normalized = normalizePageNumbers(pageNumbers, totalPages);
  return normalized.length ? new Set(normalized) : null;
}

function shouldBackgroundWarmPageNumbers(pageNumbers: number[] | undefined): pageNumbers is number[] {
  return Array.isArray(pageNumbers) && pageNumbers.length > 1;
}

function sortPageNumbersByDistance(pageNumbers: number[], anchorPageNumber: number): number[] {
  const normalizedAnchor = Number.isFinite(anchorPageNumber) ? Math.trunc(anchorPageNumber) : 1;

  return [...pageNumbers].sort((left, right) => {
    const leftDistance = Math.abs(left - normalizedAnchor);
    const rightDistance = Math.abs(right - normalizedAnchor);
    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }

    return left - right;
  });
}

function filterPageDataForChapter(
  pageData: MushafPageData,
  filterChapterId?: number
): MushafPageData {
  if (typeof filterChapterId !== 'number' || !Number.isFinite(filterChapterId) || filterChapterId <= 0) {
    return pageData;
  }

  const normalizedChapterId = Math.trunc(filterChapterId);
  const versePrefix = `${normalizedChapterId}:`;
  const verses = pageData.verses.filter((verse) => {
    if (Number(verse.chapterId) === normalizedChapterId) {
      return true;
    }

    return typeof verse.verseKey === 'string' && verse.verseKey.startsWith(versePrefix);
  });
  const verseKeys = new Set(verses.map((verse) => verse.verseKey));

  return {
    ...pageData,
    verses,
    pageLines: {
      ...pageData.pageLines,
      lines: pageData.pageLines.lines
        .map((line) => ({
          ...line,
          words: line.words.filter((word) => {
            const verseKey = resolveMushafVerseKey(word);
            return Boolean(verseKey && verseKeys.has(verseKey));
          }),
        }))
        .filter((line) => line.words.length > 0),
    },
  };
}

function isReaderMessage(value: unknown): value is ReaderMessage {
  return Boolean(value && typeof value === 'object' && typeof (value as ReaderMessage).type === 'string');
}

export const MushafSingleDocumentReader = React.forwardRef<
  MushafSingleDocumentReaderHandle,
  MushafSingleDocumentReaderProps
>(function MushafSingleDocumentReader(
  {
    activeAudioWord,
    backgroundWarmEnabled = true,
    backgroundPageNumbers,
    chapterNamesById,
    compactPageLines = false,
    expectedVersion,
    filterChapterId,
    focusBottomInsetPx = 0,
    focusTopInsetPx,
    highlightVerseKey,
    initialPageData,
    initialPageNumber,
    mushafScaleStep,
    onActivePageChange,
    onActiveVerseChange,
    onInitialPositioned,
    onSelectionChange,
    onScrollActivity,
    onSurahNavigation,
    onVersePress,
    onWordSeek,
    pageNumbers,
    packId,
    surahIntro,
    surahNavigation,
    totalPages,
    wordSeekEnabled = false,
  },
  ref
): React.JSX.Element {
  const { width, height } = useWindowDimensions();
  const { resolvedTheme } = useAppTheme();
  const readerBackgroundColor = resolvedTheme === 'dark' ? '#0B1220' : '#F7F9F9';
  const webViewRef = React.useRef<WebView>(null);
  const isReaderReadyRef = React.useRef(false);
  const hasInitialPaintRef = React.useRef(false);
  const readerSessionRef = React.useRef(0);
  const backgroundWarmRunRef = React.useRef(0);
  const backgroundWarmTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialRevealFallbackTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const backgroundWarmQueueRef = React.useRef<number[]>([]);
  const hasCompletedBackgroundWarmRef = React.useRef(false);
  const activePageNumberRef = React.useRef(initialPageNumber);
  const pageDataByNumberRef = React.useRef(new Map<number, MushafPageData>());
  const requestedPageNumbersRef = React.useRef(new Set<number>());
  const loadingPageNumbersRef = React.useRef(new Set<number>());
  const pageLoadRetryCountsRef = React.useRef(new Map<number, number>());
  const loadPagesRef = React.useRef<((pageNumbers: number[], reason: string) => void) | null>(null);
  // Neighbor pages wait until the initial page has rendered. The WebView renders injected pages
  // one at a time, so a neighbor whose data arrived first used to delay the visible page.
  const hasRenderedInitialPageRef = React.useRef(false);
  const deferredPageNumbersRef = React.useRef(new Set<number>());
  // Set once the WebView reports that it could not read a page font file directly.
  const embedFontDataRef = React.useRef(false);
  const activeAudioVerseLoadRef = React.useRef<string | null>(null);
  const allowedPageNumbers = React.useMemo(
    () => normalizeAllowedPageNumbers(pageNumbers, totalPages),
    [pageNumbers, totalPages]
  );

  const estimatedPageHeight = React.useMemo(
    () =>
      estimateMushafWebViewPageHeight({
        packId,
        lines: initialPageData?.pack.lines ?? 15,
        mushafScaleStep,
        viewportHeight: height,
        viewportWidth: width,
      }),
    [height, initialPageData?.pack.lines, mushafScaleStep, packId, width]
  );
  // The top inset tracks the overlay header, whose measured height can settle
  // after the reader mounts. It is synced into the live document instead of
  // rebuilding the HTML, which would reload the WebView and blank every page.
  const focusTopInsetPxRef = React.useRef(focusTopInsetPx);
  focusTopInsetPxRef.current = focusTopInsetPx;
  const webViewSessionKey = React.useMemo(
    () =>
      [
        'mushaf-reader',
        packId,
        expectedVersion,
        mushafScaleStep,
        resolvedTheme,
        filterChapterId ?? '',
        initialPageNumber,
        totalPages,
        Math.round(width),
        Math.round(height),
        compactPageLines ? 'compact' : 'full',
        pageNumbers?.join(',') ?? 'all',
        surahIntro
          ? [
              surahIntro.chapterId,
              surahIntro.infoLabel,
              surahIntro.isMakkah ? 'makkah' : 'madinah',
              surahIntro.showBismillah ? 'bismillah' : 'no-bismillah',
              surahIntro.surahName,
            ].join('|')
          : 'no-intro',
        surahNavigation?.previousSurahName ?? '',
        surahNavigation?.nextSurahName ?? '',
        highlightVerseKey ?? '',
      ].join(':'),
    [
      compactPageLines,
      expectedVersion,
      filterChapterId,
      height,
      highlightVerseKey,
      initialPageNumber,
      mushafScaleStep,
      packId,
      pageNumbers,
      resolvedTheme,
      surahIntro,
      surahNavigation?.nextSurahName,
      surahNavigation?.previousSurahName,
      totalPages,
      width,
    ]
  );
  // Fixed per WebView session: changing the source reloads the WebView and blanks every page.
  // An opening page already in memory is embedded in the document so the WebView draws it
  // without waiting for React Native, which is still mounting the reader screen.
  const webViewSessionRef = React.useRef<{
    initialPages: MushafPageData[];
    key: string;
    packDirectoryUri?: string;
  } | null>(null);
  if (webViewSessionRef.current?.key !== webViewSessionKey) {
    const openingPageData =
      initialPageData?.pageNumber === initialPageNumber
        ? initialPageData
        : container.getMushafPageRepository().peekCachedPage({
            expectedVersion,
            packId,
            pageNumber: initialPageNumber,
          });
    const embeddablePageData =
      openingPageData?.pack.packId === packId &&
      openingPageData.pack.version.trim() === expectedVersion.trim()
        ? filterPageDataForChapter(openingPageData, filterChapterId)
        : null;
    const packDirectoryUri =
      embeddablePageData?.rendererAssets?.packDirectoryUri ??
      initialPageData?.rendererAssets?.packDirectoryUri;
    webViewSessionRef.current = {
      initialPages: embeddablePageData?.verses.length ? [embeddablePageData] : [],
      key: webViewSessionKey,
      ...(packDirectoryUri ? { packDirectoryUri } : {}),
    };
  }
  const sessionInitialPages = webViewSessionRef.current.initialPages;

  const shellDocument = React.useMemo(
    () =>
      buildMushafReaderWebViewShellDocument({
        compactPageLines,
        estimatedPageHeight,
        focusTopInsetPx: focusTopInsetPxRef.current,
        highlightVerseKey,
        initialPageNumber,
        initialPages: sessionInitialPages,
        mushafScaleStep,
        pageNumbers,
        packId,
        surahIntro,
        surahNavigation,
        theme: resolvedTheme,
        totalPages,
        viewportHeight: height,
      }),
    [
      estimatedPageHeight,
      height,
      highlightVerseKey,
      initialPageNumber,
      mushafScaleStep,
      pageNumbers,
      packId,
      resolvedTheme,
      compactPageLines,
      sessionInitialPages,
      surahIntro,
      surahNavigation,
      totalPages,
    ]
  );
  const injectPages = React.useCallback(
    (pages: MushafPageData[]) => {
      if (!isReaderReadyRef.current) {
        return;
      }

      const readyPages = hasRenderedInitialPageRef.current
        ? pages
        : pages.filter((page) => {
            if (page.pageNumber === initialPageNumber) return true;
            deferredPageNumbersRef.current.add(page.pageNumber);
            return false;
          });
      if (readyPages.length === 0) {
        return;
      }

      const injectReadyPages = (pagesToInject: MushafPageData[]) => {
        webViewRef.current?.injectJavaScript(
          buildMushafReaderWebViewPagesScript({
            focusTopInsetPx,
            highlightVerseKey,
            initialPageNumber,
            layout: shellDocument.layout,
            pages: pagesToInject,
          })
        );
      };

      if (!embedFontDataRef.current) {
        injectReadyPages(readyPages);
        return;
      }

      const readerSession = readerSessionRef.current;
      void Promise.all(readyPages.map(hydrateQcfFontDataUri)).then((hydratedPages) => {
        if (
          readerSessionRef.current !== readerSession ||
          !isReaderReadyRef.current
        ) {
          return;
        }

        injectReadyPages(hydratedPages);
      });
    },
    [focusTopInsetPx, highlightVerseKey, initialPageNumber, shellDocument.layout]
  );

  const releaseDeferredPages = React.useCallback(() => {
    if (hasRenderedInitialPageRef.current) {
      return;
    }

    hasRenderedInitialPageRef.current = true;
    const deferredPages = Array.from(deferredPageNumbersRef.current)
      .map((pageNumber) => pageDataByNumberRef.current.get(pageNumber))
      .filter((pageData): pageData is MushafPageData => Boolean(pageData));
    deferredPageNumbersRef.current = new Set();
    injectPages(deferredPages);
  }, [injectPages]);

  const syncActiveAudioWord = React.useCallback(() => {
    if (!isReaderReadyRef.current) {
      return;
    }

    const normalizedVerseKey =
      typeof activeAudioWord?.verseKey === 'string' ? activeAudioWord.verseKey.trim() : '';
    const normalizedWordPosition =
      typeof activeAudioWord?.wordPosition === 'number' &&
      Number.isFinite(activeAudioWord.wordPosition)
        ? Math.trunc(activeAudioWord.wordPosition)
        : 0;
    const payload = {
      bottomInsetPx: Math.max(0, Math.round(focusBottomInsetPx)),
      verseKey: normalizedVerseKey,
      wordPosition: normalizedWordPosition > 0 ? normalizedWordPosition : 0,
    };

    webViewRef.current?.injectJavaScript(`
      (function () {
        if (
          window.__MUSHAF_READER__ &&
          typeof window.__MUSHAF_READER__.setActiveAudioWord === 'function'
        ) {
          window.__MUSHAF_READER__.setActiveAudioWord(${JSON.stringify(payload)});
        }
      })();
      true;
    `);
  }, [
    activeAudioWord?.verseKey,
    activeAudioWord?.wordPosition,
    focusBottomInsetPx,
  ]);

  React.useEffect(() => {
    syncActiveAudioWord();
  }, [syncActiveAudioWord]);

  const syncFocusTopInset = React.useCallback(() => {
    if (!isReaderReadyRef.current) {
      return;
    }

    const insetPx = Math.max(0, Math.round(focusTopInsetPx));
    webViewRef.current?.injectJavaScript(`
      (function () {
        if (
          window.__MUSHAF_READER__ &&
          typeof window.__MUSHAF_READER__.setFocusTopInset === 'function'
        ) {
          window.__MUSHAF_READER__.setFocusTopInset(${insetPx});
        }
      })();
      true;
    `);
  }, [focusTopInsetPx]);

  React.useEffect(() => {
    syncFocusTopInset();
  }, [syncFocusTopInset]);

  const scrollToPage = React.useCallback(
    (pageNumber: number) => {
      if (!Number.isFinite(pageNumber)) {
        return;
      }

      const normalizedPageNumber = Math.min(
        Math.max(Math.trunc(pageNumber), 1),
        Math.max(1, totalPages)
      );

      if (allowedPageNumbers !== null && !allowedPageNumbers.has(normalizedPageNumber)) {
        return;
      }

      loadPagesRef.current?.(
        [normalizedPageNumber - 1, normalizedPageNumber, normalizedPageNumber + 1],
        'imperative-scroll-window'
      );

      webViewRef.current?.injectJavaScript(`
        (function () {
          if (window.__MUSHAF_READER__ && typeof window.__MUSHAF_READER__.scrollToPage === 'function') {
            window.__MUSHAF_READER__.scrollToPage(${normalizedPageNumber});
          }
        })();
        true;
      `);
    },
    [allowedPageNumbers, totalPages]
  );

  React.useImperativeHandle(ref, () => ({ scrollToPage }), [scrollToPage]);

  const rememberPageData = React.useCallback((pageData: MushafPageData): void => {
    pageDataByNumberRef.current.set(pageData.pageNumber, pageData);
    requestedPageNumbersRef.current.add(pageData.pageNumber);
  }, []);

  const loadPages = React.useCallback(
    (pageNumbers: number[], reason: string) => {
      const normalizedPageNumbers = normalizePageNumbers(pageNumbers, totalPages).filter(
        (pageNumber) =>
          (allowedPageNumbers === null || allowedPageNumbers.has(pageNumber)) &&
          !pageDataByNumberRef.current.has(pageNumber) &&
          !loadingPageNumbersRef.current.has(pageNumber)
      );

      if (normalizedPageNumbers.length === 0) {
        return;
      }

      const repository = container.getMushafPageRepository();
      normalizedPageNumbers.forEach((pageNumber) => {
        loadingPageNumbersRef.current.add(pageNumber);
        requestedPageNumbersRef.current.add(pageNumber);

        void repository
          .getPage({ packId, pageNumber })
          .then((pageData) => {
            if (pageData.pack.version.trim() !== expectedVersion.trim()) {
              return;
            }

            const filteredPageData = filterPageDataForChapter(pageData, filterChapterId);
            if (filteredPageData.verses.length === 0) {
              return;
            }

            rememberPageData(filteredPageData);
            injectPages([filteredPageData]);
          })
          .catch(() => {
            if (pageNumber === initialPageNumber) {
              const retryCount = pageLoadRetryCountsRef.current.get(pageNumber) ?? 0;
              if (retryCount < 2) {
                pageLoadRetryCountsRef.current.set(pageNumber, retryCount + 1);
                const session = readerSessionRef.current;
                setTimeout(() => {
                  if (readerSessionRef.current !== session) return;
                  loadPagesRef.current?.([pageNumber], `initial-page-retry-${retryCount + 1}`);
                }, 180 * (retryCount + 1));
              }
            }
          })
          .finally(() => {
            loadingPageNumbersRef.current.delete(pageNumber);
          });
      });
    },
    [
      allowedPageNumbers,
      expectedVersion,
      filterChapterId,
      initialPageNumber,
      injectPages,
      packId,
      rememberPageData,
      totalPages,
    ]
  );
  loadPagesRef.current = loadPages;

  React.useEffect(() => {
    const verseKey =
      typeof activeAudioWord?.verseKey === 'string' ? activeAudioWord.verseKey.trim() : '';
    if (!verseKey || activeAudioVerseLoadRef.current === verseKey) {
      return;
    }

    activeAudioVerseLoadRef.current = verseKey;
    let cancelled = false;
    const repository = container.getMushafPageRepository();

    void repository
      .findPageForVerse({ packId, verseKey })
      .then((pageNumber) => {
        if (
          cancelled ||
          activeAudioVerseLoadRef.current !== verseKey ||
          pageNumber === null ||
          (allowedPageNumbers !== null && !allowedPageNumbers.has(pageNumber))
        ) {
          return;
        }

        loadPages(
          [pageNumber - 1, pageNumber, pageNumber + 1],
          'active-audio-verse-window'
        );
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [activeAudioWord?.verseKey, allowedPageNumbers, loadPages, packId]);

  const clearBackgroundWarmTimeout = React.useCallback(() => {
    if (backgroundWarmTimeoutRef.current !== null) {
      clearTimeout(backgroundWarmTimeoutRef.current);
      backgroundWarmTimeoutRef.current = null;
    }
  }, []);

  const clearInitialRevealFallback = React.useCallback(() => {
    if (initialRevealFallbackTimeoutRef.current !== null) {
      clearTimeout(initialRevealFallbackTimeoutRef.current);
      initialRevealFallbackTimeoutRef.current = null;
    }
  }, []);

  const stopBackgroundWarm = React.useCallback(() => {
    backgroundWarmRunRef.current += 1;
    backgroundWarmQueueRef.current = [];
    clearBackgroundWarmTimeout();
  }, [clearBackgroundWarmTimeout]);

  const startBackgroundWarm = React.useCallback(
    (reason: string, anchorPageNumber: number) => {
      if (
        !backgroundWarmEnabled ||
        !shouldBackgroundWarmPageNumbers(pageNumbers) ||
        hasCompletedBackgroundWarmRef.current
      ) {
        return;
      }

      const normalizedPageNumbers = normalizePageNumbers(pageNumbers, totalPages).filter(
        (candidate) =>
          (allowedPageNumbers === null || allowedPageNumbers.has(candidate)) &&
          !pageDataByNumberRef.current.has(candidate) &&
          !loadingPageNumbersRef.current.has(candidate)
      );
      const queue = sortPageNumbersByDistance(
        normalizedPageNumbers,
        anchorPageNumber
      ).slice(0, MAX_BACKGROUND_WARM_PAGE_COUNT);

      if (queue.length === 0) {
        hasCompletedBackgroundWarmRef.current = true;
        return;
      }

      const readerSession = readerSessionRef.current;
      const warmRun = backgroundWarmRunRef.current + 1;
      backgroundWarmRunRef.current = warmRun;
      backgroundWarmQueueRef.current = queue;
      hasCompletedBackgroundWarmRef.current = false;
      clearBackgroundWarmTimeout();

      const runNextBatch = () => {
        if (
          readerSessionRef.current !== readerSession ||
          backgroundWarmRunRef.current !== warmRun ||
          !isReaderReadyRef.current
        ) {
          return;
        }

        const batch: number[] = [];
        const queueRef = backgroundWarmQueueRef.current;

        while (queueRef.length > 0 && batch.length < BACKGROUND_WARM_BATCH_SIZE) {
          const nextPageNumber = queueRef.shift();
          if (
            typeof nextPageNumber === 'number' &&
            !pageDataByNumberRef.current.has(nextPageNumber) &&
            !loadingPageNumbersRef.current.has(nextPageNumber)
          ) {
            batch.push(nextPageNumber);
          }
        }

        if (batch.length > 0) {
          loadPages(batch, reason);
        }

        if (queueRef.length === 0) {
          backgroundWarmTimeoutRef.current = null;
          hasCompletedBackgroundWarmRef.current = true;
          return;
        }

        backgroundWarmTimeoutRef.current = setTimeout(
          runNextBatch,
          BACKGROUND_WARM_BATCH_DELAY_MS
        );
      };

      backgroundWarmTimeoutRef.current = setTimeout(
        runNextBatch,
        BACKGROUND_WARM_START_DELAY_MS
      );
    },
    [
      allowedPageNumbers,
      backgroundWarmEnabled,
      clearBackgroundWarmTimeout,
      loadPages,
      pageNumbers,
      totalPages,
    ]
  );

  React.useEffect(() => {
    if (!backgroundWarmEnabled) {
      stopBackgroundWarm();
      return;
    }
    if (hasInitialPaintRef.current) {
      startBackgroundWarm('reader-became-visible', activePageNumberRef.current);
    }
  }, [backgroundWarmEnabled, startBackgroundWarm, stopBackgroundWarm]);

  React.useEffect(() => {
    stopBackgroundWarm();
    clearInitialRevealFallback();
    readerSessionRef.current += 1;
    isReaderReadyRef.current = false;
    hasInitialPaintRef.current = false;
    hasRenderedInitialPageRef.current = false;
    deferredPageNumbersRef.current = new Set();
    hasCompletedBackgroundWarmRef.current = false;
    activePageNumberRef.current = initialPageNumber;
    pageDataByNumberRef.current = new Map();
    requestedPageNumbersRef.current = new Set();
    loadingPageNumbersRef.current = new Set();
    pageLoadRetryCountsRef.current = new Map();
    activeAudioVerseLoadRef.current = null;
    if (
      initialPageData?.pack.packId === packId &&
      initialPageData.pack.version.trim() === expectedVersion.trim()
    ) {
      rememberPageData(filterPageDataForChapter(initialPageData, filterChapterId));
    }
    // Word presses on an embedded page resolve their verse from this map.
    webViewSessionRef.current?.initialPages.forEach(rememberPageData);
  }, [
    expectedVersion,
    clearInitialRevealFallback,
    filterChapterId,
    initialPageNumber,
    mushafScaleStep,
    packId,
    rememberPageData,
    resolvedTheme,
    stopBackgroundWarm,
    totalPages,
  ]);

  React.useEffect(() => stopBackgroundWarm, [stopBackgroundWarm]);
  React.useEffect(() => clearInitialRevealFallback, [clearInitialRevealFallback]);

  const revealReader = React.useCallback(() => {
    if (hasInitialPaintRef.current) {
      return;
    }

    clearInitialRevealFallback();
    hasInitialPaintRef.current = true;
    releaseDeferredPages();
    onInitialPositioned?.();
  }, [clearInitialRevealFallback, onInitialPositioned, releaseDeferredPages]);

  React.useEffect(() => {
    if (
      initialPageData?.pack.packId === packId &&
      initialPageData.pack.version.trim() === expectedVersion.trim()
    ) {
      const filteredPageData = filterPageDataForChapter(initialPageData, filterChapterId);
      if (filteredPageData.verses.length > 0) {
        rememberPageData(filteredPageData);
        injectPages([filteredPageData]);
      }
    }
  }, [expectedVersion, filterChapterId, initialPageData, injectPages, packId, rememberPageData]);

  React.useEffect(() => {
    const session = readerSessionRef.current;
    loadPages([initialPageNumber], 'initial-page');

    const nearWindowTimeout = setTimeout(() => {
      if (readerSessionRef.current !== session) return;
      if (!isReaderReadyRef.current) return;
      loadPages([initialPageNumber - 1, initialPageNumber + 1], 'near-window');
    }, 90);

    const backgroundTimeout = setTimeout(() => {
      if (readerSessionRef.current !== session) return;
      if (!isReaderReadyRef.current) return;
      loadPages(
        [
          initialPageNumber - 2,
          initialPageNumber + 2,
          ...backgroundPageNumbers,
        ],
        'background-range'
      );
    }, 360);

    return () => {
      clearTimeout(nearWindowTimeout);
      clearTimeout(backgroundTimeout);
    };
  }, [backgroundPageNumbers, initialPageNumber, loadPages]);

  const handleWordPress = React.useCallback(
    (payload: MushafWordPressPayload) => {
      const verseKey = resolveMushafVerseKey(payload);
      if (!verseKey) return;

      const wordPosition =
        typeof payload.wordPosition === 'number' && Number.isFinite(payload.wordPosition)
          ? Math.trunc(payload.wordPosition)
          : 0;
      if (
        wordSeekEnabled &&
        onWordSeek &&
        payload.charType !== 'end' &&
        wordPosition > 0
      ) {
        onWordSeek({ verseKey, wordPosition });
        return;
      }

      const pageNumber =
        typeof payload.pageNumber === 'number' && Number.isFinite(payload.pageNumber)
          ? Math.trunc(payload.pageNumber)
          : null;
      const pageData = pageNumber === null ? null : pageDataByNumberRef.current.get(pageNumber);
      const verse = pageData?.verses.find((candidate) => candidate.verseKey === verseKey);
      if (!verse) return;

      const parsed = parseVerseKeyNumbers(verseKey);
      if (!parsed) return;

      onVersePress({
        title: chapterNamesById.get(parsed.surahId) ?? `Surah ${parsed.surahId}`,
        surahId: parsed.surahId,
        verseKey,
        ...(typeof verse.id === 'number' && Number.isFinite(verse.id) && verse.id > 0
          ? { verseApiId: verse.id }
          : {}),
        arabicText: resolveMushafVerseText(verse),
        translationTexts: [],
        wordPosition,
        ...(payload.text.trim() ? { surfaceText: payload.text.trim() } : {}),
        verseWords: verse.words
          .filter((word) => word.charType !== 'end')
          .map((word) => ({
            wordPosition: word.position,
            surfaceText: (word.textUthmani ?? word.textQpcHafs ?? word.textIndopak ?? '').trim(),
          }))
          .filter((word) => word.wordPosition > 0 && word.surfaceText.length > 0),
      });
    },
    [chapterNamesById, onVersePress, onWordSeek, wordSeekEnabled]
  );

  const handleMessage = React.useCallback(
    (rawMessage: string) => {
      let parsed: unknown;

      try {
        parsed = JSON.parse(rawMessage);
      } catch {
        return;
      }

      if (!isReaderMessage(parsed)) {
        return;
      }

      switch (parsed.type) {
        case 'renderer-ready': {
          isReaderReadyRef.current = true;
          syncFocusTopInset();
          syncActiveAudioWord();
          const loadedPages = Array.from(pageDataByNumberRef.current.values());
          injectPages(loadedPages);
          loadPages([initialPageNumber], 'renderer-ready');
          const session = readerSessionRef.current;
          setTimeout(() => {
            if (readerSessionRef.current !== session || !isReaderReadyRef.current) return;
            loadPages(
              [initialPageNumber - 1, initialPageNumber + 1],
              'renderer-ready-near-window'
            );
          }, 90);
          // Never strand neighbors if the initial page cannot render.
          setTimeout(() => {
            if (readerSessionRef.current !== session || !isReaderReadyRef.current) return;
            releaseDeferredPages();
          }, DEFERRED_PAGE_RELEASE_FALLBACK_MS);
          return;
        }
        case 'page-window-request': {
          const payload = parsed.payload as { pageNumbers?: unknown } | undefined;
          const requestedPageNumbers = Array.isArray(payload?.pageNumbers)
            ? payload.pageNumbers.filter((pageNumber): pageNumber is number =>
                Number.isFinite(pageNumber)
              )
            : [];
          loadPages(requestedPageNumbers, 'webview-window-request');
          return;
        }
        case 'reader-page-rendered': {
          const payload = parsed.payload as { pageNumber?: unknown } | undefined;
          const pageNumber =
            typeof payload?.pageNumber === 'number' && Number.isFinite(payload.pageNumber)
              ? Math.trunc(payload.pageNumber)
              : null;
          if (pageNumber === initialPageNumber || pageNumber === null) {
            releaseDeferredPages();
            startBackgroundWarm(
              'post-first-visible-page',
              pageNumber ?? activePageNumberRef.current
            );
            if (initialRevealFallbackTimeoutRef.current === null) {
              const session = readerSessionRef.current;
              initialRevealFallbackTimeoutRef.current = setTimeout(() => {
                initialRevealFallbackTimeoutRef.current = null;
                if (readerSessionRef.current === session) {
                  revealReader();
                }
              }, 600);
            }
          }
          return;
        }
        case 'qcf-font-file-failed': {
          const payload = parsed.payload as { pageNumber?: unknown } | undefined;
          const pageNumber =
            typeof payload?.pageNumber === 'number' && Number.isFinite(payload.pageNumber)
              ? Math.trunc(payload.pageNumber)
              : null;
          embedFontDataRef.current = true;
          const pageData = pageNumber === null ? undefined : pageDataByNumberRef.current.get(pageNumber);
          if (pageData) {
            injectPages([pageData]);
          }
          return;
        }
        case 'reader-initial-positioned': {
          revealReader();
          return;
        }
        case 'reader-active-page-change': {
          const payload = parsed.payload as
            | { pageNumber?: unknown; verseKey?: unknown }
            | undefined;
          const pageNumber =
            typeof payload?.pageNumber === 'number' && Number.isFinite(payload.pageNumber)
              ? Math.trunc(payload.pageNumber)
              : null;
          const verseKey =
            typeof payload?.verseKey === 'string' ? payload.verseKey.trim() : '';
          if (verseKey) {
            onActiveVerseChange?.(verseKey);
          }
          if (pageNumber !== null) {
            activePageNumberRef.current = pageNumber;
            onActivePageChange?.(pageNumber);
            if (hasInitialPaintRef.current && !hasCompletedBackgroundWarmRef.current) {
              startBackgroundWarm('active-page-priority-change', pageNumber);
            }
          }
          return;
        }
        case 'reader-scroll': {
          const payload = parsed.payload as { scrollY?: unknown } | undefined;
          onScrollActivity?.(
            typeof payload?.scrollY === 'number' && Number.isFinite(payload.scrollY)
              ? payload.scrollY
              : undefined
          );
          return;
        }
        case 'selection-change':
          onSelectionChange(parsed.payload as MushafSelectionPayload);
          return;
        case 'word-press':
          handleWordPress(parsed.payload as MushafWordPressPayload);
          return;
        case 'surah-navigation': {
          const payload = parsed.payload as { direction?: unknown } | undefined;
          const direction = payload?.direction;
          if (direction === 'next' || direction === 'previous') {
            onSurahNavigation?.(direction);
          }
          return;
        }
        default:
          return;
      }
    },
    [
      handleWordPress,
      clearInitialRevealFallback,
      initialPageNumber,
      injectPages,
      loadPages,
      onActivePageChange,
      onActiveVerseChange,
      onSelectionChange,
      onScrollActivity,
      onSurahNavigation,
      releaseDeferredPages,
      revealReader,
      startBackgroundWarm,
      syncActiveAudioWord,
      syncFocusTopInset,
    ]
  );
  const handleLoadStart = React.useCallback(() => {
    isReaderReadyRef.current = false;
    hasInitialPaintRef.current = false;
    hasRenderedInitialPageRef.current = false;
  }, []);
  const handleLoadEnd = React.useCallback(() => {
    webViewRef.current?.injectJavaScript(`
      (function announceRendererReady(attempt) {
        if (
          window.__MUSHAF_READER__ &&
          window.ReactNativeWebView
        ) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'renderer-ready',
            payload: { ready: true, source: 'native-load-end' }
          }));
          return;
        }
        if (attempt < 4) {
          setTimeout(function () {
            announceRendererReady(attempt + 1);
          }, 120);
        }
      })(0);
      true;
    `);
  }, []);
  const handleMessageRef = React.useRef(handleMessage);
  handleMessageRef.current = handleMessage;
  const handleWebViewMessage = React.useCallback(
    (event: WebViewMessageEvent) => handleMessageRef.current(event.nativeEvent.data),
    []
  );

  const packDirectoryUri = webViewSessionRef.current.packDirectoryUri;

  return (
    <View style={[styles.container, { backgroundColor: readerBackgroundColor }]}>
      <View style={styles.webViewShell}>
        <MushafWebViewSurface
          ref={webViewRef}
          allowingReadAccessToURL={packDirectoryUri}
          backgroundColor={readerBackgroundColor}
          html={shellDocument.html}
          onLoadEnd={handleLoadEnd}
          onLoadStart={handleLoadStart}
          onMessage={handleWebViewMessage}
          sessionKey={webViewSessionKey}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webViewShell: {
    flex: 1,
  },
  webView: {
    flex: 1,
  },
});
