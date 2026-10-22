import {
  clampMushafScaleStep,
  mushafScaleStepToFontSize,
  type MushafPackId,
  type MushafScaleStep,
} from '@/types';

type ExactScalePreset = {
  fontSize: string | number;
  lineWidthDesktop: string;
};

export type MushafWebViewLayoutConfig = {
  fontSizeCss: string;
  fontSizePx: number;
  isExactPreset: boolean;
  lineHeightMultiplier: number;
  lineWidthCss: string;
  lineWidthPx: number;
  reflowLineHeightMultiplier: number;
};

const MIN_LINE_WIDTH_PX = 440;
const MAX_LINE_WIDTH_PX = 540;
const LINE_WIDTH_SCALE = 16;
const DEFAULT_REFLOW_LINE_HEIGHT_MULTIPLIER = 1.8;

// Quran.com's own font-size and line-width scales (code_v1 / code_v2 tablet, qpc_uthmani_hafs
// desktop). Each glyph font is drawn for its printed line, so the width-to-size ratio decides
// the space between words; changing either value alone changes the page's look.
const QCF_V1_PRESETS: Record<number, ExactScalePreset> = {
  1: { fontSize: '3.5vh', lineWidthDesktop: '54vh' },
  2: { fontSize: '3.8vh', lineWidthDesktop: '56.5vh' },
  3: { fontSize: '4vh', lineWidthDesktop: '59.5vh' },
  4: { fontSize: '4.3vh', lineWidthDesktop: '63vh' },
  5: { fontSize: '4.5vh', lineWidthDesktop: '67vh' },
  6: { fontSize: '6.14vh', lineWidthDesktop: '91.6vh' },
  7: { fontSize: '7.77vh', lineWidthDesktop: '116.2vh' },
  8: { fontSize: '9.42vh', lineWidthDesktop: '140.8vh' },
  9: { fontSize: '11.05vh', lineWidthDesktop: '165.4vh' },
  10: { fontSize: '12.7vh', lineWidthDesktop: '190vh' },
};

const QCF_V2_PRESETS: Record<number, ExactScalePreset> = {
  1: { fontSize: '2.9vh', lineWidthDesktop: '52vh' },
  2: { fontSize: '3vh', lineWidthDesktop: '54vh' },
  3: { fontSize: '3.2vh', lineWidthDesktop: '56vh' },
  4: { fontSize: '3.5vh', lineWidthDesktop: '61vh' },
  5: { fontSize: '3.7vh', lineWidthDesktop: '64.5vh' },
  6: { fontSize: '5.16vh', lineWidthDesktop: '90.4vh' },
  7: { fontSize: '6.62vh', lineWidthDesktop: '116.3vh' },
  8: { fontSize: '8.08vh', lineWidthDesktop: '142.2vh' },
  9: { fontSize: '9.54vh', lineWidthDesktop: '168.1vh' },
  10: { fontSize: '11vh', lineWidthDesktop: '194vh' },
};

const QPC_HAFS_PRESETS: Record<number, ExactScalePreset> = {
  1: { fontSize: '3.2vh', lineWidthDesktop: '60vh' },
  2: { fontSize: '3.5vh', lineWidthDesktop: '65vh' },
  3: { fontSize: '4vh', lineWidthDesktop: '73.5vh' },
  4: { fontSize: '4vh', lineWidthDesktop: '74vh' },
  5: { fontSize: '4.4vh', lineWidthDesktop: '81vh' },
  6: { fontSize: '5.56vh', lineWidthDesktop: '102.8vh' },
  7: { fontSize: '6.72vh', lineWidthDesktop: '124.6vh' },
  8: { fontSize: '7.88vh', lineWidthDesktop: '146.4vh' },
  9: { fontSize: '9.04vh', lineWidthDesktop: '168.2vh' },
  10: { fontSize: '10.27vh', lineWidthDesktop: '190vh' },
};

const INDOPAK_15_PRESETS: Record<number, ExactScalePreset> = {
  1: { fontSize: '3.2vh', lineWidthDesktop: '58vh' },
  2: { fontSize: '3.5vh', lineWidthDesktop: '64vh' },
  3: { fontSize: '4vh', lineWidthDesktop: '76vh' },
  4: { fontSize: '4.2vh', lineWidthDesktop: '75vh' },
  5: { fontSize: '4.3vh', lineWidthDesktop: '76vh' },
  6: { fontSize: '5.64vh', lineWidthDesktop: '98.6vh' },
  7: { fontSize: '6.98vh', lineWidthDesktop: '121.2vh' },
  8: { fontSize: '8.32vh', lineWidthDesktop: '143.8vh' },
  9: { fontSize: '9.66vh', lineWidthDesktop: '166.4vh' },
  10: { fontSize: '11vh', lineWidthDesktop: '189vh' },
};

