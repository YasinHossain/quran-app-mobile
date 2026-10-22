/**
 * Static attribution for sources that ship with, or are downloaded by, the app.
 *
 * Keep entries aligned with `assets/fonts/LICENSES.md` and the pack compilers in
 * `scripts/` (word study, grammar, and dictionary manifests). Translation, tafsir,
 * and reciter credits come from their resource lists at runtime.
 */
export type CreditEntry = {
  id: string;
  title: string;
  credit: string;
  usage?: string;
  license?: string;
  url?: string;
};

export const CONTENT_PROVIDER_CREDITS: readonly CreditEntry[] = [
  {
    id: 'quran-foundation',
    title: 'Quran Foundation · Quran.com',
    credit: 'Quran.com Content APIs and CDN, operated by Quran Foundation.',
    usage:
      'Quran text, verse and word data, mushaf page layouts, translations, tafsir, word-by-word meanings, recitation audio, and the Imlaei text used for offline Arabic search.',
    url: 'https://quran.foundation',
  },
  {
    id: 'quran-com-open-source',
    title: 'Quran.com open-source web app',
    credit: 'Quran.com frontend, developed in the open by Quran Foundation and its contributors.',
    usage: 'Mushaf page font-size and line-width scales, centred surah-ending lines, and word-position conventions.',
    url: 'https://github.com/quran/quran.com-frontend-next',
  },
  {
    id: 'kfgqpc',
    title: 'King Fahd Glorious Quran Printing Complex',
    credit: 'KFGQPC Uthmanic Hafs and Uthman Taha typefaces, and the QCF per-page mushaf glyph fonts.',
    usage: 'Uthmani script and Madani mushaf rendering.',
    license: 'KFGQPC Electronic End-User License Agreement',
    url: 'https://fonts.qurancomplex.gov.sa/',
  },
];

export const ARABIC_FONT_CREDITS: readonly CreditEntry[] = [
  {
    id: 'indopak-nastaleeq',
    title: 'IndoPak Nastaleeq Waqf Lazim',
    credit: 'Authored by QuranWBW; distributed through Quran.com.',
    url: 'https://github.com/quran/quran.com-frontend-next',
  },
  {
    id: 'noorehidayat',
    title: 'Noor-e-Hira, Noor-e-Huda, Noor-e-Hidayat',
    credit: 'NooreHidayat.',
    license: 'NooreHidayat End User License Agreement',
    url: 'http://www.noorehidayat.org/',
  },
  {
    id: 'me-quran',
    title: 'me_quran',
    credit: 'Typeface and data © 2005 Meor Ridzuan.',
  },
  {
    id: 'amiri',
    title: 'Amiri Quran',
    credit: 'Amiri Font Project.',
    license: 'SIL Open Font License 1.1',
    url: 'http://www.amirifont.org',
  },
  {
    id: 'sil-arabic',
    title: 'Scheherazade New, Lateef',
    credit: 'SIL International.',
    license: 'SIL Open Font License 1.1',
    url: 'https://software.sil.org/scheherazade',
  },
  {
    id: 'noto-naskh',
    title: 'Noto Naskh Arabic',
    credit: 'Google Noto Fonts.',
    license: 'SIL Open Font License 1.1',
    url: 'https://fonts.google.com/noto',
  },
];

export const WORD_BY_WORD_CREDITS: readonly CreditEntry[] = [
  {
    id: 'quran-com-wbw',
    title: 'Quran.com word-by-word',
    credit: 'Word-by-word translations from the Quran.com Content API, Quran Foundation.',
    usage: 'Contextual word meanings in each downloadable word-by-word language, also shown in Word Study.',
    url: 'https://quran.com',
  },
];

export const WORD_STUDY_CREDITS: readonly CreditEntry[] = [
  {
    id: 'qac-morphology',
    title: 'Quranic Arabic Corpus',
    credit: 'Quranic Arabic Corpus (version 0.4), Copyright © 2011 Kais Dukes.',
    usage: 'Morphology, segmentation, part of speech, lemma, root, and occurrence indexes in Word Study Essentials.',
    license: 'GNU GPL with Quranic Arabic Corpus content terms',
    url: 'https://corpus.quran.com',
  },
  {
    id: 'qac-irab',
    title: "Quranic Arabic Corpus Arabic i'rab",
    credit: 'Arabic i‘rab prose packaged by the zeeyado/quran-ebook grammar-dictionary project.',
    usage: 'Arabic grammar pack.',
    url: 'https://github.com/zeeyado/quran-ebook/releases',
  },
  {
    id: 'lane-lexicon',
    title: "Lane's Arabic-English Lexicon",
    credit: 'E. W. Lane; digital database published by GibreelAbdullah/LaneLexicon.',
    usage: 'Optional dictionary pack.',
    url: 'https://github.com/GibreelAbdullah/LaneLexicon',
  },
  {
    id: 'hans-wehr',
    title: 'Hans Wehr Dictionary of Modern Written Arabic',
    credit: 'Hans Wehr, edited by J. Milton Cowan; digital database published by GibreelAbdullah/HansWehrDictionary.',
    usage: 'Optional dictionary pack.',
    url: 'https://github.com/GibreelAbdullah/HansWehrDictionary',
  },
];
