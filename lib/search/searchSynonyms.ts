/**
 * Search synonyms: names and Islamic terms that translations spell or translate
 * differently, so `musa` finds "Moses" and `disbelievers` finds "unbelievers".
 *
 * Every word in a group finds every other word in it. Groups only join words that refer
 * to the same person, place, or term; words that merely overlap in meaning stay apart
 * (Iblis is not grouped with Satan, and "garden" is not grouped with Jannah). Expansion
 * happens at query time, so this list can change without rebuilding the index.
 *
 * Entries are already normalized search tokens: lowercase, no diacritics, no spaces or
 * apostrophes. The offline search tests check this.
 */

export const SEARCH_SYNONYM_GROUPS: readonly (readonly string[])[] = [
  // God
  ['allah', 'god'],

  // Prophets and people named in the Quran
  ['nuh', 'nooh', 'noah'],
  ['ibrahim', 'ibraheem', 'abraham'],
  ['ismail', 'ismael', 'ismaeel', 'ishmael'],
  ['ishaq', 'ishaaq', 'isaac'],
  ['yaqub', 'yaqoob', 'yakub', 'jacob'],
  ['yusuf', 'yousuf', 'yusef', 'joseph'],
  ['musa', 'moosa', 'moses'],
  ['harun', 'haroon', 'haroun', 'aaron'],
  ['dawud', 'dawood', 'dawoud', 'daud', 'david'],
  ['sulaiman', 'sulayman', 'suleiman', 'sulaimaan', 'solomon'],
  ['ayyub', 'ayub', 'ayoub', 'job'],
  ['yunus', 'younus', 'yunis', 'jonah', 'jonas'],
  ['zakariya', 'zakariyya', 'zakaria', 'zakariyyah', 'zechariah', 'zachariah', 'zacharias'],
  ['yahya', 'yahia', 'john'],
  ['isa', 'eesa', 'jesus'],
  ['maryam', 'mariam', 'mary'],
  ['ilyas', 'ilias', 'elias', 'elijah'],
  ['alyasa', 'elisha'],
  ['idris', 'idrees'],
  ['salih', 'saleh', 'saalih'],
  ['shuaib', 'shuayb', 'shoaib'],
  ['lut', 'loot', 'lout', 'lot'],
  ['luqman', 'lukman', 'loqman'],
  ['muhammad', 'muhammed', 'mohammad', 'mohammed', 'mohamed'],
  ['firaun', 'firawn', 'firon', 'pharaoh'],
  ['qarun', 'qaroon', 'korah'],
  ['talut', 'taloot', 'saul'],
  ['jalut', 'jaloot', 'goliath'],
  ['uzair', 'uzayr', 'ezra'],

  // Angels, jinn, and devils
  ['jibril', 'jibreel', 'jibrail', 'gabriel'],
  ['mikail', 'mikal', 'mikael', 'michael'],
  ['malaikah', 'malaika', 'malaaika', 'angel', 'angels'],
  ['jinn', 'jinns', 'jinni', 'djinn', 'djinns'],
  ['iblis', 'iblees', 'eblis'],
  ['shaytan', 'shaitan', 'shaytaan', 'shaitaan', 'satan'],
  ['shayatin', 'shayateen', 'shayaatin', 'devils'],

  // Scriptures
  ['quran', 'quraan', 'koran'],
  ['tawrah', 'tawrat', 'taurat', 'torah'],
  ['injil', 'injeel', 'gospel'],
  ['zabur', 'zaboor', 'psalms'],

  // Places (Bakkah and Yathrib are the Quran's other names for Makkah and Madinah)
  ['makkah', 'makka', 'mecca', 'bakkah', 'becca'],
  ['madinah', 'madina', 'medina', 'yathrib'],
  ['misr', 'egypt'],

  // Messengers and prophets ("apostle" is the older translators' word for messenger)
  ['rasul', 'rasool', 'rusul', 'messenger', 'messengers', 'apostle', 'apostles'],
  ['nabi', 'nabiy', 'anbiya', 'prophet', 'prophets'],

  // People described in the Quran
  ['mumin', 'muminun', 'muminin', 'mumineen', 'believer', 'believers'],
  ['kafir', 'kafirun', 'kafireen', 'kuffar', 'disbeliever', 'disbelievers', 'unbeliever', 'unbelievers'],
  ['munafiq', 'munafiqun', 'munafiqin', 'munafiqeen', 'hypocrite', 'hypocrites'],
  [
    'mushrik', 'mushrikun', 'mushrikin', 'mushrikeen',
    'polytheist', 'polytheists', 'idolater', 'idolaters', 'idolator', 'idolators',
  ],

  // Worship
  ['salah', 'salat', 'salaah', 'salaat', 'namaz', 'prayer', 'prayers'],
  ['zakah', 'zakat', 'zakaah', 'zakaat', 'alms', 'almsgiving'],
  ['sadaqah', 'sadaqa', 'sadaqat', 'charity'],
  ['sawm', 'saum', 'siyam', 'siyaam', 'fasting'],
  ['hajj', 'haj', 'pilgrimage'],
  ['umrah', 'umra'],
  ['ramadan', 'ramadhan', 'ramazan'],
  ['wudu', 'wudhu', 'ablution'],
  ['sajdah', 'sajda', 'prostration'],
  ['qiblah', 'qibla', 'kiblah'],
  ['dua', 'duaa', 'supplication'],

  // Belief and the hereafter
  ['tawhid', 'tawheed', 'monotheism'],
  ['shirk', 'polytheism', 'idolatry'],
  ['iman', 'eman', 'eeman', 'faith'],
  ['sabr', 'patience'],
  ['tawbah', 'tawba', 'taubah', 'repentance'],
  ['salam', 'salaam', 'peace'],
  ['jannah', 'jannat', 'paradise'],
  ['jahannam', 'jahannum', 'jahanam', 'gehenna', 'hell'],
  ['akhirah', 'akhira', 'aakhirah', 'hereafter'],
  ['qiyamah', 'qiyama', 'qiyamat', 'resurrection'],

  // Rulings
  ['halal', 'lawful'],
  ['riba', 'usury'],
  ['khamr', 'wine', 'intoxicants'],
];

let synonymsByToken: Map<string, ReadonlySet<string>> | null = null;
const NO_SYNONYMS: ReadonlySet<string> = new Set();

/** Other words in the same synonym groups as `token`, excluding `token` itself. */
export function getSearchSynonyms(token: string): ReadonlySet<string> {
  if (!synonymsByToken) {
    const map = new Map<string, Set<string>>();
    for (const group of SEARCH_SYNONYM_GROUPS) {
      for (const term of group) {
        const others = map.get(term) ?? new Set<string>();
        for (const other of group) if (other !== term) others.add(other);
        map.set(term, others);
      }
    }
    synonymsByToken = map;
  }
  return synonymsByToken.get(token) ?? NO_SYNONYMS;
}
