import type { NetworkSurahVerse } from './surahTranslationNetworkCache';

export type ReaderTranslationRecovery = {
  surahId: number;
  selectionKey: string;
  translationIds: number[];
  verses: Array<{
    verseKey: string;
    translationItems: Array<{ resourceId: number; text: string }>;
  }>;
};

// Only accept a translation after every addressed verse has usable text. A partial API
// response must not hide the unavailable notice or replace locally available text.
export function buildReaderTranslationRecovery(
  surahId: number,
  selectedIds: number[],
  requestedIds: number[],
  verseCount: number,
  rows: NetworkSurahVerse[]
): ReaderTranslationRecovery {
  const byKey = new Map(rows.map((row) => [row.verse_key, row]));
  const verses = Array.from({ length: verseCount }, (_, index) => {
    const verseKey = `${surahId}:${index + 1}`;
    const row = byKey.get(verseKey);
    return {
      verseKey,
      translationItems: requestedIds.flatMap((id) => {
        const translation = row?.translations?.find((item) => item.resource_id === id);
        const text = translation?.text
          ?.replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&amp;/g, '&')
          .trim();
        return text ? [{ resourceId: id, text }] : [];
      }),
    };
  });
  const translationIds = requestedIds.filter((id) =>
    selectedIds.includes(id) && verses.length > 0 &&
    verses.every((verse) => verse.translationItems.some((item) => item.resourceId === id))
  );
  return {
    surahId,
    selectionKey: selectedIds.join(','),
    translationIds,
    verses: verses.map((verse) => ({
      ...verse,
      translationItems: verse.translationItems.filter((item) => translationIds.includes(item.resourceId)),
    })),
  };
}
