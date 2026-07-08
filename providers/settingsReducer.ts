import { clampMushafScaleStep, type MushafPackId, type MushafScaleStep, type Settings } from '@/types';

export type SettingsAction =
  | { type: 'SET_SETTINGS'; value: Settings }
  | { type: 'SET_SHOW_BY_WORDS'; value: boolean }
  | { type: 'SET_TAJWEED'; value: boolean }
  | { type: 'SET_WORD_LANG'; value: string }
  | { type: 'SET_WORD_TRANSLATION_ID'; value: number }
  | { type: 'SET_TAFSIR_IDS'; value: number[] }
  | { type: 'SET_TRANSLATION_IDS'; value: number[] }
  | { type: 'SET_ARABIC_FONT_SIZE'; value: number }
  | { type: 'SET_TRANSLATION_FONT_SIZE'; value: number }
  | { type: 'SET_TAFSIR_FONT_SIZE'; value: number }
  | { type: 'SET_ARABIC_FONT_FACE'; value: string }
  | { type: 'SET_MUSHAF_ID'; value: MushafPackId }
  | { type: 'SET_MUSHAF_SCALE_STEP'; value: MushafScaleStep }
  | { type: 'SET_CONTENT_LANGUAGE'; value: string }
  | { type: 'SET_UI_LANGUAGE'; value: string }
  | { type: 'SET_READING_MODE'; value: 'translations' | 'mushaf' };

function normalizeIdList(value: number[]): number[] {
  const seen = new Set<number>();
  const normalized: number[] = [];

  for (const raw of value ?? []) {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    const id = Math.trunc(raw);
    if (id <= 0) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }

  return normalized;
}

type ActionHandlerMap = {
  [Type in SettingsAction['type']]: (
    state: Settings,
    action: Extract<SettingsAction, { type: Type }>
  ) => Settings;
};

const actionHandlers = {
  SET_SETTINGS: (_state, action) => action.value,
  SET_SHOW_BY_WORDS: (state, action) =>
    state.showByWords === action.value ? state : { ...state, showByWords: action.value },
  SET_TAJWEED: (state, action) =>
    state.tajweed === action.value ? state : { ...state, tajweed: action.value },
  SET_WORD_LANG: (state, action) =>
    state.wordLang === action.value ? state : { ...state, wordLang: action.value },
  SET_WORD_TRANSLATION_ID: (state, action) =>
    state.wordTranslationId === action.value ? state : { ...state, wordTranslationId: action.value },
  SET_TAFSIR_IDS: (state, action) => {
    const normalized = normalizeIdList(action.value);
    const current = state.tafsirIds ?? [];
    if (
      current.length === normalized.length &&
      current.every((id, idx) => id === normalized[idx])
    ) {
      return state;
    }
    return { ...state, tafsirIds: normalized };
  },
  SET_TRANSLATION_IDS: (state, action) => {
    const normalized = normalizeIdList(action.value);
    const [primaryTranslationId] = normalized;
    const targetPrimaryId = primaryTranslationId ?? state.translationId;
    const current = state.translationIds ?? [];

    if (
      current.length === normalized.length &&
      current.every((id, idx) => id === normalized[idx]) &&
      state.translationId === targetPrimaryId
    ) {
      return state;
    }

    return {
      ...state,
      translationIds: normalized,
      translationId: targetPrimaryId,
    };
  },
  SET_ARABIC_FONT_SIZE: (state, action) =>
    state.arabicFontSize === action.value ? state : { ...state, arabicFontSize: action.value },
  SET_TRANSLATION_FONT_SIZE: (state, action) =>
    state.translationFontSize === action.value ? state : { ...state, translationFontSize: action.value },
  SET_TAFSIR_FONT_SIZE: (state, action) =>
    state.tafsirFontSize === action.value ? state : { ...state, tafsirFontSize: action.value },
  SET_ARABIC_FONT_FACE: (state, action) =>
    state.arabicFontFace === action.value ? state : { ...state, arabicFontFace: action.value },
  SET_MUSHAF_ID: (state, action) =>
    state.mushafId === action.value ? state : { ...state, mushafId: action.value },
  SET_MUSHAF_SCALE_STEP: (state, action) => {
    const clamped = clampMushafScaleStep(action.value);
    return state.mushafScaleStep === clamped ? state : { ...state, mushafScaleStep: clamped };
  },
  SET_CONTENT_LANGUAGE: (state, action) =>
    state.contentLanguage === action.value ? state : { ...state, contentLanguage: action.value },
  SET_UI_LANGUAGE: (state, action) =>
    state.uiLanguage === action.value ? state : { ...state, uiLanguage: action.value },
  SET_READING_MODE: (state, action) =>
    state.readingMode === action.value ? state : { ...state, readingMode: action.value },
} satisfies ActionHandlerMap;

export function settingsReducer(state: Settings, action: SettingsAction): Settings {
  return actionHandlers[action.type](state, action as never);
}
