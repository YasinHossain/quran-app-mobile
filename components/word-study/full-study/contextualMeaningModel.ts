import type { WordStudyLocation } from '../../../src/core/domain/word-study';
import {
  getWordLanguageDirection,
  getWordLanguageName,
  normalizeWordLanguageCode,
  type WordLanguageCode,
  type WordLanguageDirection,
} from '../../../lib/i18n/wordLanguages';

export type ContextualMeaningPresentation = {
  text: string;
  languageCode: WordLanguageCode;
  languageName: string;
  direction: WordLanguageDirection;
  sourceLabel: string;
  isFallback: boolean;
  isUnavailable: boolean;
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
  location,
  selectedLanguageCode,
  selectedLanguageWordsJson,
  englishWordsJson,
  selectedLookupFailed = false,
  englishLookupFailed = false,
}: {
  location: WordStudyLocation;
  selectedLanguageCode: string;
  selectedLanguageWordsJson?: string | null;
  englishWordsJson?: string | null;
  selectedLookupFailed?: boolean;
  englishLookupFailed?: boolean;
}): ContextualMeaningPresentation {
  const selectedCode = normalizeWordLanguageCode(selectedLanguageCode);
  const selectedName = getWordLanguageName(selectedCode);
  const selectedText = getStoredWordTranslation(
    selectedLanguageWordsJson,
    location.wordPosition
  );
  if (selectedText) {
    return {
      text: selectedText,
      languageCode: selectedCode,
      languageName: selectedName,
      direction: getWordLanguageDirection(selectedCode),
      sourceLabel: `${selectedName} · Installed offline`,
      isFallback: false,
      isUnavailable: false,
    };
  }

  const englishText = selectedCode === 'en'
    ? null
    : getStoredWordTranslation(englishWordsJson, location.wordPosition);
  if (englishText) {
    return {
      text: englishText,
      languageCode: 'en',
      languageName: 'English',
      direction: 'ltr',
      sourceLabel: 'English fallback · Installed offline',
      isFallback: true,
      isUnavailable: false,
      fallbackMessage: selectedLookupFailed
        ? `The installed ${selectedName} meaning could not be read. Showing installed English.`
        : `${selectedName} is not available offline for this word. Showing installed English.`,
    };
  }

  return {
    text: 'Meaning unavailable offline',
    languageCode: selectedCode,
    languageName: selectedName,
    direction: getWordLanguageDirection(selectedCode),
    sourceLabel: `${selectedName} word pack required`,
    isFallback: false,
    isUnavailable: true,
    fallbackMessage:
      selectedLookupFailed || englishLookupFailed
        ? 'The installed word-meaning data could not be read. Try reinstalling the language pack.'
        : `Download the ${selectedName} word-by-word pack to use this meaning in the reader and Word Study.`,
  };
}
