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

const QCF_V1_PRESETS: Record<number, ExactScalePreset> = {
  1: { fontSize: '3.2vh', lineWidthDesktop: '50vh' },
  2: { fontSize: '3.5vh', lineWidthDesktop: '54vh' },
  3: { fontSize: '4vh', lineWidthDesktop: '61vh' },
  4: { fontSize: '4vh', lineWidthDesktop: '61.5vh' },
  5: { fontSize: '4.4vh', lineWidthDesktop: '67.5vh' },
  6: { fontSize: '5.56vh', lineWidthDesktop: '85.5vh' },
  7: { fontSize: '6.72vh', lineWidthDesktop: '103.5vh' },
  8: { fontSize: '7.88vh', lineWidthDesktop: '122vh' },
  9: { fontSize: '9.04vh', lineWidthDesktop: '139.5vh' },
  10: { fontSize: '10.27vh', lineWidthDesktop: '158vh' },
};

const QCF_V2_PRESETS: Record<number, ExactScalePreset> = {
  1: { fontSize: '2.8vh', lineWidthDesktop: '47vh' },
  2: { fontSize: '2.9vh', lineWidthDesktop: '49vh' },
  3: { fontSize: '3vh', lineWidthDesktop: '50.5vh' },
  4: { fontSize: '3.3vh', lineWidthDesktop: '55vh' },
  5: { fontSize: '3.5vh', lineWidthDesktop: '58vh' },
  6: { fontSize: '4.9vh', lineWidthDesktop: '81.5vh' },
  7: { fontSize: '6.3vh', lineWidthDesktop: '105vh' },
  8: { fontSize: '7.7vh', lineWidthDesktop: '128vh' },
  9: { fontSize: '9.1vh', lineWidthDesktop: '151.5vh' },
  10: { fontSize: '10.5vh', lineWidthDesktop: '175vh' },
};

const QPC_HAFS_PRESETS: Record<number, ExactScalePreset> = {
  1: { fontSize: '3.2vh', lineWidthDesktop: '59vh' },
  2: { fontSize: '3.5vh', lineWidthDesktop: '64vh' },
  3: { fontSize: '4vh', lineWidthDesktop: '73.5vh' },
  4: { fontSize: '4vh', lineWidthDesktop: '73.5vh' },
  5: { fontSize: '4.4vh', lineWidthDesktop: '81vh' },
  6: { fontSize: '5.56vh', lineWidthDesktop: '102vh' },
  7: { fontSize: '6.72vh', lineWidthDesktop: '123vh' },
  8: { fontSize: '7.88vh', lineWidthDesktop: '145vh' },
  9: { fontSize: '9.04vh', lineWidthDesktop: '166vh' },
  10: { fontSize: '10.27vh', lineWidthDesktop: '189vh' },
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

const INDOPAK_16_PRESETS: Record<number, ExactScalePreset> = {
  1: { fontSize: '3.2vh', lineWidthDesktop: '52vh' },
  2: { fontSize: '3.5vh', lineWidthDesktop: '58vh' },
  3: { fontSize: '4vh', lineWidthDesktop: '68vh' },
  4: { fontSize: '4.2vh', lineWidthDesktop: '68vh' },
  5: { fontSize: '4.3vh', lineWidthDesktop: '69vh' },
  6: { fontSize: '5.64vh', lineWidthDesktop: '89vh' },
  7: { fontSize: '6.98vh', lineWidthDesktop: '109vh' },
  8: { fontSize: '8.32vh', lineWidthDesktop: '129vh' },
  9: { fontSize: '9.66vh', lineWidthDesktop: '150vh' },
  10: { fontSize: '11vh', lineWidthDesktop: '170vh' },
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
    case 'qcf-tajweed-v4':
      return QCF_V1_PRESETS[step] ?? QCF_V1_PRESETS[1];
    case 'qcf-madani-v2':
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
