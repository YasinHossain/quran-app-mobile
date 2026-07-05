export type SurahHeaderData = {
  id: number;
  name_simple: string;
  verses_count: number;
  revelation_place: string;
};

export type SurahHeaderPresentation = {
  infoLabel: string;
  isMakkah: boolean;
  revelationPlaceLabel: 'Mecca' | 'Medina';
  showBismillah: boolean;
  surahName: string;
};

export function getSurahHeaderPresentation(
  chapter: SurahHeaderData
): SurahHeaderPresentation {
  const isMakkah = chapter.revelation_place.toLowerCase() === 'makkah';
  const revelationPlaceLabel = isMakkah ? 'Mecca' : 'Medina';
  const verseCountLabel = `${chapter.verses_count} ${
    chapter.verses_count === 1 ? 'Verse' : 'Verses'
  }`;

  return {
    infoLabel: `${verseCountLabel} • ${revelationPlaceLabel}`,
    isMakkah,
    revelationPlaceLabel,
    showBismillah: chapter.id !== 9 && chapter.id !== 1,
    surahName: chapter.name_simple,
  };
}
