export type ReaderStudySheetTab = 'word' | 'translation';

export const READER_STUDY_SHEET_TAB_STORAGE_KEY = 'quranApp:readerStudySheet:tab:v1';

export type VerseTranslationItem = {
  resourceId: number;
  resourceName: string;
  text: string;
};

type RawVerseTranslation = {
  resource_id: number;
  resource_name?: string;
  text: string;
};

export function parseReaderStudySheetTab(value: string | null): ReaderStudySheetTab {
  return value === 'translation' ? 'translation' : 'word';
}

/** Translation markup, with footnote markers dropped rather than left as stray digits. */
export function stripTranslationMarkup(input: string): string {
  return input
    .replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Orders a verse's translations as the reader selected them and names every one, so the sheet
 * never shows translated text without its translator.
 */
export function buildVerseTranslationItems(
  translations: readonly RawVerseTranslation[] | undefined,
  translationIds: readonly number[],
  namesById: ReadonlyMap<number, { name: string }>
): VerseTranslationItem[] {
  const incoming = translations ?? [];
  if (incoming.length === 0) return [];

  const byResourceId = new Map(incoming.map((translation) => [translation.resource_id, translation]));
  const selected = translationIds
    .map((id) => byResourceId.get(id))
    .filter((translation): translation is RawVerseTranslation => Boolean(translation));
  const ordered = selected.length > 0 ? selected : incoming;

  return ordered
    .map((translation) => {
      const text = stripTranslationMarkup(translation.text ?? '');
      if (!text) return null;
      const resourceName =
        namesById.get(translation.resource_id)?.name?.trim() ||
        translation.resource_name?.trim() ||
        `Translation ${translation.resource_id}`;
      return { resourceId: translation.resource_id, resourceName, text };
    })
    .filter((item): item is VerseTranslationItem => item !== null);
}
