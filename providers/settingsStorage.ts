import { DEFAULT_MUSHAF_ID } from '@/data/mushaf/options';
import { getItem, parseJson, setItem } from '@/lib/storage/appStorage';

import type { Settings } from '@/types';

export const ARABIC_FONTS = [
  { name: 'KFGQ', value: '"UthmanicHafs1Ver18", serif', category: 'Uthmani' },
  { name: 'KFGQ V2', value: '"KFGQ V2", serif', category: 'Uthmani' },
  { name: 'Me Quran', value: '"Me Quran", serif', category: 'Uthmani' },
  { name: 'Amiri Quran', value: '"Amiri Quran", serif', category: 'Uthmani' },

  { name: 'Scheherazade New', value: '"Scheherazade New", serif', category: 'Uthmani' },
  { name: 'Noto Naskh Arabic', value: '"Noto Naskh Arabic", serif', category: 'Uthmani' },

  { name: 'IndoPak Nastaleeq (Waqf Lazim)', value: '"IndoPak", serif', category: 'IndoPak' },
  { name: 'Noor-e-Huda', value: '"Noor-e-Huda", serif', category: 'IndoPak' },
  { name: 'Noor-e-Hidayat', value: '"Noor-e-Hidayat", serif', category: 'IndoPak' },
  { name: 'Noor-e-Hira', value: '"Noor-e-Hira", serif', category: 'IndoPak' },
  { name: 'Lateef', value: '"Lateef", serif', category: 'IndoPak' },
] as const;

const DEFAULT_ARABIC_FONT_VALUE = '"UthmanicHafs1Ver18", serif';
const DEFAULT_ARABIC_FONT =
  ARABIC_FONTS.find((font) => font.value === DEFAULT_ARABIC_FONT_VALUE)?.value ??
  DEFAULT_ARABIC_FONT_VALUE;

export const defaultSettings: Settings = {
  translationId: 20,
  translationIds: [20],
  tafsirIds: [169],
  arabicFontSize: 34,
  translationFontSize: 18,
  tafsirFontSize: 18,
  arabicFontFace: DEFAULT_ARABIC_FONT,
  wordLang: 'en',
  wordTranslationId: 85,
  showByWords: false,
  tajweed: false,
  mushafId: DEFAULT_MUSHAF_ID,
  contentLanguage: 'en',
};

type RawSettings = Partial<Settings> & { tafsirId?: number };

const SETTINGS_KEY = 'quranAppSettings';

function normalizeSettings(raw: RawSettings, defaults: Settings): Settings {
  const mutable = { ...raw };

  if (mutable.tafsirId && !mutable.tafsirIds) {
    mutable.tafsirIds = [mutable.tafsirId];
    delete mutable.tafsirId;
  }

  const normalizeIdList = (value: unknown): number[] => {
    const input = Array.isArray(value) ? value : [];
    const seen = new Set<number>();
    const normalized: number[] = [];

    for (const rawId of input) {
      if (typeof rawId !== 'number' || !Number.isFinite(rawId)) continue;
      const id = Math.trunc(rawId);
      if (id <= 0) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      normalized.push(id);
    }

    return normalized;
  };

  const translationIds = Array.isArray(mutable.translationIds)
    ? normalizeIdList(mutable.translationIds)
    : [mutable.translationId ?? defaults.translationId].filter(
        (id): id is number => typeof id === 'number'
      );

  const translationId = typeof mutable.translationId === 'number'
    ? mutable.translationId
    : translationIds[0] ?? defaults.translationId;

  const tafsirIds = Array.isArray(mutable.tafsirIds) && mutable.tafsirIds.length > 0
    ? normalizeIdList(mutable.tafsirIds)
    : defaults.tafsirIds;

  const merged = { ...defaults, ...mutable } as Settings;

  return {
    ...merged,
    translationIds,
    translationId,
    tafsirIds,
  };
}

export async function loadSettings(defaults: Settings = defaultSettings): Promise<Settings> {
  const savedSettings = parseJson<RawSettings>(await getItem(SETTINGS_KEY));
  if (!savedSettings) return defaults;
  return normalizeSettings(savedSettings, defaults);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await setItem(SETTINGS_KEY, JSON.stringify(settings));
}
