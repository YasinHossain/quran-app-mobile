export type VerseTranslationShareItem = {
  text: string;
  resourceName?: string;
  resourceId?: number;
};

export type FormatVerseTextParams = {
  surahName?: string;
  verseKey: string;
  arabicText: string;
  translationTexts?: string[];
  translationItems?: VerseTranslationShareItem[];
  translationsById?: Map<number, { name: string }>;
};

function stripHtml(input: string): string {
  return input.replace(/<[^>]+>/g, '').trim();
}

/**
 * Formats a verse with its Arabic text and all active translations
 * with translator attribution for copying to clipboard or sharing.
 */
export function formatVerseText({
  surahName,
  verseKey,
  arabicText,
  translationTexts,
  translationItems,
  translationsById,
}: FormatVerseTextParams): string {
  const trimmedVerseKey = verseKey.trim();
  const trimmedArabicText = arabicText.trim();
  const trimmedSurahName = surahName?.trim();

  const header = trimmedSurahName ? `${trimmedSurahName} ${trimmedVerseKey}` : trimmedVerseKey;
  const lines: string[] = [header];

  if (trimmedArabicText) {
    lines.push('', trimmedArabicText);
  }

  // Resolve translations
  const items: Array<{ text: string; resourceName?: string }> = [];

  if (translationItems && translationItems.length > 0) {
    for (const item of translationItems) {
      const cleanText = stripHtml(item.text ?? '');
      if (!cleanText) continue;
      const resourceName =
        item.resourceName?.trim() ||
        (typeof item.resourceId === 'number' && translationsById?.get(item.resourceId)?.name?.trim()) ||
        undefined;
      items.push({ text: cleanText, resourceName });
    }
  } else if (translationTexts && translationTexts.length > 0) {
    for (const t of translationTexts) {
      const cleanText = stripHtml(t ?? '');
      if (cleanText) {
        items.push({ text: cleanText });
      }
    }
  }

  if (items.length > 0) {
    lines.push('');
    items.forEach((item, index) => {
      if (index > 0) {
        lines.push('');
      }
      if (item.resourceName) {
        lines.push(`${item.resourceName}:`);
      }
      lines.push(item.text);
    });
  }

  return lines.join('\n');
}
