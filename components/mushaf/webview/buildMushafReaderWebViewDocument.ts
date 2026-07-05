import type { MushafPackId, MushafPageData, MushafScaleStep } from '@/types';

import { getMushafWebViewLayoutConfig } from '@/components/mushaf/mushafLayoutPresets';
import { getBismillahCalligraphyPathData } from '@/components/surah/BismillahCalligraphy';
import { getJuzByPage } from '@/lib/utils/surah-navigation';

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

export type MushafReaderSurahIntro = {
  chapterId: number;
  infoLabel: string;
  isMakkah: boolean;
  showBismillah: boolean;
  surahName: string;
};

export type MushafReaderSurahNavigation = {
  nextSurahName?: string | undefined;
  previousSurahName?: string | undefined;
};

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

function normalizeShellPageNumbers(pageNumbers: number[] | undefined, totalPages: number): number[] {
  const normalizedTotalPages = Math.max(1, Math.trunc(totalPages));
  const normalized = Array.from(
    new Set(
      (Array.isArray(pageNumbers) && pageNumbers.length > 0
        ? pageNumbers
        : Array.from({ length: normalizedTotalPages }, (_value, index) => index + 1)
      )
        .filter((pageNumber) => Number.isFinite(pageNumber))
        .map((pageNumber) => Math.trunc(pageNumber))
        .filter((pageNumber) => pageNumber >= 1 && pageNumber <= normalizedTotalPages)
    )
  ).sort((left, right) => left - right);

  return normalized.length ? normalized : [1];
}

function buildPageShells(
  pageNumbers: number[],
  estimatedPageHeight: number,
  compactPageLines: boolean
): string {
  const pageMinHeight = Math.max(280, Math.round(estimatedPageHeight));
  const pageShells: string[] = [];

  for (const pageNumber of pageNumbers) {
    const juzNumber = getJuzByPage(pageNumber);
    pageShells.push(`
      <article class="reader-page loading" data-page-number="${pageNumber}">
        <div class="page-content"${compactPageLines ? '' : ` style="min-height: ${pageMinHeight}px;"`}>
          <div class="standard-view"></div>
          <div class="reflow-view"></div>
        </div>
        <footer class="page-footer" aria-hidden="true">
          <span></span><b>Page ${pageNumber} • Juz ${juzNumber}</b><span></span>
        </footer>
      </article>
    `);
  }

  return pageShells.join('\n');
}

function buildBackgroundMinaretSvg(x: number, height: number): string {
  const shaftWidth = 3.5;
  const balconyWidth = 6.5;
  const baseY = 78;
  const topY = baseY - height;

  return `
    <g opacity=".85">
      <rect x="${x - shaftWidth / 2}" y="${topY}" width="${shaftWidth}" height="${height}" rx=".5" fill="var(--intro-minaret)"/>
      <rect x="${x - balconyWidth / 2}" y="${topY + height * 0.45}" width="${balconyWidth}" height="2" rx=".3" fill="var(--intro-minaret)"/>
      <rect x="${x - balconyWidth / 2}" y="${topY + height * 0.15}" width="${balconyWidth}" height="2" rx=".3" fill="var(--intro-minaret)"/>
      <path d="M${x - 2.2} ${topY}Q${x - 2.7} ${topY - 3.5} ${x} ${topY - 4.5}Q${x + 2.7} ${topY - 3.5} ${x + 2.2} ${topY}Z" fill="var(--intro-minaret)"/>
      <path d="M${x} ${topY - 4.5}V${topY - 7.5}" fill="none" stroke="var(--intro-minaret)" stroke-width=".8"/>
    </g>
  `;
}

