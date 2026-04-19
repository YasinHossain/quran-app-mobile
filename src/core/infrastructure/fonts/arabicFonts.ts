import * as Font from 'expo-font';

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

export const DEFAULT_ARABIC_FONT_FAMILY = 'UthmanicHafs1Ver18' as const satisfies AppFontFamily;
export const DEFAULT_ARABIC_FONT_VALUE = `"${DEFAULT_ARABIC_FONT_FAMILY}", serif`;
export const STARTUP_FONT_ASSETS = {
  SpaceMono: FONT_ASSETS.SpaceMono,
  [DEFAULT_ARABIC_FONT_FAMILY]: FONT_ASSETS[DEFAULT_ARABIC_FONT_FAMILY],
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
