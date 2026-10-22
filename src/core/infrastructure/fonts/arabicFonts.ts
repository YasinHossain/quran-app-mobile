import * as Font from 'expo-font';

import { QURAN_TEXT_SUPPORT_FONT_FAMILY } from './resolveQuranTextFont';

export const FONT_ASSETS = {
  SpaceMono: require('../../../../assets/fonts/SpaceMono-Regular.ttf'),
  UthmanicHafs1Ver18: require('../../../../assets/fonts/UthmanicHafs1Ver18.ttf'),
  'KFGQ V2': require('../../../../assets/fonts/KFGQPC-Uthman-Taha.ttf'),
  'Me Quran': require('../../../../assets/fonts/me_quran.ttf'),
  'Amiri Quran': require('../../../../assets/fonts/AmiriQuran.ttf'),
  'Scheherazade New': require('../../../../assets/fonts/Scheherazade-New.ttf'),
  'Noto Naskh Arabic': require('../../../../assets/fonts/Noto-Naskh-Arabic.ttf'),
  IndoPak: require('../../../../assets/fonts/indopak-nastaleeq-waqf-lazim-v4.2.1.ttf'),
  'Noor-e-Huda': require('../../../../assets/fonts/Noor-e-Huda.ttf'),
  'Noor-e-Hidayat': require('../../../../assets/fonts/Noor-e-Hidayat.ttf'),
  'Noor-e-Hira': require('../../../../assets/fonts/Noor-e-Hira.ttf'),
  Lateef: require('../../../../assets/fonts/Lateef.ttf'),
} as const;

export type AppFontFamily = keyof typeof FONT_ASSETS;

// Natural line height per em (hhea ascender - descender + lineGap) of each bundled font. Native
// text views size lines from these metrics, so matching the Kotlin reader's spacing in RN Text
// (which needs an explicit lineHeight) means deriving it per font. Update when a font file changes.
const FONT_NATURAL_LINE_HEIGHT_EM: Record<AppFontFamily, number> = {
  SpaceMono: 1.481,
  UthmanicHafs1Ver18: 1.758,
  'KFGQ V2': 1.685,
  'Me Quran': 2.188,
  'Amiri Quran': 2.449,
  'Scheherazade New': 2.04,
  'Noto Naskh Arabic': 1.703,
  IndoPak: 2.112,
  'Noor-e-Huda': 1.879,
  'Noor-e-Hidayat': 2.148,
  'Noor-e-Hira': 2.1,
  Lateef: 1.446,
};

export const DEFAULT_ARABIC_FONT_FAMILY = 'UthmanicHafs1Ver18' as const satisfies AppFontFamily;
export const DEFAULT_ARABIC_FONT_VALUE = `"${DEFAULT_ARABIC_FONT_FAMILY}", serif`;
export const STARTUP_FONT_ASSETS = {
  SpaceMono: FONT_ASSETS.SpaceMono,
  [DEFAULT_ARABIC_FONT_FAMILY]: FONT_ASSETS[DEFAULT_ARABIC_FONT_FAMILY],
  [QURAN_TEXT_SUPPORT_FONT_FAMILY]: FONT_ASSETS[QURAN_TEXT_SUPPORT_FONT_FAMILY],
} as const;

const SUPPORT_FONT_FAMILIES: readonly AppFontFamily[] = ['Scheherazade New'];
const inFlightLoads = new Map<AppFontFamily, Promise<void>>();

export function getFirstFontFamily(fontFace?: string): string | undefined {
  if (!fontFace) return undefined;
  const first = fontFace.split(',')[0]?.trim();
  return first?.replace(/^['"]|['"]$/g, '') || undefined;
}

export function isAppFontFamily(fontFamily: string): fontFamily is AppFontFamily {
  return fontFamily in FONT_ASSETS;
}

/** The single-line height a native text view gives `fontFamily` at `fontSize` (unknown families use the default font). */
export function getFontNaturalLineHeight(fontFamily: string, fontSize: number): number {
  const em = isAppFontFamily(fontFamily)
    ? FONT_NATURAL_LINE_HEIGHT_EM[fontFamily]
    : FONT_NATURAL_LINE_HEIGHT_EM[DEFAULT_ARABIC_FONT_FAMILY];
  return fontSize * em;
}

// The end-of-ayah ornament is always drawn in this font (Arabic-Indic digits shape into one ornament
// with the number inside), so every reader font shows the same marker. Many reader fonts lack the
// ornament or the digits. Keep in sync with NativeArabicFontResolver.END_OF_AYAH_MARKER_FAMILY.
export const END_OF_AYAH_MARKER_FONT_FAMILY = DEFAULT_ARABIC_FONT_FAMILY;

/** The end-of-ayah marker text for `verseNumber`, to render in END_OF_AYAH_MARKER_FONT_FAMILY. */
export function getEndOfAyahMarker(verseNumber: number): string {
  if (!(verseNumber > 0)) return '';
  return String(Math.trunc(verseNumber)).replace(/\d/g, (d) => String.fromCharCode(0x660 + Number(d)));
}

export async function loadFontFamilyAsync(fontFamily: AppFontFamily): Promise<void> {
  if (Font.isLoaded(fontFamily)) return;

  const existingPromise = inFlightLoads.get(fontFamily);
  if (existingPromise) {
    await existingPromise;
    return;
  }

  const loadPromise = Font.loadAsync({ [fontFamily]: FONT_ASSETS[fontFamily] }).finally(() => {
    inFlightLoads.delete(fontFamily);
  });

  inFlightLoads.set(fontFamily, loadPromise);
  await loadPromise;
}

export async function loadArabicFontFaceAsync(fontFace?: string): Promise<void> {
  const fontFamily = getFirstFontFamily(fontFace);
  if (!fontFamily || !isAppFontFamily(fontFamily)) return;
  await loadFontFamilyAsync(fontFamily);
}

export async function loadArabicSupportFontsAsync(fontFace?: string): Promise<void> {
  await Promise.all([
    loadArabicFontFaceAsync(fontFace),
    ...SUPPORT_FONT_FAMILIES.map((fontFamily) => loadFontFamilyAsync(fontFamily)),
  ]);
}
