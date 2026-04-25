import React from 'react';
import { Animated, StyleSheet, View, useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';

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
};

type MushafSingleDocumentReaderProps = {
  backgroundPageNumbers: number[];
  chapterNamesById: Map<number, string>;
  compactPageLines?: boolean;
  expectedVersion: string;
  filterChapterId?: number;
  focusTopInsetPx: number;
  highlightVerseKey?: string | null;
  initialPageData?: MushafPageData | null;
  initialPageNumber: number;
  mushafScaleStep: MushafScaleStep;
  onSelectionChange: (payload: MushafSelectionPayload) => void;
  onSurahNavigation?: (direction: 'next' | 'previous') => void;
  onVersePress: (verse: MushafSingleDocumentVersePress) => void;
  pageNumbers?: number[];
  packId: MushafPackId;
  surahIntro?: MushafReaderSurahIntro;
  surahNavigation?: MushafReaderSurahNavigation;
  totalPages: number;
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

const ENABLE_MUSHAF_QCF_DEV_LOGS = __DEV__;

function logMushafQcfDev(event: string, details: Record<string, unknown>): void {
  if (!ENABLE_MUSHAF_QCF_DEV_LOGS) {
    return;
  }

  console.log(`[mushaf-qcf][MushafSingleDocumentReader] ${event}`, details);
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

export function MushafSingleDocumentReader({
  backgroundPageNumbers,
  chapterNamesById,
  compactPageLines = false,
  expectedVersion,
  filterChapterId,
  focusTopInsetPx,
  highlightVerseKey,
  initialPageData,
  initialPageNumber,
  mushafScaleStep,
  onSelectionChange,
  onSurahNavigation,
  onVersePress,
  pageNumbers,
  packId,
  surahIntro,
  surahNavigation,
  totalPages,
}: MushafSingleDocumentReaderProps): React.JSX.Element {
  const { width, height } = useWindowDimensions();
  const { resolvedTheme } = useAppTheme();
  const readerBackgroundColor = resolvedTheme === 'dark' ? '#102033' : '#F7F9F9';
  const webViewRef = React.useRef<WebView>(null);
  const isReaderReadyRef = React.useRef(false);
  const hasInitialPaintRef = React.useRef(false);
  const readerOpacity = React.useRef(new Animated.Value(0)).current;
  const readerSessionRef = React.useRef(0);
  const pageDataByNumberRef = React.useRef(new Map<number, MushafPageData>());
  const requestedPageNumbersRef = React.useRef(new Set<number>());
  const loadingPageNumbersRef = React.useRef(new Set<number>());
  const firstPackDirectoryUriRef = React.useRef<string | null>(
    initialPageData?.rendererAssets?.packDirectoryUri ?? null
  );
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
  const shellDocument = React.useMemo(
    () =>
      buildMushafReaderWebViewShellDocument({
        compactPageLines,
        estimatedPageHeight,
        focusTopInsetPx,
        highlightVerseKey,
        initialPageNumber,
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
      focusTopInsetPx,
      height,
      highlightVerseKey,
      initialPageNumber,
      mushafScaleStep,
      pageNumbers,
      packId,
      resolvedTheme,
      compactPageLines,
      surahIntro,
      surahNavigation,
      totalPages,
    ]
  );

  const injectPages = React.useCallback(
    (pages: MushafPageData[]) => {
      if (!isReaderReadyRef.current || pages.length === 0) {
        return;
      }

      webViewRef.current?.injectJavaScript(
        buildMushafReaderWebViewPagesScript({
          focusTopInsetPx,
          highlightVerseKey,
          initialPageNumber,
          layout: shellDocument.layout,
          pages,
        })
      );
    },
    [focusTopInsetPx, highlightVerseKey, initialPageNumber, shellDocument.layout]
  );

  const rememberPageData = React.useCallback((pageData: MushafPageData): void => {
    pageDataByNumberRef.current.set(pageData.pageNumber, pageData);
    requestedPageNumbersRef.current.add(pageData.pageNumber);
    if (!firstPackDirectoryUriRef.current && pageData.rendererAssets?.packDirectoryUri) {
      firstPackDirectoryUriRef.current = pageData.rendererAssets.packDirectoryUri;
    }
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
              logMushafQcfDev('page-load-version-mismatch', {
                expectedVersion,
                pageNumber,
                reason,
                resolvedVersion: pageData.pack.version,
              });
              return;
            }

            const filteredPageData = filterPageDataForChapter(pageData, filterChapterId);
            if (filteredPageData.verses.length === 0) {
              return;
            }

            rememberPageData(filteredPageData);
            injectPages([filteredPageData]);
          })
          .catch((error) => {
            logMushafQcfDev('page-load-error', {
              error: error instanceof Error ? error.message : String(error),
              pageNumber,
              reason,
            });
          })
          .finally(() => {
            loadingPageNumbersRef.current.delete(pageNumber);
          });
      });
    },
    [allowedPageNumbers, expectedVersion, filterChapterId, injectPages, packId, rememberPageData, totalPages]
  );

  React.useEffect(() => {
    readerSessionRef.current += 1;
    isReaderReadyRef.current = false;
    hasInitialPaintRef.current = false;
    readerOpacity.setValue(0);
    pageDataByNumberRef.current = new Map();
    requestedPageNumbersRef.current = new Set();
    loadingPageNumbersRef.current = new Set();
    firstPackDirectoryUriRef.current = initialPageData?.rendererAssets?.packDirectoryUri ?? null;

    if (
      initialPageData?.pack.packId === packId &&
      initialPageData.pack.version.trim() === expectedVersion.trim()
    ) {
      rememberPageData(filterPageDataForChapter(initialPageData, filterChapterId));
    }
  }, [
    expectedVersion,
    filterChapterId,
    initialPageNumber,
    mushafScaleStep,
    packId,
    rememberPageData,
    resolvedTheme,
    totalPages,
  ]);

  const revealReader = React.useCallback(() => {
    if (hasInitialPaintRef.current) {
      return;
    }

    hasInitialPaintRef.current = true;
    Animated.timing(readerOpacity, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [readerOpacity]);

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
        wordPosition:
          typeof payload.wordPosition === 'number' && Number.isFinite(payload.wordPosition)
            ? Math.trunc(payload.wordPosition)
            : 0,
      });
    },
    [chapterNamesById, onVersePress]
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
            revealReader();
          }
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
      initialPageNumber,
      injectPages,
      loadPages,
      onSelectionChange,
      onSurahNavigation,
      revealReader,
    ]
  );

  const packDirectoryUri = firstPackDirectoryUriRef.current ?? undefined;

  return (
    <View style={[styles.container, { backgroundColor: readerBackgroundColor }]}>
      <Animated.View style={[styles.webViewShell, { opacity: readerOpacity }]}>
        <WebView
          key={`mushaf-reader:${packId}:${expectedVersion}:${mushafScaleStep}:${resolvedTheme}:${filterChapterId ?? ''}:${initialPageNumber}:${totalPages}:${Math.round(width)}:${Math.round(height)}:${Math.round(focusTopInsetPx)}:${surahNavigation?.previousSurahName ?? ''}:${surahNavigation?.nextSurahName ?? ''}:${highlightVerseKey ?? ''}`}
          ref={webViewRef}
          originWhitelist={['*']}
          source={{
            html: shellDocument.html,
            ...(packDirectoryUri ? { baseUrl: packDirectoryUri } : {}),
          }}
          scrollEnabled
          nestedScrollEnabled
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
          onLoadStart={() => {
            isReaderReadyRef.current = false;
            hasInitialPaintRef.current = false;
            readerOpacity.setValue(0);
          }}
          onMessage={(event) => handleMessage(event.nativeEvent.data)}
          style={[styles.webView, { backgroundColor: readerBackgroundColor }]}
        />
      </Animated.View>
    </View>
  );
}

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
