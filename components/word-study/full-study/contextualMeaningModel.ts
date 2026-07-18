import type { WordAnalysis } from '../../../src/core/domain/word-study';
import {
  getWordLanguageDirection,
  getWordLanguageName,
  normalizeWordLanguageCode,
  type WordLanguageCode,
  type WordLanguageDirection,
} from '../../../lib/i18n/wordLanguages';

import { getPrimaryGloss } from '../wordQuickSheetModel';

export type ContextualMeaningPresentation = {
  text: string;
  languageCode: WordLanguageCode;
  languageName: string;
  direction: WordLanguageDirection;
  sourceLabel: string;
  isFallback: boolean;
  fallbackMessage?: string;
};

type StoredWordTranslation = {
  position?: unknown;
  translationText?: unknown;
  charTypeName?: unknown;
};

export function getStoredWordTranslation(
  wordsJson: string | null | undefined,
  wordPosition: number
): string | null {
  if (!wordsJson || !Number.isInteger(wordPosition) || wordPosition < 1) return null;
  try {
    const value = JSON.parse(wordsJson) as unknown;
    if (!Array.isArray(value)) return null;
    const match = value.find((candidate): candidate is StoredWordTranslation => {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
      const word = candidate as StoredWordTranslation;
      return word.position === wordPosition && word.charTypeName !== 'end';
    });
    return typeof match?.translationText === 'string' && match.translationText.trim()
      ? match.translationText.trim()
      : null;
  } catch {
    return null;
  }
}

export function resolveContextualMeaning({
  analysis,
  selectedLanguageCode,
  selectedLanguageWordsJson,
  lookupFailed = false,
}: {
  analysis: WordAnalysis;
  selectedLanguageCode: string;
  selectedLanguageWordsJson?: string | null;
  lookupFailed?: boolean;
}): ContextualMeaningPresentation {
  const selectedCode = normalizeWordLanguageCode(selectedLanguageCode);
  const englishText = getPrimaryGloss(analysis);

  if (selectedCode === 'en') {
    return {
      text: englishText,
      languageCode: 'en',
      languageName: 'English',
      direction: 'ltr',
      sourceLabel: 'English · Bundled offline',
      isFallback: false,
    };
  }

  const selectedText = getStoredWordTranslation(
    selectedLanguageWordsJson,
    analysis.location.wordPosition
  );
  if (selectedText) {
    return {
      text: selectedText,
      languageCode: selectedCode,
      languageName: getWordLanguageName(selectedCode),
      direction: getWordLanguageDirection(selectedCode),
      sourceLabel: `${getWordLanguageName(selectedCode)} · Installed offline`,
      isFallback: false,
    };
  }

  const selectedName = getWordLanguageName(selectedCode);
  return {
    text: englishText,
    languageCode: 'en',
    languageName: 'English',
    direction: 'ltr',
    sourceLabel: 'English fallback · Bundled offline',
    isFallback: true,
    fallbackMessage: lookupFailed
      ? `The installed ${selectedName} meaning could not be read. Showing bundled English.`
      : `${selectedName} is not available offline for this word. Showing bundled English.`,
  };
}
