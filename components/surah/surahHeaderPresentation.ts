export type SurahHeaderData = {
  id: number;
  name_simple: string;
  verses_count: number;
  revelation_place: string;
};

export type SurahHeaderPresentation = {
  infoLabel: string;
  isMakkah: boolean;
  revelationPlaceLabel: string;
  showBismillah: boolean;
  surahName: string;
};

export function getSurahHeaderPresentation(
  chapter: SurahHeaderData,
  t: (key: string, values?: any) => string
): SurahHeaderPresentation {
  const isMakkah = chapter.revelation_place.toLowerCase() === 'makkah';
  const revelationPlaceLabel = isMakkah
    ? t('revelation_place_makkah', { fallback: 'Mecca' })
    : t('revelation_place_madinah', { fallback: 'Medina' });
  const verseCountLabel = t(
    chapter.verses_count === 1
      ? 'surah_intro_verse_count_single'
      : 'surah_intro_verse_count_plural',
    { count: chapter.verses_count, fallback: `${chapter.verses_count} ${chapter.verses_count === 1 ? 'Verse' : 'Verses'}` }
  );

  return {
    infoLabel: `${verseCountLabel} • ${revelationPlaceLabel}`,
    isMakkah,
    revelationPlaceLabel,
    showBismillah: chapter.id !== 9 && chapter.id !== 1,
    surahName: t('surah_names.' + chapter.id, { fallback: chapter.name_simple }),
  };
}

export type SurahIntro = {
  /** Omitted when the UI already shows the Surah name in Arabic. */
  arabicName?: string;
  chapterId: number;
  infoLabel: string;
  isMakkah: boolean;
  showBismillah: boolean;
  surahName: string;
};

/** The header shown where a Surah begins, in both the native and Mushaf readers. */
export function getSurahIntro(
  chapter: SurahHeaderData & { name_arabic?: string },
  t: (key: string, values?: any) => string
): SurahIntro {
  const presentation = getSurahHeaderPresentation(chapter, t);
  const arabicName = chapter.name_arabic?.trim();
  return {
    ...(arabicName && arabicName !== presentation.surahName.trim() ? { arabicName } : {}),
    chapterId: chapter.id,
    infoLabel: presentation.infoLabel,
    isMakkah: presentation.isMakkah,
    showBismillah: presentation.showBismillah,
    surahName: presentation.surahName,
  };
}
