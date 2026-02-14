import { TranslationOfflineStore, type OfflineVerseWithTranslations } from './TranslationOfflineStore';

export async function seedAndReadTranslationOfflineStoreSampleAsync(): Promise<OfflineVerseWithTranslations[]> {
  const store = new TranslationOfflineStore();

  const sampleTranslationId = 999_001;

  await store.upsertVersesAndTranslations({
    verses: [
      {
        verseKey: '1:1',
        surahId: 1,
        ayahNumber: 1,
        arabicUthmani: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
      },
      {
        verseKey: '1:2',
        surahId: 1,
        ayahNumber: 2,
        arabicUthmani: 'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ',
      },
    ],
    translations: [
      { translationId: sampleTranslationId, verseKey: '1:1', text: 'In the name of Allah, the Entirely Merciful, the Especially Merciful.' },
      { translationId: sampleTranslationId, verseKey: '1:2', text: 'All praise is due to Allah, Lord of the worlds.' },
    ],
  });

  return await store.getSurahVersesWithTranslations(1, [sampleTranslationId]);
}