function buildRevelationIllustrationHtml(isMakkah: boolean): string {
  const background = `
    <path d="M40 78C40 30 65 15 88 15s48 15 48 63Z" fill="var(--intro-art-bg)"/>
  `;
  const ground = `
    <ellipse cx="${isMakkah ? 92 : 85}" cy="70" rx="${isMakkah ? 22 : 26}" ry="${isMakkah ? 4.5 : 4}" fill="var(--intro-shadow)" opacity="var(--intro-shadow-opacity)"/>
    <path d="M20 72h105" fill="none" stroke="var(--intro-art-line)" stroke-linecap="round" stroke-width="1.8"/>
  `;
  const mosqueWall = `
    <path d="M45 78V${isMakkah ? 62 : 64}h3q5-4 10 0h3v${isMakkah ? 16 : 14}m0 0V${isMakkah ? 62 : 64}h3q5-4 10 0h3v${isMakkah ? 16 : 14}m0 0V${isMakkah ? 62 : 64}h3q5-4 10 0h3v${isMakkah ? 16 : 14}m0 0V${isMakkah ? 62 : 64}h3q5-4 10 0h3v${isMakkah ? 16 : 14}m0 0V${isMakkah ? 62 : 64}h3q5-4 10 0h3v${isMakkah ? 16 : 14}" fill="var(--intro-mosque)" opacity=".5"/>
  `;

  if (isMakkah) {
    return `
      <svg viewBox="0 0 136 78" aria-hidden="true">
        ${background}
        ${buildBackgroundMinaretSvg(54, 50)}
        ${buildBackgroundMinaretSvg(68, 56)}
        ${buildBackgroundMinaretSvg(122, 44)}
        ${mosqueWall}
        ${ground}
        <path d="M76 40l16 4v26l-16-4Z" fill="var(--intro-kaaba-left)"/>
        <path d="m92 44 16-4v26l-16 4Z" fill="var(--intro-kaaba-right)"/>
        <path d="m76 45.2 16 4v2.5l-16-4Z" fill="var(--intro-gold)"/>
        <path d="m92 49.2 16-4v2.5l-16 4Z" fill="var(--intro-gold-light)"/>
        <path d="m96 68.8 5-1.25v-13l-5 1.25Z" fill="var(--intro-gold-light)"/>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 136 78" aria-hidden="true">
      ${background}
      ${buildBackgroundMinaretSvg(52, 54)}
      ${buildBackgroundMinaretSvg(118, 50)}
      ${mosqueWall}
      ${ground}
      <rect x="68" y="64" width="34" height="7" rx=".8" fill="var(--intro-dome-base)"/>
      <rect x="72" y="58" width="26" height="6" rx=".5" fill="var(--intro-dome-dark)"/>
      <path d="M70 58c-2-8 4-20 15-22 11 2 17 14 15 22Z" fill="var(--intro-dome)"/>
      <path d="M85 36V25" fill="none" stroke="var(--intro-gold)" stroke-width="1.2"/>
      <path d="M85 25c1.3 0 2.2.8 2.2 1.8s-1 1.8-2.2 1.8c.7 0 1.4-.6 1.4-1.8s-.7-1.5-1.4-1.8Z" fill="var(--intro-gold)"/>
    </svg>
  `;
}

function buildBismillahOrnamentEndHtml(): string {
  return `
    <path d="M6 20h19c11 0 13-10 18-10s7 10 18 10h19M6 56h19c11 0 13 10 18 10s7-10 18-10h19"/>
    <path d="M6 23h18c10 0 12-8 19-8s9 8 19 8h18M6 53h18c10 0 12 8 19 8s9-8 19-8h18"/>
    <circle cx="43" cy="38" r="20"/><circle cx="43" cy="38" r="17"/><circle cx="43" cy="38" r="13.5"/>
    <rect x="34" y="29" width="18" height="18" rx="1.5"/><rect x="34" y="29" width="18" height="18" rx="1.5" transform="rotate(45 43 38)"/>
    <circle cx="43" cy="38" r="3.5"/>
    <path d="m41 10 2-2 2 2-2 2Zm0 56 2 2 2-2-2-2Z"/>
    <circle cx="14" cy="38" r="5"/><circle cx="14" cy="38" r="2"/><path d="M6 38h3m10 0h4m-9-5v2m0 6v2"/>
    <circle cx="72" cy="38" r="5"/><circle cx="72" cy="38" r="2"/><path d="M63 38h4m10 0h3.5M72 33v2m0 6v2"/>
    <path d="m76.5 38 3.5-3.5 3.5 3.5-3.5 3.5Z"/>
  `;
}

function buildBismillahHtml(): string {
  const ornamentEnd = buildBismillahOrnamentEndHtml();
  const calligraphyPath = escapeHtml(getBismillahCalligraphyPathData());

  return `
    <div class="surah-intro-bismillah" role="img" aria-label="Bismillah ir-Rahman ir-Rahim">
      <svg class="bismillah-ornament" viewBox="0 0 560 76" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="2" y="2" width="556" height="72" rx="3"/><rect x="6" y="6" width="548" height="64" rx="2"/>
        <g>${ornamentEnd}</g><g transform="translate(560 0) scale(-1 1)">${ornamentEnd}</g>
        <path d="M80 38c8-24 25-24 25-24h350s17 0 25 24c-8 24-25 24-25 24H105s-17 0-25-24Z"/>
        <path d="M84 38c7-21 24-21 24-21h344s16 0 24 21c-7 21-24 21-24 21H108s-16 0-24-21Z"/>
        <path d="m108 17 4 4-4 4-4-4Zm344 0 4 4-4 4-4-4ZM108 59l4-4-4-4-4 4Zm344 0 4-4-4-4-4 4Z"/>
        <path d="M91 38c4-5 8-5 12 0-4 5-8 5-12 0Z"/><circle cx="97" cy="38" r="1.35"/><path d="M103 38h5"/>
        <g transform="translate(560 0) scale(-1 1)"><path d="M91 38c4-5 8-5 12 0-4 5-8 5-12 0Z"/><circle cx="97" cy="38" r="1.35"/><path d="M103 38h5"/></g>
      </svg>
      <svg class="bismillah-calligraphy" viewBox="0 0 11523 1583" aria-hidden="true">
        <g transform="translate(0 979) scale(1 -1)"><path fill="currentColor" d="${calligraphyPath}"/></g>
      </svg>
    </div>
  `;
}

function buildSurahIntroHtml(surahIntro?: MushafReaderSurahIntro): string {
  if (!surahIntro) {
    return '';
  }

  const placeLabel = surahIntro.isMakkah ? 'Makki' : 'Madani';
  const illustration = buildRevelationIllustrationHtml(surahIntro.isMakkah);

  return `
      <section class="surah-intro" aria-label="${escapeHtml(surahIntro.surahName)}">
        <div class="surah-intro-heading">
          <div class="surah-intro-copy">
            <h1>${escapeHtml(surahIntro.surahName)}</h1>
            <p>${escapeHtml(surahIntro.infoLabel)}</p>
          </div>
          <div class="surah-intro-illustration" role="img" aria-label="${placeLabel} surah">
            ${illustration}
          </div>
        </div>
        ${surahIntro.showBismillah ? buildBismillahHtml() : ''}
      </section>
  `;
}

function buildSurahNavigationHtml(surahNavigation?: MushafReaderSurahNavigation): string {
  const hasPrevious = Boolean(surahNavigation?.previousSurahName);
  const hasNext = Boolean(surahNavigation?.nextSurahName);
  if (!hasPrevious && !hasNext) {
    return '';
  }

  return `
      <nav class="surah-navigation" aria-label="Surah navigation">
        <button
          class="surah-navigation-button"
          data-surah-navigation="previous"
          type="button"
          ${hasPrevious ? '' : 'disabled'}
        >
          <span class="surah-navigation-kicker">Previous</span>
          <span>${hasPrevious ? escapeHtml(surahNavigation?.previousSurahName ?? '') : 'Start'}</span>
        </button>
        <button
          class="surah-navigation-button"
          data-surah-navigation="next"
          type="button"
          ${hasNext ? '' : 'disabled'}
        >
          <span class="surah-navigation-kicker">Next</span>
          <span>${hasNext ? escapeHtml(surahNavigation?.nextSurahName ?? '') : 'End'}</span>
        </button>
      </nav>
  `;
}

function buildShellDocumentHtml({
  compactPageLines,
  estimatedPageHeight,
  focusTopInsetPx,
  highlightVerseKey,
  initialPageNumber,
  layout,
  pageNumbers,
  surahIntro,
  surahNavigation,
  theme,
  totalPages,
}: {
  compactPageLines: boolean;
  estimatedPageHeight: number;
  focusTopInsetPx: number;
  highlightVerseKey?: string | null;
  initialPageNumber: number;
  layout: MushafReaderWebViewLayoutPayload;
  pageNumbers?: number[] | undefined;
  surahIntro?: MushafReaderSurahIntro | undefined;
  surahNavigation?: MushafReaderSurahNavigation | undefined;
  theme: MushafReaderWebViewTheme;
  totalPages: number;
}): string {
  const topContentPaddingPx = Math.max(
    12,
    Math.round(focusTopInsetPx) + (surahIntro ? 0 : 12)
  );
  const palette =
    theme === 'dark'
      ? {
          background: '#0F172A',
          border: 'rgba(255,255,255,0.12)',
          highlight: 'rgba(34, 197, 94, 0.26)',
          text: '#E7E5E4',
          muted: '#94A3B8',
          introArtBg: surahIntro?.isMakkah ? '#27211B' : '#15221B',
          introArtLine: surahIntro?.isMakkah ? '#5C5042' : '#385244',
          introArtMuted: surahIntro?.isMakkah ? '#504233' : '#2E473B',
          introDome: '#439D7A',
          introDomeDark: '#348263',
          introDomeBase: '#2E473B',
          introGold: '#B8922A',
          introGoldLight: '#D3AB3B',
          introKaabaLeft: '#0C0A09',
          introKaabaRight: '#161412',
          introMinaret: surahIntro?.isMakkah ? '#504233' : '#2E473B',
          introMosque: surahIntro?.isMakkah ? '#43372B' : '#24372D',
          introShadow: '#000000',
          introShadowOpacity: surahIntro?.isMakkah ? 0.4 : 0.45,
        }
      : {
          background: '#F7F9F9',
          border: 'rgba(15,23,42,0.12)',
          highlight: 'rgba(34, 197, 94, 0.2)',
          text: '#111827',
          muted: '#6B7280',
          introArtBg: surahIntro?.isMakkah ? '#FDF7EA' : '#EEF6F2',
          introArtLine: surahIntro?.isMakkah ? '#DECFA2' : '#B8D1C4',
          introArtMuted: surahIntro?.isMakkah ? '#DECFA2' : '#C6DCD0',
          introDome: '#28785C',
          introDomeDark: '#1E5E45',
          introDomeBase: '#ECE5DB',
          introGold: '#C5A028',
          introGoldLight: '#E5C158',
          introKaabaLeft: '#1C1917',
          introKaabaRight: '#2A2723',
          introMinaret: surahIntro?.isMakkah ? '#DECFA2' : '#C6DCD0',
          introMosque: surahIntro?.isMakkah ? '#EADCB9' : '#D5E8DE',
          introShadow: surahIntro?.isMakkah ? '#8B7355' : '#4E685B',
          introShadowOpacity: surahIntro?.isMakkah ? 0.15 : 0.2,
        };

  const normalizedTotalPages = Math.max(1, Math.trunc(totalPages));
  const normalizedPageNumbers = normalizeShellPageNumbers(pageNumbers, normalizedTotalPages);
  const firstShellPageNumber = normalizedPageNumbers[0] ?? 1;
  const rawInitialPageNumber = Math.min(
    Math.max(1, Math.trunc(initialPageNumber)),
    normalizedTotalPages
  );
  const normalizedInitialPageNumber = normalizedPageNumbers.includes(rawInitialPageNumber)
    ? rawInitialPageNumber
    : firstShellPageNumber;

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
        --intro-art-bg: ${palette.introArtBg};
        --intro-art-line: ${palette.introArtLine};
        --intro-art-muted: ${palette.introArtMuted};
        --intro-dome: ${palette.introDome};
        --intro-dome-dark: ${palette.introDomeDark};
        --intro-dome-base: ${palette.introDomeBase};
        --intro-gold: ${palette.introGold};
        --intro-gold-light: ${palette.introGoldLight};
        --intro-kaaba-left: ${palette.introKaabaLeft};
        --intro-kaaba-right: ${palette.introKaabaRight};
        --intro-minaret: ${palette.introMinaret};
        --intro-mosque: ${palette.introMosque};
        --intro-shadow: ${palette.introShadow};
        --intro-shadow-opacity: ${palette.introShadowOpacity};
        --font-size: ${layout.fontSizeCss};
        --line-height-multiplier: ${layout.lineHeightMultiplier};
        --line-height: calc(var(--font-size) * var(--line-height-multiplier));
        --reflow-line-height-multiplier: ${layout.reflowLineHeightMultiplier};
        --reflow-line-height: calc(var(--font-size) * var(--reflow-line-height-multiplier));
        --exact-line-width: ${layout.lineWidthCss};
        --line-gap: 4px;
        --loading-page-min-height: ${Math.max(280, Math.round(estimatedPageHeight))}px;
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
        padding: ${topContentPaddingPx}px 0 24px;
      }

      .surah-intro {
        border-bottom: 1px solid var(--border);
        border-color: ${
          theme === 'dark' ? 'rgba(51, 65, 85, 0.3)' : 'rgba(229, 231, 235, 0.4)'
        };
        left: 50%;
        margin: 0 0 16px;
        padding: 0 0 20px;
        position: relative;
        transform: translateX(-50%);
        width: calc(100vw - 40px);
      }

      .surah-intro-heading {
        align-items: center;
        display: flex;
        gap: 16px;
        justify-content: space-between;
        min-height: 104px;
        padding: 0 8px;
      }

      .surah-intro-copy {
        flex: 1;
        min-width: 0;
        padding-top: 12px;
      }

      .surah-intro-copy h1 {
        color: ${theme === 'dark' ? '#E7E5E4' : '#374151'};
        font-size: 26px;
        font-weight: 700;
        line-height: 32px;
        margin: 0;
        overflow-wrap: anywhere;
      }

      .surah-intro-copy p {
        color: ${theme === 'dark' ? '#94A3B8' : '#6B7280'};
        font-size: 14px;
        line-height: 20px;
        margin: 2px 0 0;
      }

      .surah-intro-illustration {
        flex: none;
        height: 78px;
        width: 136px;
      }

      .surah-intro-illustration svg {
        display: block;
        height: 100%;
        width: 100%;
      }

      .surah-intro-bismillah {
        color: ${theme === 'dark' ? '#D5DED9' : '#3F735B'};
        height: auto;
        margin: 20px auto 0;
        max-width: 560px;
        position: relative;
        width: calc(100% - 16px);
        aspect-ratio: 560 / 76;
      }

      .bismillah-ornament {
        display: block;
        height: 100%;
        inset: 0;
        position: absolute;
        width: 100%;
      }

      .bismillah-calligraphy {
        height: 54%;
        left: 20%;
        position: absolute;
        top: 23%;
        width: 60%;
      }

      .reader-page {
        width: 100%;
        overflow: hidden;
      }

      .reader-page + .reader-page {
        margin-top: 10px;
      }

      .page-content {
        opacity: 1;
        transition: opacity 120ms ease;
        width: 100%;
      }

      .reader-page.loading .page-content {
        min-height: var(--loading-page-min-height);
        opacity: 0;
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
        justify-content: center;
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

      .word {
        padding-inline: 0.04em;
      }

      .word.qcf-word,
      .reflow-word.qcf-word {
        font-weight: 400;
      }

      .word.qcf-word {
        padding-inline: 0;
      }

      .word.arrival-highlight,
      .reflow-word.arrival-highlight {
        background:
          linear-gradient(
            to bottom,
            transparent 14%,
            var(--highlight) 14%,
            var(--highlight) 88%,
            transparent 88%
          );
        border-radius: 0.15em;
      }

      .indopak-verse-marker {
        display: inline-block;
        flex: none;
        font-family: var(--qcf-font-family, serif);
        font-size: 0.92em;
        line-height: 1;
        margin-inline: 0.04em;
        unicode-bidi: isolate;
        white-space: nowrap;
      }

      .reflow-spacer {
        display: inline-block;
        white-space: pre;
        width: 0.14em;
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

      .surah-navigation {
        display: grid;
        gap: 10px;
        grid-template-columns: 1fr 1fr;
        margin: 22px auto 0;
        padding: 4px 12px 12px;
        width: 100%;
      }

      .surah-navigation-button {
        appearance: none;
        -webkit-appearance: none;
        background: transparent;
        border: 1px solid var(--border);
        border-radius: 999px;
        color: var(--text);
        display: flex;
        flex-direction: column;
        font: inherit;
        gap: 2px;
        min-height: 50px;
        min-width: 0;
        padding: 8px 14px;
        text-align: center;
      }

      .surah-navigation-button:active:not(:disabled) {
        opacity: 0.7;
        transform: scale(0.98);
      }

      .surah-navigation-button:disabled {
        color: var(--muted);
        opacity: 0.45;
      }

      .surah-navigation-button span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .surah-navigation-kicker {
        color: var(--muted);
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
      }
    </style>
  </head>
  <body>
    <main id="app" aria-label="Mushaf pages">
      ${buildSurahIntroHtml(surahIntro)}
      ${buildPageShells(normalizedPageNumbers, estimatedPageHeight, compactPageLines)}
      ${buildSurahNavigationHtml(surahNavigation)}
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
        var FIRST_SHELL_PAGE_NUMBER = ${firstShellPageNumber};
        var KEEP_SURAH_INTRO_VISIBLE = ${
          surahIntro &&
          normalizedInitialPageNumber === firstShellPageNumber &&
          highlightVerseKey === `${surahIntro.chapterId}:1`
            ? 'true'
            : 'false'
        };
        var COMPACT_PAGE_LINES = ${compactPageLines ? 'true' : 'false'};
        var PAGE_NUMBERS = ${serializeJson(normalizedPageNumbers)};
        var PAGE_NUMBER_LOOKUP = PAGE_NUMBERS.reduce(function (lookup, pageNumber) {
          lookup[pageNumber] = true;
          return lookup;
        }, Object.create(null));
        var REFLOW_HYSTERESIS_PX = ${REFLOW_HYSTERESIS_PX};
        var pageStates = new Map();
        var loadedPageNumbers = new Set();
        var activeRenderTokens = Object.create(null);
        var scrollRequestTimeoutId = null;
        var activePageRafId = null;
        var scrollActivityRafId = null;
        var lastEmittedActivePageNumber = null;
        var selectionRafId = null;
        var didScrollToInitialPage = false;
        var didScrollToHighlight = false;
        var didEmitInitialPositioned = false;
        var initialPositionRafId = null;
        var isArrivalHighlightVisible = Boolean(HIGHLIGHT_VERSE_KEY);
        var arrivalHighlightTimeoutId = null;

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

        function escapeCssString(value) {
          return String(value).replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\\\'");
        }

        function ensureTajweedDarkPalette(qcfFontFamily) {
          if (${theme === 'dark' ? 'false' : 'true'} || !qcfFontFamily) {
            return null;
          }

          var styleId = 'tajweed-dark-palette-' + String(qcfFontFamily).replace(/[^a-zA-Z0-9_-]/g, '-');
          if (!document.getElementById(styleId)) {
            var style = document.createElement('style');
            style.id = styleId;
            style.textContent =
              "@font-palette-values --tajweed-dark-palette-" +
              styleId +
              " { font-family: '" +
              escapeCssString(qcfFontFamily) +
              "'; override-colors: 0 ${palette.text}, 1 ${palette.text}; }";
            document.head.appendChild(style);
          }

          return '--tajweed-dark-palette-' + styleId;
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

        function getVerseNumberFromWord(word) {
          var verseKey = resolveVerseKey(word);
          if (!verseKey) {
            return undefined;
          }

          var parts = verseKey.split(':');
          var verseNumber = parseInt(parts[1] || '', 10);
          return Number.isFinite(verseNumber) && verseNumber > 0 ? verseNumber : undefined;
        }

        function toArabicIndicNumber(value) {
          var digits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
          return String(value).replace(/[0-9]/g, function (digit) {
            return digits[parseInt(digit, 10)] || digit;
          });
        }

        function toExtendedArabicIndicNumber(value) {
          var digits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
          return String(value).replace(/[0-9]/g, function (digit) {
            return digits[parseInt(digit, 10)] || digit;
          });
        }

        function formatIndopakVerseMarker(verseNumber) {
          return '﴿' + toExtendedArabicIndicNumber(verseNumber) + '﴾';
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
            qcfFontFamily: null,
            renderedReflow: false,
            renderedStandard: false,
            renderKey: null,
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
          scheduleActivePageReport();
          return true;
        }

        function resolveActivePageNumber() {
          var viewportAnchor = Math.min(Math.max(window.innerHeight * 0.22, 72), 160);
          var bestPageNumber = null;
          var bestDistance = Number.POSITIVE_INFINITY;

          pageStates.forEach(function (state) {
            if (!state.root) {
              return;
            }

            var rect = state.root.getBoundingClientRect();
            if (rect.bottom < 0 || rect.top > window.innerHeight) {
              return;
            }

            var distance = Math.abs(rect.top - viewportAnchor);
            if (distance < bestDistance) {
              bestDistance = distance;
              bestPageNumber = state.pageNumber;
            }
          });

          if (bestPageNumber !== null) {
            return bestPageNumber;
          }

          var scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
          pageStates.forEach(function (state) {
            if (!state.root) {
              return;
            }

            var distance = Math.abs(state.root.offsetTop - scrollTop);
            if (distance < bestDistance) {
              bestDistance = distance;
              bestPageNumber = state.pageNumber;
            }
          });

          return bestPageNumber;
        }

        function emitActivePageIfChanged() {
          activePageRafId = null;
          var activePageNumber = resolveActivePageNumber();
          if (!Number.isFinite(activePageNumber) || activePageNumber === lastEmittedActivePageNumber) {
            return;
          }

          lastEmittedActivePageNumber = activePageNumber;
          emit({
            type: 'reader-active-page-change',
            payload: {
              pageNumber: activePageNumber,
            },
          });
        }

        function scheduleActivePageReport() {
          if (activePageRafId !== null) {
            return;
          }

          activePageRafId = requestAnimationFrame(emitActivePageIfChanged);
        }

        function emitScrollActivity() {
          scrollActivityRafId = null;
          if (!didEmitInitialPositioned) {
            return;
          }
          emit({
            type: 'reader-scroll',
            payload: {
              scrollY: window.scrollY || document.documentElement.scrollTop || 0,
            },
          });
        }

        function scheduleScrollActivityReport() {
          if (scrollActivityRafId !== null) {
            return;
          }

          scrollActivityRafId = requestAnimationFrame(emitScrollActivity);
        }

        function scheduleInitialPositioned(pageNumber) {
          if (
            didEmitInitialPositioned ||
            initialPositionRafId !== null ||
            pageNumber !== INITIAL_PAGE_NUMBER ||
            (HIGHLIGHT_VERSE_KEY && !didScrollToHighlight)
          ) {
            return;
          }

          initialPositionRafId = requestAnimationFrame(function () {
            initialPositionRafId = requestAnimationFrame(function () {
              initialPositionRafId = null;
              if (didEmitInitialPositioned) {
                return;
              }

              didEmitInitialPositioned = true;
              emit({
                type: 'reader-initial-positioned',
                payload: {
                  pageNumber: INITIAL_PAGE_NUMBER,
                  scrollY: window.scrollY || document.documentElement.scrollTop || 0,
                },
              });
            });
          });
        }

        function getPageRenderKey(pageData) {
          if (!pageData || !pageData.pack) {
            return '';
          }

          return [
            pageData.pack.packId || '',
            pageData.pack.version || '',
            pageData.pageNumber || '',
            HIGHLIGHT_VERSE_KEY || '',
          ].join(':');
        }

        async function loadQcfPageFontIfNeeded(rendererAssets) {
          if (
            !rendererAssets ||
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

        function createIndopakVerseMarkerNode(state, word, className, qcfFontFamily, verseKey) {
          var verseNumber = getVerseNumberFromWord(word);
          if (!verseNumber) {
            return null;
          }

          var wordNode = document.createElement('span');
          wordNode.className = className;
          wordNode.dataset.mushafWord = 'true';
          wordNode.dataset.interactive = 'true';
          wordNode.dataset.copyText = toArabicIndicNumber(verseNumber);
          wordNode.dataset.charType = String(word.charType || '');
          wordNode.dataset.lineNumber = String(word.lineNumber || '');
          wordNode.dataset.location = String(word.location || '');
          wordNode.dataset.pageNumber = String(state.pageNumber);
          if (verseKey) {
            wordNode.dataset.verseKey = verseKey;
          }
          wordNode.dataset.wordPosition = String(word.position);
          wordNode.setAttribute('aria-label', 'Verse ' + String(verseNumber));
          wordNode.classList.add('indopak-verse-marker');
          wordNode.setAttribute('dir', 'rtl');
          if (qcfFontFamily) {
            wordNode.style.fontFamily = "'" + String(qcfFontFamily).replace(/'/g, "\\\\'") + "', serif";
          }
          wordNode.textContent = formatIndopakVerseMarker(verseNumber);
          return wordNode;
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

          if (
            word.charType === 'end' &&
            state.data.pack &&
            state.data.pack.script === 'indopak'
          ) {
            return createIndopakVerseMarkerNode(state, word, className, qcfFontFamily, verseKey);
          }

          if (!wordText && !shouldUseQcfGlyph) {
            return null;
          }

          var wordNode = document.createElement('span');
          wordNode.className = className;
          wordNode.dataset.mushafWord = 'true';
          wordNode.dataset.interactive = 'true';
          wordNode.dataset.copyText = normalizeCopyText(wordText);
          wordNode.dataset.charType = String(word.charType || '');
          wordNode.dataset.lineNumber = String(word.lineNumber || '');
          wordNode.dataset.location = String(word.location || '');
          wordNode.dataset.pageNumber = String(state.pageNumber);
          if (verseKey) {
            wordNode.dataset.verseKey = verseKey;
            if (
              isArrivalHighlightVisible &&
              HIGHLIGHT_VERSE_KEY &&
              HIGHLIGHT_VERSE_KEY === verseKey
            ) {
              wordNode.classList.add('arrival-highlight');
            }
          }
          wordNode.dataset.wordPosition = String(word.position);

          if (shouldUseQcfGlyph) {
            wordNode.classList.add('qcf-word');
            wordNode.style.fontFamily = "'" + String(qcfFontFamily).replace(/'/g, "\\\\'") + "', serif";
            wordNode.style.color = 'var(--text)';
            wordNode.style.webkitTextFillColor = 'currentColor';
            if (qcfVersion === 'v4') {
              wordNode.classList.add('tajweed-word');
              var tajweedPalette = ensureTajweedDarkPalette(qcfFontFamily);
              if (tajweedPalette) {
                wordNode.style.setProperty('font-palette', tajweedPalette);
              }
            }
            wordNode.innerHTML = glyphCode;
          } else {
            if (!qcfVersion && qcfFontFamily) {
              wordNode.style.fontFamily = "'" + String(qcfFontFamily).replace(/'/g, "\\\\'") + "', serif";
            }
            wordNode.textContent = wordText;
          }

          return wordNode;
        }

        function clearArrivalHighlights() {
          isArrivalHighlightVisible = false;
          var highlights = app.querySelectorAll('.arrival-highlight');
          for (var index = 0; index < highlights.length; index += 1) {
            highlights[index].classList.remove('arrival-highlight');
          }
          arrivalHighlightTimeoutId = null;
        }

        function scheduleArrivalHighlightClear() {
          if (!HIGHLIGHT_VERSE_KEY) {
            return;
          }

          if (arrivalHighlightTimeoutId !== null) {
            clearTimeout(arrivalHighlightTimeoutId);
          }

          arrivalHighlightTimeoutId = setTimeout(clearArrivalHighlights, 1800);
        }

        function clearPage(state) {
          if (!state || !state.standardView || !state.reflowView) {
            return;
          }

          state.standardView.innerHTML = '';
          state.reflowView.innerHTML = '';
          state.qcfFontFamily = null;
          state.renderedReflow = false;
          state.renderedStandard = false;
          state.root.classList.remove('reflow');
          state.reflowState = null;
          state.lastContainerWidth = 0;
        }

        function renderStandardLines(state, qcfFontFamily) {
          if (!state.data || !state.standardView) {
            return;
          }
          if (state.renderedStandard) {
            return;
          }

          var pageLines = Array.isArray(state.data.pageLines.lines)
            ? state.data.pageLines.lines
            : [];
          var lineEntries = [];

          if (COMPACT_PAGE_LINES) {
            lineEntries = pageLines.filter(function (line) {
              return line && Array.isArray(line.words) && line.words.length > 0;
            });
          } else {
            var linesByNumber = new Map(
              pageLines.map(function (line) {
                return [line.lineNumber, line];
              })
            );

            for (var lineNumber = 1; lineNumber <= state.data.pack.lines; lineNumber += 1) {
              lineEntries.push(linesByNumber.get(lineNumber) || null);
            }
          }

          var fragment = document.createDocumentFragment();

          for (var lineIndex = 0; lineIndex < lineEntries.length; lineIndex += 1) {
            var line = lineEntries[lineIndex];
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
              fragment.appendChild(lineShell);
              continue;
            }

            for (var index = 0; index < line.words.length; index += 1) {
              var wordNode = createWordNode(state, line.words[index], 'word', qcfFontFamily);
              if (wordNode) {
                lineContent.appendChild(wordNode);
              }
            }

            fragment.appendChild(lineShell);
          }

          state.standardView.appendChild(fragment);
          state.renderedStandard = true;
        }

        function renderReflowContent(state, qcfFontFamily) {
          if (!state.data || !state.reflowView) {
            return;
          }
          if (state.renderedReflow) {
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
          state.renderedReflow = true;
        }

        function ensureActiveLayoutRendered(state) {
          if (!state || !state.data) {
            return;
          }

          if (state.reflowState) {
            renderReflowContent(state, state.qcfFontFamily);
          } else {
            renderStandardLines(state, state.qcfFontFamily);
          }
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
          window.scrollTo(
            0,
            KEEP_SURAH_INTRO_VISIBLE
              ? 0
              : Math.max(0, pageTop + anchor.offsetY - FOCUS_TOP_INSET_PX)
          );
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
          var renderKey = getPageRenderKey(pageData);
          if (state.renderKey === renderKey && loadedPageNumbers.has(pageNumber)) {
            scrollToHighlightedVerseIfReady(state);
            return;
          }

          var renderToken = (activeRenderTokens[pageNumber] || 0) + 1;
          activeRenderTokens[pageNumber] = renderToken;
          state.data = pageData;
          state.renderKey = renderKey;

          clearPage(state);
          var qcfFontFamily = await loadQcfPageFontIfNeeded(pageData.rendererAssets || {});
          if (activeRenderTokens[pageNumber] !== renderToken) {
            return;
          }

          state.qcfFontFamily = qcfFontFamily;
          applyLayoutMode(state, layout);
          ensureActiveLayoutRendered(state);
          state.root.classList.remove('loading');
          loadedPageNumbers.add(pageNumber);
          emitPageRendered(state);
          scrollToHighlightedVerseIfReady(state);
          scheduleInitialPositioned(pageNumber);
          if (pageNumber === INITIAL_PAGE_NUMBER && HIGHLIGHT_VERSE_KEY) {
            scheduleArrivalHighlightClear();
          }
          setTimeout(function () {
            applyLayoutMode(state, layout);
            ensureActiveLayoutRendered(state);
            emitPageRendered(state);
            scrollToHighlightedVerseIfReady(state);
            scheduleInitialPositioned(pageNumber);
          }, 0);
        }

        function getWordTarget(node) {
          return node instanceof Element ? node.closest('[data-mushaf-word="true"]') : null;
        }

        function parseWordPayload(node) {
          if (!node || !node.dataset) {
            return null;
          }

          var pageNumber = parseInt(node.dataset.pageNumber || '', 10);
          var lineNumber = parseInt(node.dataset.lineNumber || '', 10);
          var wordPosition = parseInt(node.dataset.wordPosition || '', 10);

          if (!Number.isFinite(wordPosition)) {
            return null;
          }

          return {
            charType: node.dataset.charType || undefined,
            lineNumber: Number.isFinite(lineNumber) ? lineNumber : undefined,
            location: node.dataset.location || undefined,
            pageNumber: Number.isFinite(pageNumber) ? pageNumber : undefined,
            text: node.dataset.copyText || '',
            verseKey: node.dataset.verseKey || undefined,
            wordPosition: wordPosition,
          };
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
              return Boolean(PAGE_NUMBER_LOOKUP[pageNumber]);
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

        document.addEventListener('click', function (event) {
          var navigationTarget =
            event.target instanceof Element
              ? event.target.closest('[data-surah-navigation]')
              : null;
          if (!(navigationTarget instanceof HTMLButtonElement) || navigationTarget.disabled) {
            return;
          }

          var direction = navigationTarget.dataset.surahNavigation;
          if (direction !== 'next' && direction !== 'previous') {
            return;
          }

          emit({
            type: 'surah-navigation',
            payload: {
              direction: direction,
            },
          });
        });

        window.addEventListener('resize', function () {
          pageStates.forEach(function (state) {
            if (state.data && state.lastLayout) {
              applyLayoutMode(state, state.lastLayout);
              ensureActiveLayoutRendered(state);
              emitPageRendered(state);
              scrollToHighlightedVerseIfReady(state);
            }
          });
          scheduleNearPageRequest();
        });

        window.addEventListener('scroll', function () {
          scheduleNearPageRequest();
          scheduleActivePageReport();
          scheduleScrollActivityReport();
        }, { passive: true });

        initPageStates();
        if (INITIAL_PAGE_NUMBER === FIRST_SHELL_PAGE_NUMBER && HIGHLIGHT_VERSE_KEY === '') {
          window.scrollTo(0, 0);
        } else {
          scrollToPage(INITIAL_PAGE_NUMBER);
        }
        didScrollToInitialPage = true;
        scheduleActivePageReport();

        window.__MUSHAF_READER__ = {
          upsertPages: function (payload) {
            if (!payload || !Array.isArray(payload.pages) || !payload.layout) {
              return;
            }

            if (typeof payload.highlightVerseKey === 'string') {
              HIGHLIGHT_VERSE_KEY = payload.highlightVerseKey.trim();
              isArrivalHighlightVisible = Boolean(HIGHLIGHT_VERSE_KEY);
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
            isArrivalHighlightVisible = Boolean(HIGHLIGHT_VERSE_KEY);
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
  compactPageLines = false,
  estimatedPageHeight,
  focusTopInsetPx,
  highlightVerseKey,
  initialPageNumber,
  mushafScaleStep,
  pageNumbers,
  packId,
  surahIntro,
  surahNavigation,
  theme,
  totalPages,
  viewportHeight,
}: {
  compactPageLines?: boolean | undefined;
  estimatedPageHeight: number;
  focusTopInsetPx: number;
  highlightVerseKey?: string | null;
  initialPageNumber: number;
  mushafScaleStep: MushafScaleStep;
  pageNumbers?: number[] | undefined;
  packId: MushafPackId;
  surahIntro?: MushafReaderSurahIntro | undefined;
  surahNavigation?: MushafReaderSurahNavigation | undefined;
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
    surahNavigation
      ? [surahNavigation.previousSurahName ?? '', surahNavigation.nextSurahName ?? ''].join('|')
      : 'no-navigation',
    highlightVerseKey ?? '',
  ].join(':');
  const cached = shellDocumentCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const shellDocument = {
    html: buildShellDocumentHtml({
      compactPageLines,
      estimatedPageHeight,
      focusTopInsetPx,
      highlightVerseKey,
      initialPageNumber,
      layout,
      pageNumbers,
      surahIntro,
      surahNavigation,
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
