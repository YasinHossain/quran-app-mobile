import type { MushafPackId, MushafPageData, MushafScaleStep } from '@/types';

import { getMushafWebViewLayoutConfig } from '@/components/mushaf/mushafLayoutPresets';

type MushafReaderWebViewTheme = 'light' | 'dark';

type MushafReaderWebViewLayoutPayload = {
  fontSizeCss: string;
  isExactPreset: boolean;
  lineWidthCss: string;
  lineHeightMultiplier: number;
  reflowLineHeightMultiplier: number;
};

const REFLOW_HYSTERESIS_PX = 20;
const shellDocumentCache = new Map<string, { html: string; layout: MushafReaderWebViewLayoutPayload }>();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function serializeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function buildPageShells(totalPages: number, estimatedPageHeight: number): string {
  const pageMinHeight = Math.max(280, Math.round(estimatedPageHeight));
  const pageShells: string[] = [];

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    pageShells.push(`
      <article class="reader-page loading" data-page-number="${pageNumber}">
        <div class="page-content" style="min-height: ${pageMinHeight}px;">
          <div class="standard-view"></div>
          <div class="reflow-view"></div>
        </div>
        <footer class="page-footer" aria-hidden="true">
          <span></span><b>Page ${pageNumber}</b><span></span>
        </footer>
      </article>
    `);
  }

  return pageShells.join('\n');
}

