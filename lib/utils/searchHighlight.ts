/**
 * Search highlighting helpers (mobile)
 *
 * Ported from the web app (`../quran-app/lib/utils/searchRelevance.ts`).
 * Produces HTML-like strings that use `<em>` tags for highlights.
 */

/**
 * Detects if a query is primarily in Arabic script.
 */
export function isArabicQuery(query: string): boolean {
  if (!query.trim()) return false;
  const arabicChars = query.match(/[\u0600-\u06FF]/g) || [];
  const totalChars = query.replace(/\s/g, '').length;
  return totalChars > 0 && arabicChars.length / totalChars > 0.5;
}

function removeArabicDiacritics(text: string): string {
  return text.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '');
}

function normalizeArabicLetters(text: string): string {
  return (
    text
      .replace(/[إأآٱ]/g, 'ا')
      .replace(/[ئؤ]/g, 'ء')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
  );
}

function normalizeText(text: string): string {
  return (
    normalizeArabicLetters(removeArabicDiacritics(text))
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function getQueryWords(query: string): string[] {
  return normalizeText(query)
    .split(' ')
    .filter((word) => word.length > 0);
}

/**
 * Highlight missing query words in the text.
 * The API highlights important words but can skip common ones.
 * This function wraps query words that weren't already highlighted with `<em>`.
 *
 * Works with both Arabic and Latin scripts.
 */
export function highlightMissingQueryWords(highlightedText: string, query: string): string {
  const queryWords = getQueryWords(query);
  if (queryWords.length === 0) return highlightedText;

  const alreadyHighlighted = new Set<string>();
  const emRegex = /<em>([^<]+)<\/em>/gi;
  let match: RegExpExecArray | null;
  while ((match = emRegex.exec(highlightedText)) !== null) {
    normalizeText(match[1]!)
      .split(' ')
      .forEach((w) => alreadyHighlighted.add(w));
  }

  const wordsToHighlight = queryWords.filter(
    (word) => !alreadyHighlighted.has(word) && word.length > 1
  );

  if (wordsToHighlight.length === 0) return highlightedText;

  let result = highlightedText;

  for (const word of wordsToHighlight) {
    const isArabicWord = /[\u0600-\u06FF]/.test(word);

    if (isArabicWord) {
      const chars = word.split('');
      const diacriticPattern = '[\\u064B-\\u065F\\u0670\\u0674-\\u0678\\u06E5-\\u06E8]*';

      const regexPattern = chars
        .map((char) => {
          let charPattern = '';

          if (char === 'ا') charPattern = '[اإأآٱ]';
          else if (char === 'ه') charPattern = '[هة]';
          else if (char === 'ي') charPattern = '[يى]';
          else if (char === 'ء') charPattern = '[ءئؤإأ]';
          else charPattern = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

          return charPattern + diacriticPattern;
        })
        .join('');

      const wordRegex = new RegExp(
        `(^|\\s|>)(${regexPattern})(?=\\s|$|<|[\\u060C\\u061B\\u061F])`,
        'g'
      );
      result = result.replace(wordRegex, '$1<em>$2</em>');
    } else {
      const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const wordRegex = new RegExp(`\\b(${escapedWord})\\b`, 'gi');
      result = result.replace(wordRegex, '<em>$1</em>');
    }
  }

  result = result.replace(/<em>([^<]*)<em>([^<]*)<\/em>([^<]*)<\/em>/g, '<em>$1$2$3</em>');
  result = result.replace(/<em><\/em>/g, '');

  return result;
}

