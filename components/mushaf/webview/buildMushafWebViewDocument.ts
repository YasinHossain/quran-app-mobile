import type { MushafPageData, MushafScaleStep } from '@/types';

import { getMushafWebViewLayoutConfig } from '@/components/mushaf/mushafLayoutPresets';

type MushafWebViewTheme = 'light' | 'dark';

const REFLOW_HYSTERESIS_PX = 20;

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

export function buildMushafWebViewDocument({
  data,
  mushafName,
  mushafScaleStep,
  theme,
  viewportHeight,
}: {
  data: MushafPageData;
  mushafName: string;
  mushafScaleStep: MushafScaleStep;
  theme: MushafWebViewTheme;
  viewportHeight: number;
}): string {
  const layout = getMushafWebViewLayoutConfig(data.pack.packId, mushafScaleStep, viewportHeight);
  const palette =
    theme === 'dark'
      ? {
          background: '#102033',
          surface: '#132338',
          page: '#0F1B2A',
          pageBorder: '#264158',
          text: '#E7E5E4',
          muted: '#94A3B8',
          accent: '#14B8A6',
          accentText: '#052F2D',
        }
      : {
          background: '#F7F9F9',
          surface: '#FFFFFF',
          page: '#FCFBF7',
          pageBorder: '#E5D9C5',
          text: '#111827',
          muted: '#6B7280',
          accent: '#CCFBF1',
          accentText: '#115E59',
        };

  const shellTitle = escapeHtml(mushafName);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
    />
    <title>${shellTitle}</title>
    <style>
      :root {
        color-scheme: ${theme};
        --background: ${palette.background};
        --surface: ${palette.surface};
        --page: ${palette.page};
        --page-border: ${palette.pageBorder};
        --text: ${palette.text};
        --muted: ${palette.muted};
        --accent: ${palette.accent};
        --accent-text: ${palette.accentText};
        --font-size: ${layout.fontSizeCss};
        --line-height-multiplier: ${layout.lineHeightMultiplier};
        --line-height: calc(var(--font-size) * var(--line-height-multiplier));
        --reflow-line-height-multiplier: ${layout.reflowLineHeightMultiplier};
        --reflow-line-height: calc(var(--font-size) * var(--reflow-line-height-multiplier));
        --exact-line-width: ${layout.lineWidthCss};
        --line-gap: 4px;
        --page-radius: 28px;
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
        padding: 16px 0 24px;
      }

      .shell {
        width: min(calc(100vw - 32px), 720px);
        margin: 0 auto;
        border-radius: 32px;
        border: 1px solid rgba(148, 163, 184, 0.22);
        background: var(--surface);
        padding: 16px;
      }

      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        border-bottom: 1px solid rgba(148, 163, 184, 0.18);
        padding-bottom: 12px;
      }

      .header-copy {
        min-width: 0;
      }

      .title {
        font-size: 16px;
        font-weight: 700;
        line-height: 1.2;
      }

      .subtitle {
        margin-top: 4px;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.4;
      }

      .chip {
        border-radius: 999px;
        background: var(--accent);
        color: var(--accent-text);
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 700;
        line-height: 1;
        white-space: nowrap;
      }

      .page-frame {
        margin-top: 16px;
        border-radius: var(--page-radius);
        border: 1px solid var(--page-border);
        background: var(--page);
        padding: 24px 16px;
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

      .page-frame.reflow .standard-view {
        display: none;
      }

      .reflow-view {
        display: none;
        width: 100%;
      }

      .page-frame.reflow .reflow-view {
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

      .footer {
        display: flex;
        justify-content: center;
        margin-top: 16px;
      }

      .footer-chip {
        border-radius: 999px;
        background: rgba(20, 184, 166, 0.12);
        padding: 8px 14px;
        font-size: 12px;
        color: var(--muted);
      }

      .footer-chip strong {
        color: var(--text);
      }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script id="mushaf-page-data" type="application/json">${serializeJson({
      data,
      layout: {
        fontSizeCss: layout.fontSizeCss,
        isExactPreset: layout.isExactPreset,
        lineWidthCss: layout.lineWidthCss,
      },
      mushafName,
    })}</script>
    <script>
      (async function () {
        var payloadNode = document.getElementById('mushaf-page-data');
        if (!payloadNode || !payloadNode.textContent) {
          return;
        }

        var payload = JSON.parse(payloadNode.textContent);
        var data = payload.data;
        var app = document.getElementById('app');
        if (!app || !data || !data.pack) {
          return;
        }

        var shell = document.createElement('article');
        shell.className = 'shell';
        shell.setAttribute('aria-label', 'Page ' + String(data.pageNumber));

        shell.innerHTML =
          '<div class="header">' +
          '<div class="header-copy">' +
          '<div class="title">' + escapeHtml(payload.mushafName) + '</div>' +
          '<div class="subtitle">Web exact presets with automatic centered reflow</div>' +
          '</div>' +
          '<div class="chip">Page ' + String(data.pageNumber) + '</div>' +
          '</div>';

        var pageFrame = document.createElement('div');
        pageFrame.className = 'page-frame';

        var pageContent = document.createElement('div');
        pageContent.className = 'page-content';
        pageFrame.appendChild(pageContent);

        var standardView = document.createElement('div');
        standardView.className = 'standard-view';
        pageContent.appendChild(standardView);

        var reflowView = document.createElement('div');
        reflowView.className = 'reflow-view';
        pageContent.appendChild(reflowView);

        shell.appendChild(pageFrame);

        var footer = document.createElement('div');
        footer.className = 'footer';
        footer.innerHTML =
          '<div class="footer-chip"><strong>' +
          escapeHtml(String(data.pack.packId)) +
          '@' +
          escapeHtml(String(data.pack.version)) +
          '</strong> · ' +
          escapeHtml(String(data.pack.renderer)) +
          ' renderer</div>';
        shell.appendChild(footer);

        app.appendChild(shell);

        var heightRafId = null;
        var selectionRafId = null;
        var lastContainerWidth = 0;
        var stableReflowState = null;
        var rendererAssets = data.rendererAssets || {};
        var qcfVersion = typeof rendererAssets.qcfVersion === 'string' ? rendererAssets.qcfVersion : null;
        var qcfFontFamily =
          typeof rendererAssets.pageFontFamily === 'string' ? rendererAssets.pageFontFamily : null;
        var qcfFontFileUri =
          typeof rendererAssets.pageFontFileUri === 'string' ? rendererAssets.pageFontFileUri : null;
        var qcfFontLoaded = false;

        function escapeHtml(value) {
          return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
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

        function resolveWordText(word) {
          if (qcfVersion) {
            return word.textQpcHafs || word.textUthmani || word.textIndopak || '';
          }

          if (data.pack.script === 'indopak') {
            return word.textIndopak || word.textUthmani || '';
          }

          return word.textUthmani || word.textIndopak || word.textQpcHafs || '';
        }

        function getGlyphCode(word) {
          if (!qcfVersion) {
            return '';
          }

          return qcfVersion === 'v1' ? word.codeV1 || '' : word.codeV2 || '';
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

        function toWordPayload(word) {
          return {
            charType: word.charType,
            lineNumber: word.lineNumber,
            location: word.location,
            text: resolveWordText(word),
            verseKey: resolveVerseKey(word),
            wordPosition: word.position,
          };
        }

        function emit(message) {
          if (!window.ReactNativeWebView) {
            return;
          }

          window.ReactNativeWebView.postMessage(JSON.stringify(message));
        }

        function scheduleHeightReport() {
          if (heightRafId !== null) {
            cancelAnimationFrame(heightRafId);
          }

          heightRafId = requestAnimationFrame(function () {
            var height = Math.ceil(shell.getBoundingClientRect().height);
            emit({
              type: 'content-height',
              payload: {
                height: height,
              },
            });
            heightRafId = null;
          });
        }

        function getSelectionWordNodes(range) {
          return Array.from(pageContent.querySelectorAll('[data-mushaf-word="true"]')).filter(function (node) {
            try {
              return range.intersectsNode(node);
            } catch (error) {
              return false;
            }
          });
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
          if (!anchorNode || !focusNode || !pageContent.contains(anchorNode) || !pageContent.contains(focusNode)) {
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

        async function loadQcfPageFontIfNeeded() {
          if (!qcfVersion || !qcfFontFamily || !qcfFontFileUri || typeof FontFace === 'undefined') {
            return false;
          }

          var existingFontLoaded = Array.from(document.fonts || []).some(function (font) {
            return font.family === qcfFontFamily && font.status === 'loaded';
          });

          if (existingFontLoaded) {
            document.documentElement.style.setProperty('--qcf-font-family', "'" + qcfFontFamily + "'");
            qcfFontLoaded = true;
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
            qcfFontLoaded = true;
            return true;
          } catch (error) {
            console.error('Failed to load local QCF page font', error);
            return false;
          }
        }

        function shouldUseReflow(containerWidth) {
          if (containerWidth <= 0) {
            return false;
          }

          var lineWidthPx = parseCssLengthToPx(payload.layout.lineWidthCss);
          var threshold = containerWidth * 0.95;

          if (stableReflowState !== null) {
            threshold += stableReflowState ? ${REFLOW_HYSTERESIS_PX} : -${REFLOW_HYSTERESIS_PX};
          }

          return lineWidthPx > threshold;
        }

        function applyLayoutMode() {
          var containerWidth = pageContent.clientWidth;

          if (Math.abs(containerWidth - lastContainerWidth) < 10 && stableReflowState !== null) {
            scheduleHeightReport();
            return;
          }

          lastContainerWidth = containerWidth;
          var nextReflowState = shouldUseReflow(containerWidth);
          stableReflowState = nextReflowState;
          pageFrame.classList.toggle('reflow', nextReflowState);
          scheduleHeightReport();
        }

        function createWordNode(word, className) {
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
          var linesByNumber = new Map((data.pageLines.lines || []).map(function (line) {
            return [line.lineNumber, line];
          }));

          for (var lineNumber = 1; lineNumber <= data.pack.lines; lineNumber += 1) {
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
          var reflowCopy = document.createElement('div');
          reflowCopy.className = 'reflow-copy';
          reflowCopy.setAttribute('dir', 'rtl');
          reflowCopy.setAttribute('translate', 'no');

          var words = [];
          var pageLines = Array.isArray(data.pageLines.lines) ? data.pageLines.lines : [];

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

        await loadQcfPageFontIfNeeded();
        renderStandardLines();
        renderReflowContent();
        applyLayoutMode();
        scheduleSelectionReport();

        if (typeof ResizeObserver !== 'undefined') {
          var resizeObserver = new ResizeObserver(function () {
            applyLayoutMode();
          });
          resizeObserver.observe(pageContent);
        } else {
          window.addEventListener('resize', applyLayoutMode);
        }

        window.addEventListener('load', scheduleHeightReport);
        setTimeout(applyLayoutMode, 0);
      })();
    </script>
  </body>
</html>`;
}
