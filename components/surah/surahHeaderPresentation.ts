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
