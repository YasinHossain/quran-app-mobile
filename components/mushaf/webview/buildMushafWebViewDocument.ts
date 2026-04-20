import type { MushafPackId, MushafPageData, MushafScaleStep } from '@/types';

import { getMushafWebViewLayoutConfig } from '@/components/mushaf/mushafLayoutPresets';

type MushafWebViewTheme = 'light' | 'dark';

type MushafWebViewLayoutPayload = {
  fontSizeCss: string;
  isExactPreset: boolean;
  lineWidthCss: string;
  lineHeightMultiplier: number;
  reflowLineHeightMultiplier: number;
};

type MushafWebViewRenderPayload = {
  data: MushafPageData;
  layout: MushafWebViewLayoutPayload;
};

const REFLOW_HYSTERESIS_PX = 20;
const shellDocumentCache = new Map<
  string,
  {
    html: string;
    layout: MushafWebViewLayoutPayload;
  }
>();

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

function buildShellDocumentHtml({
  layout,
  theme,
}: {
  layout: MushafWebViewLayoutPayload;
  theme: MushafWebViewTheme;
}): string {
  const palette =
    theme === 'dark'
      ? {
          background: '#102033',
          text: '#E7E5E4',
          muted: '#94A3B8',
        }
      : {
          background: '#F7F9F9',
          text: '#111827',
          muted: '#6B7280',
        };

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
    />
    <title>${escapeHtml('Mushaf Page')}</title>
    <style>
      :root {
        color-scheme: ${theme};
        --background: ${palette.background};
        --text: ${palette.text};
        --muted: ${palette.muted};
        --font-size: ${layout.fontSizeCss};
        --line-height-multiplier: 1;
        --line-height: calc(var(--font-size) * var(--line-height-multiplier));
        --reflow-line-height-multiplier: 1;
        --reflow-line-height: calc(var(--font-size) * var(--reflow-line-height-multiplier));
        --exact-line-width: ${layout.lineWidthCss};
        --line-gap: 4px;
        --qcf-font-family: serif;
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
      }

      body {
        min-height: 100vh;
      }

      #app {
        width: min(calc(100vw - 8px), 720px);
        margin: 0 auto;
        padding: 4px 0 8px;
      }

      .page {
        width: 100%;
        overflow: hidden;
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

      .page.reflow .standard-view {
        display: none;
      }

      .reflow-view {
        display: none;
        width: 100%;
      }

      .page.reflow .reflow-view {
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
        font-family: var(--qcf-font-family), serif;
        font-weight: 400;
      }

      .reflow-spacer {
        white-space: pre;
      }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script>
      (function () {
        var app = document.getElementById('app');
        if (!app) {
          return;
        }

        var pageRoot = document.createElement('article');
        pageRoot.className = 'page';

        var pageContent = document.createElement('div');
        pageContent.className = 'page-content';
        pageRoot.appendChild(pageContent);

        var standardView = document.createElement('div');
        standardView.className = 'standard-view';
        pageContent.appendChild(standardView);

        var reflowView = document.createElement('div');
        reflowView.className = 'reflow-view';
        pageContent.appendChild(reflowView);

        app.appendChild(pageRoot);

        var currentPayload = null;
        var heightRafId = null;
        var selectionRafId = null;
        var lastContainerWidth = 0;
        var stableReflowState = null;
        var activeRenderToken = 0;

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

        function escapeHtml(value) {
          return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        }

        function normalizeCopyText(value) {
          return String(value || '')
            .replace(/\\s+/g, ' ')
            .trim();
        }

        function applyCssVariables(layout) {
          document.documentElement.style.setProperty('--font-size', layout.fontSizeCss);
          document.documentElement.style.setProperty('--exact-line-width', layout.lineWidthCss);
          document.documentElement.style.setProperty(
            '--line-height-multiplier',
            String(layout.lineHeightMultiplier)
          );
          document.documentElement.style.setProperty(
            '--reflow-line-height-multiplier',
            String(layout.reflowLineHeightMultiplier)
          );
        }

        function resolveWordText(word) {
          if (!currentPayload || !currentPayload.data) {
            return '';
          }

          var qcfVersion =
            currentPayload.rendererAssets &&
            typeof currentPayload.rendererAssets.qcfVersion === 'string'
              ? currentPayload.rendererAssets.qcfVersion
              : null;

          if (qcfVersion) {
            return word.textQpcHafs || word.textUthmani || word.textIndopak || '';
          }

          if (currentPayload.data.pack.script === 'indopak') {
            return word.textIndopak || word.textUthmani || '';
          }

          return word.textUthmani || word.textIndopak || word.textQpcHafs || '';
        }

        function getGlyphCode(word) {
          if (
            !currentPayload ||
            !currentPayload.rendererAssets ||
            !currentPayload.rendererAssets.qcfVersion
          ) {
            return '';
          }

          return currentPayload.rendererAssets.qcfVersion === 'v1'
            ? word.codeV1 || ''
            : word.codeV2 || '';
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

        function toWordPayload(word) {
          return {
            charType: word.charType,
            lineNumber: word.lineNumber,
            location: word.location,
            pageNumber: currentPayload && currentPayload.data ? currentPayload.data.pageNumber : undefined,
            text: resolveWordText(word),
            verseKey: resolveVerseKey(word),
            wordPosition: word.position,
          };
        }

        function getSelectionWordNodes(range) {
          return Array.from(pageContent.querySelectorAll('[data-mushaf-word="true"]')).filter(
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
          var pageNumber =
            currentPayload && currentPayload.data ? currentPayload.data.pageNumber : undefined;
          var selection = window.getSelection();
          if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
            return {
              isCollapsed: true,
              pageNumber: pageNumber,
              text: '',
              verseKeys: [],
              wordPositions: [],
            };
          }

          var anchorNode = selection.anchorNode;
          var focusNode = selection.focusNode;
          if (
            !anchorNode ||
            !focusNode ||
            !pageContent.contains(anchorNode) ||
            !pageContent.contains(focusNode)
          ) {
            return {
              isCollapsed: true,
              pageNumber: pageNumber,
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

          for (var index = 0; index < selectedWords.length; index += 1) {
            var selectedWord = selectedWords[index];
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

        function scheduleHeightReport() {
          if (heightRafId !== null) {
            cancelAnimationFrame(heightRafId);
          }

          heightRafId = requestAnimationFrame(function () {
            var height = Math.ceil(pageRoot.getBoundingClientRect().height);
            emit({
              type: 'content-height',
              payload: {
                height: height,
              },
            });
            heightRafId = null;
          });
        }

        function shouldUseReflow(containerWidth) {
          if (!currentPayload || containerWidth <= 0) {
            return false;
          }

          var lineWidthPx = parseCssLengthToPx(currentPayload.layout.lineWidthCss);
          var threshold = containerWidth * 0.95;

          if (stableReflowState !== null) {
            threshold += stableReflowState ? ${REFLOW_HYSTERESIS_PX} : -${REFLOW_HYSTERESIS_PX};
          }

          return lineWidthPx > threshold;
        }

        function applyLayoutMode() {
          if (!currentPayload) {
            scheduleHeightReport();
            return;
          }

          var containerWidth = pageContent.clientWidth;

          if (Math.abs(containerWidth - lastContainerWidth) < 10 && stableReflowState !== null) {
            scheduleHeightReport();
            return;
          }

          lastContainerWidth = containerWidth;
          var nextReflowState = shouldUseReflow(containerWidth);
          stableReflowState = nextReflowState;
          pageRoot.classList.toggle('reflow', nextReflowState);
          scheduleHeightReport();
        }

        function createWordNode(word, className) {
          if (!currentPayload) {
            return null;
          }

          var rendererAssets = currentPayload.rendererAssets || {};
          var qcfVersion =
            typeof rendererAssets.qcfVersion === 'string' ? rendererAssets.qcfVersion : null;
          var qcfFontLoaded = Boolean(currentPayload.qcfFontLoaded);
          var wordText = resolveWordText(word);
          var glyphCode = getGlyphCode(word);
          var shouldUseQcfGlyph = Boolean(qcfVersion && qcfFontLoaded && glyphCode);
          var verseKey = resolveVerseKey(word);

          if (!wordText && !shouldUseQcfGlyph) {
            return null;
          }

          var wordNode = document.createElement('span');
          wordNode.className = className;
          wordNode.dataset.mushafWord = 'true';
          wordNode.dataset.interactive = 'true';
          wordNode.dataset.payload = JSON.stringify(toWordPayload(word));
          wordNode.dataset.copyText = normalizeCopyText(wordText);
          wordNode.dataset.charType = String(word.charType || '');
          if (verseKey) {
            wordNode.dataset.verseKey = verseKey;
          }
          wordNode.dataset.wordPosition = String(word.position);

          if (shouldUseQcfGlyph) {
            wordNode.classList.add('qcf-word');
            wordNode.innerHTML = glyphCode;
          } else {
            wordNode.textContent = wordText;
          }

          return wordNode;
        }

        function renderStandardLines() {
          if (!currentPayload || !currentPayload.data) {
            return;
          }

          var linesByNumber = new Map(
            (currentPayload.data.pageLines.lines || []).map(function (line) {
              return [line.lineNumber, line];
            })
          );

          for (var lineNumber = 1; lineNumber <= currentPayload.data.pack.lines; lineNumber += 1) {
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
              standardView.appendChild(lineShell);
              continue;
            }

            for (var index = 0; index < line.words.length; index += 1) {
              var wordNode = createWordNode(line.words[index], 'word');
              if (wordNode) {
                lineContent.appendChild(wordNode);
              }
            }

            standardView.appendChild(lineShell);
          }
        }

        function renderReflowContent() {
          if (!currentPayload || !currentPayload.data) {
            return;
          }

          var reflowCopy = document.createElement('div');
          reflowCopy.className = 'reflow-copy';
          reflowCopy.setAttribute('dir', 'rtl');
          reflowCopy.setAttribute('translate', 'no');

          var words = [];
          var pageLines = Array.isArray(currentPayload.data.pageLines.lines)
            ? currentPayload.data.pageLines.lines
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
            var reflowWord = createWordNode(words[index], 'reflow-word');
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

          reflowView.appendChild(reflowCopy);
        }

        async function loadQcfPageFontIfNeeded(rendererAssets) {
          if (
            !rendererAssets ||
            !rendererAssets.qcfVersion ||
            !rendererAssets.pageFontFamily ||
            !rendererAssets.pageFontFileUri ||
            typeof FontFace === 'undefined'
          ) {
            return false;
          }

          var qcfFontFamily = rendererAssets.pageFontFamily;
          var qcfFontFileUri = rendererAssets.pageFontFileUri;
          var existingFontLoaded = Array.from(document.fonts || []).some(function (font) {
            return font.family === qcfFontFamily && font.status === 'loaded';
          });

          if (existingFontLoaded) {
            document.documentElement.style.setProperty('--qcf-font-family', "'" + qcfFontFamily + "'");
            return true;
          }

          try {
            var fontFace = new FontFace(
              qcfFontFamily,
              "url('" + String(qcfFontFileUri).replace(/'/g, "\\'") + "')"
            );
            fontFace.display = 'block';
            var loadedFace = await fontFace.load();
            if (document.fonts) {
              document.fonts.add(loadedFace);
            }
            document.documentElement.style.setProperty('--qcf-font-family', "'" + qcfFontFamily + "'");
            return true;
          } catch (error) {
            console.error('Failed to load local QCF page font', error);
            return false;
          }
        }

        function clearRenderedPage() {
          standardView.innerHTML = '';
          reflowView.innerHTML = '';
          pageRoot.classList.remove('reflow');
          stableReflowState = null;
          lastContainerWidth = 0;

          try {
            var selection = window.getSelection();
            if (selection) {
              selection.removeAllRanges();
            }
          } catch (error) {}
        }

        async function render(nextPayload) {
          if (!nextPayload || !nextPayload.data || !nextPayload.layout) {
            return;
          }

          var renderToken = activeRenderToken + 1;
          activeRenderToken = renderToken;

          currentPayload = {
            data: nextPayload.data,
            layout: nextPayload.layout,
            rendererAssets: nextPayload.data.rendererAssets || {},
            qcfFontLoaded: false,
          };

          document.title = escapeHtml('Mushaf Page ' + String(nextPayload.data.pageNumber));
          pageRoot.setAttribute('aria-label', 'Page ' + String(nextPayload.data.pageNumber));
          applyCssVariables(nextPayload.layout);
          clearRenderedPage();

          currentPayload.qcfFontLoaded = await loadQcfPageFontIfNeeded(currentPayload.rendererAssets);
          if (renderToken !== activeRenderToken) {
            return;
          }

          renderStandardLines();
          renderReflowContent();
          applyLayoutMode();
          scheduleSelectionReport();
          setTimeout(applyLayoutMode, 0);
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

        if (typeof ResizeObserver !== 'undefined') {
          var resizeObserver = new ResizeObserver(function () {
            applyLayoutMode();
          });
          resizeObserver.observe(pageContent);
        } else {
          window.addEventListener('resize', applyLayoutMode);
        }

        window.addEventListener('load', scheduleHeightReport);

        window.__MUSHAF_RENDERER__ = {
          render: function (nextPayload) {
            return Promise.resolve()
              .then(function () {
                return render(nextPayload);
              })
              .catch(function (error) {
                console.error('Failed to render mushaf page payload', error);
              });
          },
        };
      })();
    </script>
  </body>
</html>`;
}

export function buildMushafWebViewShellDocument({
  packId,
  mushafScaleStep,
  theme,
  viewportHeight,
}: {
  packId: MushafPackId;
  mushafScaleStep: MushafScaleStep;
  theme: MushafWebViewTheme;
  viewportHeight: number;
}): {
  html: string;
  layout: MushafWebViewLayoutPayload;
} {
  const layoutConfig = getMushafWebViewLayoutConfig(packId, mushafScaleStep, viewportHeight);
  const layout = {
    fontSizeCss: layoutConfig.fontSizeCss,
    isExactPreset: layoutConfig.isExactPreset,
    lineWidthCss: layoutConfig.lineWidthCss,
    lineHeightMultiplier: layoutConfig.lineHeightMultiplier,
    reflowLineHeightMultiplier: layoutConfig.reflowLineHeightMultiplier,
  };
  const cacheKey = `${packId}:${mushafScaleStep}:${theme}:${Math.round(viewportHeight)}`;
  const cached = shellDocumentCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const shellDocument = {
    html: buildShellDocumentHtml({
      layout,
      theme,
    }),
    layout,
  };
  shellDocumentCache.set(cacheKey, shellDocument);
  return shellDocument;
}

export function buildMushafWebViewRenderScript({
  data,
  layout,
}: MushafWebViewRenderPayload): string {
  return `
    (function () {
      var renderer = window.__MUSHAF_RENDERER__;
      if (!renderer || typeof renderer.render !== 'function') {
        return true;
      }

      renderer.render(${serializeJson({ data, layout })});
      return true;
    })();
  `;
}