function buildShellDocumentHtml({
  estimatedPageHeight,
  focusTopInsetPx,
  highlightVerseKey,
  initialPageNumber,
  layout,
  theme,
  totalPages,
}: {
  estimatedPageHeight: number;
  focusTopInsetPx: number;
  highlightVerseKey?: string | null;
  initialPageNumber: number;
  layout: MushafReaderWebViewLayoutPayload;
  theme: MushafReaderWebViewTheme;
  totalPages: number;
}): string {
  const palette =
    theme === 'dark'
      ? {
          background: '#102033',
          border: 'rgba(255,255,255,0.12)',
          highlight: 'rgba(250, 204, 21, 0.22)',
          text: '#E7E5E4',
          muted: '#94A3B8',
        }
      : {
          background: '#F7F9F9',
          border: 'rgba(15,23,42,0.12)',
          highlight: 'rgba(245, 158, 11, 0.18)',
          text: '#111827',
          muted: '#6B7280',
        };

  const normalizedTotalPages = Math.max(1, Math.trunc(totalPages));
  const normalizedInitialPageNumber = Math.min(
    Math.max(1, Math.trunc(initialPageNumber)),
    normalizedTotalPages
  );

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
    />
    <title>${escapeHtml('Mushaf')}</title>
    <style>
      :root {
        color-scheme: ${theme};
        --background: ${palette.background};
        --border: ${palette.border};
        --highlight: ${palette.highlight};
        --text: ${palette.text};
        --muted: ${palette.muted};
        --font-size: ${layout.fontSizeCss};
        --line-height-multiplier: ${layout.lineHeightMultiplier};
        --line-height: calc(var(--font-size) * var(--line-height-multiplier));
        --reflow-line-height-multiplier: ${layout.reflowLineHeightMultiplier};
        --reflow-line-height: calc(var(--font-size) * var(--reflow-line-height-multiplier));
        --exact-line-width: ${layout.lineWidthCss};
        --line-gap: 4px;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        padding: 0;
        background: var(--background);
        color: var(--text);
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        scroll-behavior: auto;
      }

      body {
        min-height: 100vh;
        overflow-x: hidden;
      }

      #app {
        width: min(calc(100vw - 8px), 720px);
        margin: 0 auto;
        padding: 12px 0 24px;
      }

      .reader-page {
        width: 100%;
        overflow: hidden;
      }

      .reader-page + .reader-page {
        margin-top: 10px;
      }

      .page-content {
        width: 100%;
      }

      .standard-view {
        width: 100%;
      }

      .line-shell {
        direction: rtl;
        margin: 0 auto;
        font-size: var(--font-size);
        max-width: 100%;
        text-align: center;
        width: min(var(--exact-line-width), 100%);
      }

      .line-shell + .line-shell {
        margin-top: var(--line-gap);
      }

      .line-content {
        align-items: center;
        color: var(--text);
        direction: rtl;
        display: flex;
        justify-content: space-between;
        line-height: var(--line-height);
        min-height: var(--line-height);
        white-space: nowrap;
      }

      .line-shell.blank .line-content {
        color: transparent;
        justify-content: center;
        user-select: none;
      }

      .reader-page.reflow .standard-view {
        display: none;
      }

      .reflow-view {
        display: none;
        width: 100%;
      }

      .reader-page.reflow .reflow-view {
        display: block;
      }

      .reflow-copy {
        direction: rtl;
        font-size: var(--font-size);
        line-height: var(--reflow-line-height);
        margin: 0 auto;
        text-align: center;
        width: 100%;
      }

      .word,
      .reflow-word {
        align-items: center;
        color: inherit;
        display: inline-flex;
        -webkit-touch-callout: default;
        -webkit-user-select: text;
        user-select: text;
      }

      .word.qcf-word,
      .reflow-word.qcf-word {
        font-weight: 400;
      }

      .word.arrival-highlight,
      .reflow-word.arrival-highlight {
        box-shadow: inset 0 -0.5em 0 var(--highlight);
        border-radius: 0.3em;
      }

      .reflow-spacer {
        white-space: pre;
      }

      .page-footer {
        align-items: center;
        color: var(--muted);
        display: flex;
        font-size: 12px;
        font-weight: 500;
        gap: 12px;
        justify-content: center;
        padding: 12px 12px 0;
      }

      .page-footer span {
        background: var(--border);
        height: 1px;
        max-width: 80px;
        width: 22%;
      }

      .page-footer b {
        font: inherit;
      }
    </style>
  </head>
  <body>
    <main id="app" aria-label="Mushaf pages">
      ${buildPageShells(normalizedTotalPages, estimatedPageHeight)}
    </main>
    <script>
      (function () {
        var app = document.getElementById('app');
        if (!app) {
          return;
        }

        var INITIAL_PAGE_NUMBER = ${normalizedInitialPageNumber};
        var HIGHLIGHT_VERSE_KEY = ${serializeJson(highlightVerseKey ?? '')};
        var FOCUS_TOP_INSET_PX = ${Math.max(0, Math.round(focusTopInsetPx))};
        var REFLOW_HYSTERESIS_PX = ${REFLOW_HYSTERESIS_PX};
        var pageStates = new Map();
        var loadedPageNumbers = new Set();
        var activeRenderTokens = Object.create(null);
        var scrollRequestTimeoutId = null;
        var selectionRafId = null;
        var didScrollToInitialPage = false;
        var didScrollToHighlight = false;

        function emit(message) {
          if (!window.ReactNativeWebView) {
            return;
          }

          window.ReactNativeWebView.postMessage(JSON.stringify(message));
        }

        function parseCssLengthToPx(value) {
          if (typeof value === 'number') {
            return value;
          }

          var pxMatch = String(value).match(/^(\\d+(?:\\.\\d+)?)px$/);
          if (pxMatch && pxMatch[1]) {
            return parseFloat(pxMatch[1]);
          }

          var vhMatch = String(value).match(/^(\\d+(?:\\.\\d+)?)vh$/);
          if (vhMatch && vhMatch[1]) {
            return (parseFloat(vhMatch[1]) / 100) * window.innerHeight;
          }

          var numeric = parseFloat(String(value));
          return Number.isFinite(numeric) ? numeric : 0;
        }

        function normalizeCopyText(value) {
          return String(value || '')
            .replace(/\\s+/g, ' ')
            .trim();
        }

        function resolveVerseKey(word) {
          if (typeof word.verseKey === 'string' && word.verseKey.trim()) {
            return word.verseKey.trim();
          }

          if (typeof word.location === 'string' && word.location.trim()) {
            var parts = word.location.split(':');
            if (parts.length >= 2 && parts[0] && parts[1]) {
              return String(parts[0]) + ':' + String(parts[1]);
            }
          }

          return undefined;
        }

        function resolveWordText(pageData, word) {
          var rendererAssets = pageData.rendererAssets || {};
          var qcfVersion =
            typeof rendererAssets.qcfVersion === 'string' ? rendererAssets.qcfVersion : null;

          if (qcfVersion) {
            return word.textQpcHafs || word.textUthmani || word.textIndopak || '';
          }

          if (pageData.pack && pageData.pack.script === 'indopak') {
            return word.textIndopak || word.textUthmani || '';
          }

          return word.textUthmani || word.textIndopak || word.textQpcHafs || '';
        }

        function getGlyphCode(pageData, word) {
          var rendererAssets = pageData.rendererAssets || {};
          if (!rendererAssets.qcfVersion) {
            return '';
          }

          return rendererAssets.qcfVersion === 'v1'
            ? word.codeV1 || ''
            : word.codeV2 || '';
        }

        function getPageState(pageNumber) {
          var normalizedPageNumber = Number(pageNumber);
          if (!Number.isFinite(normalizedPageNumber)) {
            return null;
          }

          var existing = pageStates.get(normalizedPageNumber);
          if (existing) {
            return existing;
          }

          var root = app.querySelector('[data-page-number="' + String(normalizedPageNumber) + '"]');
          if (!(root instanceof HTMLElement)) {
            return null;
          }

          var state = {
            data: null,
            lastContainerWidth: 0,
            pageNumber: normalizedPageNumber,
            reflowState: null,
            root: root,
            content: root.querySelector('.page-content'),
            standardView: root.querySelector('.standard-view'),
            reflowView: root.querySelector('.reflow-view'),
          };
          pageStates.set(normalizedPageNumber, state);
          return state;
        }

        function initPageStates() {
          var roots = Array.from(app.querySelectorAll('[data-page-number]'));
          for (var index = 0; index < roots.length; index += 1) {
            var pageNumber = parseInt(roots[index].getAttribute('data-page-number') || '', 10);
            if (Number.isFinite(pageNumber)) {
              getPageState(pageNumber);
            }
          }
        }

        function scrollToPage(pageNumber) {
          var state = getPageState(pageNumber);
          if (!state || !state.root) {
            return false;
          }

          window.scrollTo(0, Math.max(0, state.root.offsetTop));
          return true;
        }

        function toWordPayload(state, word) {
          return {
            charType: word.charType,
            lineNumber: word.lineNumber,
            location: word.location,
            pageNumber: state.pageNumber,
            text: state.data ? resolveWordText(state.data, word) : '',
            verseKey: resolveVerseKey(word),
            wordPosition: word.position,
          };
        }

        async function loadQcfPageFontIfNeeded(rendererAssets) {
          if (
            !rendererAssets ||
            !rendererAssets.qcfVersion ||
            !rendererAssets.pageFontFamily ||
            !rendererAssets.pageFontFileUri ||
            typeof FontFace === 'undefined'
          ) {
            return null;
          }

          var qcfFontFamily = rendererAssets.pageFontFamily;
          var qcfFontFileUri = rendererAssets.pageFontFileUri;
          var existingFontLoaded = Array.from(document.fonts || []).some(function (font) {
            return font.family === qcfFontFamily && font.status === 'loaded';
          });

          if (existingFontLoaded) {
            return qcfFontFamily;
          }

          try {
            var fontFace = new FontFace(
              qcfFontFamily,
              "url('" + String(qcfFontFileUri).replace(/'/g, "\\\\'") + "')"
            );
            fontFace.display = 'block';
            var loadedFace = await fontFace.load();
            if (document.fonts) {
              document.fonts.add(loadedFace);
            }
            return qcfFontFamily;
          } catch (error) {
            console.error('Failed to load local QCF page font', error);
            return null;
          }
        }

        function shouldUseReflow(state, layout) {
          if (!state || !state.content) {
            return false;
          }

          var containerWidth = state.content.clientWidth;
          var lineWidthPx = parseCssLengthToPx(layout.lineWidthCss);
          var threshold = containerWidth * 0.95;

          if (state.reflowState !== null) {
            threshold += state.reflowState ? REFLOW_HYSTERESIS_PX : -REFLOW_HYSTERESIS_PX;
          }

          return lineWidthPx > threshold;
        }

        function applyLayoutMode(state, layout) {
          if (!state || !state.content) {
            return;
          }

          var containerWidth = state.content.clientWidth;
          if (Math.abs(containerWidth - state.lastContainerWidth) < 10 && state.reflowState !== null) {
            return;
          }

          state.lastContainerWidth = containerWidth;
          state.reflowState = shouldUseReflow(state, layout);
          state.root.classList.toggle('reflow', state.reflowState);
        }

        function createWordNode(state, word, className, qcfFontFamily) {
          if (!state.data) {
            return null;
          }

          var rendererAssets = state.data.rendererAssets || {};
          var qcfVersion =
            typeof rendererAssets.qcfVersion === 'string' ? rendererAssets.qcfVersion : null;
          var wordText = resolveWordText(state.data, word);
          var glyphCode = getGlyphCode(state.data, word);
          var shouldUseQcfGlyph = Boolean(qcfVersion && qcfFontFamily && glyphCode);
          var verseKey = resolveVerseKey(word);

          if (!wordText && !shouldUseQcfGlyph) {
            return null;
          }

          var wordNode = document.createElement('span');
          wordNode.className = className;
          wordNode.dataset.mushafWord = 'true';
          wordNode.dataset.interactive = 'true';
          wordNode.dataset.payload = JSON.stringify(toWordPayload(state, word));
          wordNode.dataset.copyText = normalizeCopyText(wordText);
          wordNode.dataset.charType = String(word.charType || '');
          wordNode.dataset.pageNumber = String(state.pageNumber);
          if (verseKey) {
            wordNode.dataset.verseKey = verseKey;
            if (HIGHLIGHT_VERSE_KEY && HIGHLIGHT_VERSE_KEY === verseKey) {
              wordNode.classList.add('arrival-highlight');
            }
          }
          wordNode.dataset.wordPosition = String(word.position);

          if (shouldUseQcfGlyph) {
            wordNode.classList.add('qcf-word');
            wordNode.style.fontFamily = "'" + String(qcfFontFamily).replace(/'/g, "\\\\'") + "', serif";
            wordNode.innerHTML = glyphCode;
          } else {
            wordNode.textContent = wordText;
          }

          return wordNode;
        }

        function clearPage(state) {
          if (!state || !state.standardView || !state.reflowView) {
            return;
          }

          state.standardView.innerHTML = '';
          state.reflowView.innerHTML = '';
          state.root.classList.remove('reflow');
          state.reflowState = null;
          state.lastContainerWidth = 0;
        }

        function renderStandardLines(state, qcfFontFamily) {
          if (!state.data || !state.standardView) {
            return;
          }

          var linesByNumber = new Map(
            (state.data.pageLines.lines || []).map(function (line) {
              return [line.lineNumber, line];
            })
          );

          for (var lineNumber = 1; lineNumber <= state.data.pack.lines; lineNumber += 1) {
            var line = linesByNumber.get(lineNumber) || null;
            var lineShell = document.createElement('div');
            lineShell.className = 'line-shell';
            lineShell.setAttribute('dir', 'rtl');

            var lineContent = document.createElement('div');
            lineContent.className = 'line-content';
            lineContent.setAttribute('translate', 'no');
            lineShell.appendChild(lineContent);

            if (!line || !Array.isArray(line.words) || line.words.length === 0) {
              lineShell.classList.add('blank');
              lineContent.textContent = '\\u00A0';
              state.standardView.appendChild(lineShell);
              continue;
            }

            for (var index = 0; index < line.words.length; index += 1) {
              var wordNode = createWordNode(state, line.words[index], 'word', qcfFontFamily);
              if (wordNode) {
                lineContent.appendChild(wordNode);
              }
            }

            state.standardView.appendChild(lineShell);
          }
        }

        function renderReflowContent(state, qcfFontFamily) {
          if (!state.data || !state.reflowView) {
            return;
          }

          var reflowCopy = document.createElement('div');
          reflowCopy.className = 'reflow-copy';
          reflowCopy.setAttribute('dir', 'rtl');
          reflowCopy.setAttribute('translate', 'no');

          var words = [];
          var pageLines = Array.isArray(state.data.pageLines.lines)
            ? state.data.pageLines.lines
            : [];

          for (var lineIndex = 0; lineIndex < pageLines.length; lineIndex += 1) {
            var line = pageLines[lineIndex];
            if (!line || !Array.isArray(line.words)) {
              continue;
            }

            for (var wordIndex = 0; wordIndex < line.words.length; wordIndex += 1) {
              words.push(line.words[wordIndex]);
            }
          }

          for (var index = 0; index < words.length; index += 1) {
            var reflowWord = createWordNode(state, words[index], 'reflow-word', qcfFontFamily);
            if (!reflowWord) {
              continue;
            }

            reflowCopy.appendChild(reflowWord);

            if (index < words.length - 1) {
              var spacer = document.createElement('span');
              spacer.className = 'reflow-spacer';
              spacer.textContent = ' ';
              reflowCopy.appendChild(spacer);
            }
          }

          state.reflowView.appendChild(reflowCopy);
        }

        function emitPageRendered(state) {
          emit({
            type: 'reader-page-rendered',
            payload: {
              height: Math.ceil(state.root.getBoundingClientRect().height),
              pageNumber: state.pageNumber,
            },
          });
        }

        function collectHighlightAnchorPayload(state) {
          if (!state || !state.root || !HIGHLIGHT_VERSE_KEY) {
            return null;
          }

          var activeContainer = state.root.classList.contains('reflow')
            ? state.reflowView
            : state.standardView;
          if (!activeContainer) {
            return null;
          }

          var nodes = Array.from(activeContainer.querySelectorAll('[data-mushaf-word="true"]'));
          var matchingNodes = nodes.filter(function (node) {
            return node instanceof HTMLElement && node.dataset.verseKey === HIGHLIGHT_VERSE_KEY;
          });

          if (matchingNodes.length === 0) {
            return null;
          }

          var pageRect = state.root.getBoundingClientRect();
          var anchorTop = Number.POSITIVE_INFINITY;
          var anchorHeight = 0;

          for (var index = 0; index < matchingNodes.length; index += 1) {
            var nodeRect = matchingNodes[index].getBoundingClientRect();
            anchorTop = Math.min(anchorTop, nodeRect.top);
            anchorHeight = Math.max(anchorHeight, Math.ceil(nodeRect.height));
          }

          if (!Number.isFinite(anchorTop)) {
            return null;
          }

          return {
            height: Math.max(1, anchorHeight),
            offsetY: Math.max(0, Math.round(anchorTop - pageRect.top)),
            pageHeight: Math.max(1, Math.ceil(pageRect.height)),
            pageNumber: state.pageNumber,
            verseKey: HIGHLIGHT_VERSE_KEY,
          };
        }

        function scrollToHighlightedVerseIfReady(state) {
          if (didScrollToHighlight || !HIGHLIGHT_VERSE_KEY || state.pageNumber !== INITIAL_PAGE_NUMBER) {
            return;
          }

          var anchor = collectHighlightAnchorPayload(state);
          if (!anchor) {
            return;
          }

          var pageTop = state.root.offsetTop;
          window.scrollTo(0, Math.max(0, pageTop + anchor.offsetY - FOCUS_TOP_INSET_PX));
          didScrollToHighlight = true;
          emit({
            type: 'highlight-anchor',
            payload: anchor,
          });
        }

        async function renderPage(pageData, layout) {
          if (!pageData || !pageData.pageNumber) {
            return;
          }

          var state = getPageState(pageData.pageNumber);
          if (!state || !state.content) {
            return;
          }

          var pageNumber = state.pageNumber;
          var renderToken = (activeRenderTokens[pageNumber] || 0) + 1;
          activeRenderTokens[pageNumber] = renderToken;
          state.data = pageData;

          clearPage(state);
          var qcfFontFamily = await loadQcfPageFontIfNeeded(pageData.rendererAssets || {});
          if (activeRenderTokens[pageNumber] !== renderToken) {
            return;
          }

          renderStandardLines(state, qcfFontFamily);
          renderReflowContent(state, qcfFontFamily);
          applyLayoutMode(state, layout);
          state.root.classList.remove('loading');
          loadedPageNumbers.add(pageNumber);
          emitPageRendered(state);
          scrollToHighlightedVerseIfReady(state);
          setTimeout(function () {
            applyLayoutMode(state, layout);
            emitPageRendered(state);
            scrollToHighlightedVerseIfReady(state);
          }, 0);
        }

        function getWordTarget(node) {
          return node instanceof Element ? node.closest('[data-mushaf-word="true"]') : null;
        }

        function parseWordPayload(node) {
          if (!node || !node.dataset || !node.dataset.payload) {
            return null;
          }

          try {
            return JSON.parse(node.dataset.payload);
          } catch (error) {
            return null;
          }
        }

        function getSelectionWordNodes(range) {
          return Array.from(app.querySelectorAll('[data-mushaf-word="true"]')).filter(
            function (node) {
              try {
                return range.intersectsNode(node);
              } catch (error) {
                return false;
              }
            }
          );
        }

        function collectSelectionPayload() {
          var selection = window.getSelection();
          if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
            return {
              isCollapsed: true,
              text: '',
              verseKeys: [],
              wordPositions: [],
            };
          }

          var anchorNode = selection.anchorNode;
          var focusNode = selection.focusNode;
          if (!anchorNode || !focusNode || !app.contains(anchorNode) || !app.contains(focusNode)) {
            return {
              isCollapsed: true,
              text: '',
              verseKeys: [],
              wordPositions: [],
            };
          }

          var range = selection.getRangeAt(0);
          var selectedWords = getSelectionWordNodes(range);
          var verseKeys = [];
          var seenVerseKeys = Object.create(null);
          var wordPositions = [];
          var pageNumber = undefined;

          for (var index = 0; index < selectedWords.length; index += 1) {
            var selectedWord = selectedWords[index];
            if (pageNumber === undefined) {
              var rawPageNumber = parseInt(selectedWord.dataset.pageNumber || '', 10);
              if (Number.isFinite(rawPageNumber)) {
                pageNumber = rawPageNumber;
              }
            }

            var verseKey = selectedWord.dataset.verseKey || '';
            if (verseKey && !seenVerseKeys[verseKey]) {
              seenVerseKeys[verseKey] = true;
              verseKeys.push(verseKey);
            }

            var wordPosition = parseInt(selectedWord.dataset.wordPosition || '', 10);
            if (Number.isFinite(wordPosition) && wordPosition > 0) {
              wordPositions.push(wordPosition);
            }
          }

          var text = selectedWords.length
            ? selectedWords
                .map(function (node) {
                  return node.dataset.copyText || '';
                })
                .filter(Boolean)
                .join(' ')
            : normalizeCopyText(selection.toString());

          return {
            isCollapsed: false,
            pageNumber: pageNumber,
            text: normalizeCopyText(text),
            verseKeys: verseKeys,
            wordPositions: wordPositions,
          };
        }

        function hasActiveSelection() {
          return !collectSelectionPayload().isCollapsed;
        }

        function scheduleSelectionReport() {
          if (selectionRafId !== null) {
            cancelAnimationFrame(selectionRafId);
          }

          selectionRafId = requestAnimationFrame(function () {
            emit({
              type: 'selection-change',
              payload: collectSelectionPayload(),
            });
            selectionRafId = null;
          });
        }

        function collectNearPageNumbers() {
          var viewportTop = -window.innerHeight * 1.5;
          var viewportBottom = window.innerHeight * 2.5;
          var requested = [];

          pageStates.forEach(function (state, pageNumber) {
            if (loadedPageNumbers.has(pageNumber)) {
              return;
            }

            var rect = state.root.getBoundingClientRect();
            if (rect.bottom >= viewportTop && rect.top <= viewportBottom) {
              requested.push(pageNumber);
              if (pageNumber > 1) {
                requested.push(pageNumber - 1);
              }
              requested.push(pageNumber + 1);
            }
          });

          var unique = Array.from(new Set(requested))
            .filter(function (pageNumber) {
              return pageNumber >= 1 && pageNumber <= ${normalizedTotalPages};
            })
            .sort(function (left, right) {
              return left - right;
            });
          return unique;
        }

        function scheduleNearPageRequest() {
          if (scrollRequestTimeoutId !== null) {
            return;
          }

          scrollRequestTimeoutId = setTimeout(function () {
            scrollRequestTimeoutId = null;
            var pageNumbers = collectNearPageNumbers();
            if (pageNumbers.length === 0) {
              return;
            }
            emit({
              type: 'page-window-request',
              payload: {
                pageNumbers: pageNumbers,
              },
            });
          }, 90);
        }

        document.addEventListener('click', function (event) {
          if (hasActiveSelection()) {
            return;
          }

          var target = getWordTarget(event.target);
          var wordPayload = parseWordPayload(target);
          if (!wordPayload) {
            return;
          }

          emit({
            type: 'word-press',
            payload: wordPayload,
          });
        });

        document.addEventListener('selectionchange', function () {
          scheduleSelectionReport();
        });

        document.addEventListener('copy', function (event) {
          var selection = window.getSelection();
          if (!selection || selection.rangeCount === 0) {
            return;
          }

          var range = selection.getRangeAt(0);
          var selectedWords = getSelectionWordNodes(range)
            .map(function (node) {
              return node.dataset.copyText || '';
            })
            .filter(Boolean);

          var normalized = selectedWords.length
            ? selectedWords.join(' ')
            : normalizeCopyText(selection.toString());

          if (!normalized || !event.clipboardData) {
            return;
          }

          event.preventDefault();
          event.clipboardData.setData('text/plain', normalized);
        });

        window.addEventListener('resize', function () {
          pageStates.forEach(function (state) {
            if (state.data && state.lastLayout) {
              applyLayoutMode(state, state.lastLayout);
              emitPageRendered(state);
              scrollToHighlightedVerseIfReady(state);
            }
          });
          scheduleNearPageRequest();
        });

        window.addEventListener('scroll', scheduleNearPageRequest, { passive: true });

        initPageStates();
        scrollToPage(INITIAL_PAGE_NUMBER);
        didScrollToInitialPage = true;

        window.__MUSHAF_READER__ = {
          upsertPages: function (payload) {
            if (!payload || !Array.isArray(payload.pages) || !payload.layout) {
              return;
            }

            if (typeof payload.highlightVerseKey === 'string') {
              HIGHLIGHT_VERSE_KEY = payload.highlightVerseKey.trim();
            }
            if (typeof payload.initialPageNumber === 'number') {
              INITIAL_PAGE_NUMBER = payload.initialPageNumber;
            }
            if (typeof payload.focusTopInsetPx === 'number') {
              FOCUS_TOP_INSET_PX = Math.max(0, Math.round(payload.focusTopInsetPx));
            }

            payload.pages.forEach(function (pageData) {
              var state = getPageState(pageData && pageData.pageNumber);
              if (state) {
                state.lastLayout = payload.layout;
              }
              renderPage(pageData, payload.layout).catch(function (error) {
                console.error('Failed to render mushaf page', error);
              });
            });
          },
          scrollToPage: scrollToPage,
          scrollToVerse: function (verseKey) {
            HIGHLIGHT_VERSE_KEY = typeof verseKey === 'string' ? verseKey.trim() : '';
            didScrollToHighlight = false;
            pageStates.forEach(function (state) {
              if (state.data) {
                scrollToHighlightedVerseIfReady(state);
              }
            });
          },
        };

        emit({
          type: 'renderer-ready',
          payload: {
            ready: true,
          },
        });
        scheduleNearPageRequest();
      })();
    </script>
  </body>
</html>`;
}

export function buildMushafReaderWebViewShellDocument({
  estimatedPageHeight,
  focusTopInsetPx,
  highlightVerseKey,
  initialPageNumber,
  mushafScaleStep,
  packId,
  theme,
  totalPages,
  viewportHeight,
}: {
  estimatedPageHeight: number;
  focusTopInsetPx: number;
  highlightVerseKey?: string | null;
  initialPageNumber: number;
  mushafScaleStep: MushafScaleStep;
  packId: MushafPackId;
  theme: MushafReaderWebViewTheme;
  totalPages: number;
  viewportHeight: number;
}): { html: string; layout: MushafReaderWebViewLayoutPayload } {
  const layoutConfig = getMushafWebViewLayoutConfig(packId, mushafScaleStep, viewportHeight);
  const layout = {
    fontSizeCss: layoutConfig.fontSizeCss,
    isExactPreset: layoutConfig.isExactPreset,
    lineWidthCss: layoutConfig.lineWidthCss,
    lineHeightMultiplier: layoutConfig.lineHeightMultiplier,
    reflowLineHeightMultiplier: layoutConfig.reflowLineHeightMultiplier,
  };
  const cacheKey = [
    packId,
    mushafScaleStep,
    theme,
    Math.round(viewportHeight),
    Math.round(estimatedPageHeight),
    Math.round(focusTopInsetPx),
    totalPages,
    initialPageNumber,
    highlightVerseKey ?? '',
  ].join(':');
  const cached = shellDocumentCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const shellDocument = {
    html: buildShellDocumentHtml({
      estimatedPageHeight,
      focusTopInsetPx,
      highlightVerseKey,
      initialPageNumber,
      layout,
      theme,
      totalPages,
    }),
    layout,
  };
  shellDocumentCache.set(cacheKey, shellDocument);
  return shellDocument;
}

export function buildMushafReaderWebViewPagesScript({
  focusTopInsetPx,
  highlightVerseKey,
  initialPageNumber,
  layout,
  pages,
}: {
  focusTopInsetPx: number;
  highlightVerseKey?: string | null;
  initialPageNumber: number;
  layout: MushafReaderWebViewLayoutPayload;
  pages: MushafPageData[];
}): string {
  return `
    (function () {
      var reader = window.__MUSHAF_READER__;
      if (!reader || typeof reader.upsertPages !== 'function') {
        return true;
      }

      reader.upsertPages(${serializeJson({
        focusTopInsetPx,
        highlightVerseKey: highlightVerseKey ?? '',
        initialPageNumber,
        layout,
        pages,
      })});
      return true;
    })();
  `;
}