// Quran.com's text_indopak_16_lines tablet scales. The box is wider for its size than the 15-line
// print's because 16-line lines carry more words.
const INDOPAK_16_PRESETS: Record<number, ExactScalePreset> = {
  1: { fontSize: '3.1vh', lineWidthDesktop: '55vh' },
  2: { fontSize: '3.2vh', lineWidthDesktop: '61vh' },
  3: { fontSize: '3.4vh', lineWidthDesktop: '63vh' },
  4: { fontSize: '3.7vh', lineWidthDesktop: '65vh' },
  5: { fontSize: '3.95vh', lineWidthDesktop: '69vh' },
  6: { fontSize: '5.08vh', lineWidthDesktop: '93.2vh' },
  7: { fontSize: '6.21vh', lineWidthDesktop: '117.4vh' },
  8: { fontSize: '7.34vh', lineWidthDesktop: '141.6vh' },
  9: { fontSize: '8.47vh', lineWidthDesktop: '165.8vh' },
  10: { fontSize: '9.6vh', lineWidthDesktop: '190vh' },
};

function getDesiredLineWidth(fontSizePx: number): number {
  const scaled = fontSizePx * LINE_WIDTH_SCALE;
  return Math.max(MIN_LINE_WIDTH_PX, Math.min(MAX_LINE_WIDTH_PX, scaled));
}

function toCssLength(value: string | number): string {
  return typeof value === 'number' ? `${value}px` : value;
}

function formatPx(value: number): string {
  return `${Math.round(value * 100) / 100}px`;
}

function parseCssLengthToPx(value: string | number, viewportHeight: number): number {
  if (typeof value === 'number') {
    return value;
  }

  const pxMatch = value.match(/^(\d+(?:\.\d+)?)px$/);
  if (pxMatch?.[1]) {
    return Number.parseFloat(pxMatch[1]);
  }

  const vhMatch = value.match(/^(\d+(?:\.\d+)?)vh$/);
  if (vhMatch?.[1]) {
    return (Number.parseFloat(vhMatch[1]) / 100) * viewportHeight;
  }

  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function getExactPreset(packId: MushafPackId, scaleStep: MushafScaleStep): ExactScalePreset | null {
  const step = clampMushafScaleStep(scaleStep);

  switch (packId) {
    case 'qcf-madani-v1':
      return QCF_V1_PRESETS[step] ?? QCF_V1_PRESETS[1];
    case 'qcf-madani-v2':
    // Tajweed V4 draws the V2 glyph codes.
    case 'qcf-tajweed-v4':
      return QCF_V2_PRESETS[step] ?? QCF_V2_PRESETS[1];
    case 'qpc-uthmani-hafs':
      return QPC_HAFS_PRESETS[step] ?? QPC_HAFS_PRESETS[1];
    case 'unicode-indopak-15':
      return INDOPAK_15_PRESETS[step] ?? INDOPAK_15_PRESETS[1];
    case 'unicode-indopak-16':
      return INDOPAK_16_PRESETS[step] ?? INDOPAK_16_PRESETS[1];
    default:
      return null;
  }
}

function getExactLineHeightMultiplier(packId: MushafPackId): number {
  switch (packId) {
    case 'qcf-madani-v1':
    case 'qpc-uthmani-hafs':
    case 'unicode-indopak-15':
    case 'unicode-indopak-16':
      return 1.6;
    case 'qcf-madani-v2':
    case 'qcf-tajweed-v4':
      return 1.8;
    default:
      return 1.72;
  }
}

export function getMushafWebViewLayoutConfig(
  packId: MushafPackId,
  scaleStep: MushafScaleStep,
  viewportHeight: number
): MushafWebViewLayoutConfig {
  const exactPreset = getExactPreset(packId, scaleStep);

  if (exactPreset) {
    const fontSizePx = parseCssLengthToPx(exactPreset.fontSize, viewportHeight);
    const lineWidthPx = parseCssLengthToPx(exactPreset.lineWidthDesktop, viewportHeight);
    const fontSizeCss = formatPx(fontSizePx);
    const lineWidthCss = formatPx(lineWidthPx);

    return {
      fontSizeCss,
      fontSizePx,
      isExactPreset: true,
      lineHeightMultiplier: getExactLineHeightMultiplier(packId),
      lineWidthCss,
      lineWidthPx,
      reflowLineHeightMultiplier: DEFAULT_REFLOW_LINE_HEIGHT_MULTIPLIER,
    };
  }

  const fontSizePx = mushafScaleStepToFontSize(scaleStep);
  const lineWidthPx = getDesiredLineWidth(fontSizePx);

  return {
    fontSizeCss: `${fontSizePx}px`,
    fontSizePx,
    isExactPreset: false,
    lineHeightMultiplier: 1.72,
    lineWidthCss: `${lineWidthPx}px`,
    lineWidthPx,
    reflowLineHeightMultiplier: DEFAULT_REFLOW_LINE_HEIGHT_MULTIPLIER,
  };
}
