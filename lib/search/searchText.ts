/**
 * Search text normalization shared by the offline index, query parsing, ranking, and
 * highlighting. Index text and queries must go through the same functions, so changing
 * any rule here requires bumping `SEARCH_INDEX_TEXT_VERSION` to rebuild stored indexes.
 *
 * These helpers only produce match keys. Displayed Quran text and translations are
 * never rewritten.
 */

import { normalizeNumeralsToAscii } from './numerals';
import { getSearchSynonyms } from './searchSynonyms';

/** Bump when tokenization or normalization output changes. */
export const SEARCH_INDEX_TEXT_VERSION = 1;

const ARABIC_SCRIPT_PATTERN = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

// Harakat, Quranic annotation and pause marks, small high letters, the dagger alef, and
// tatweel. Uthmani and Imlaei texts differ mostly in these, and users rarely type them.
const ARABIC_MARKS_PATTERN = /[ؐ-ًؚ-ٰٟۖ-ۭ࣓-ࣿـ]/g;

const HEBREW_MARKS_PATTERN = /[֑-ׇ]/g;
const LATIN_COMBINING_MARKS_PATTERN = /[̀-ͯ]/g;
const INVISIBLE_JOINERS_PATTERN = /[­​-‏⁠﻿]/g;

// Han and Kana are written without spaces, so each character becomes its own token and
// phrase ranking restores adjacency.
const IDEOGRAPHIC_PATTERN = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/;
const IDEOGRAPHIC_GLOBAL_PATTERN = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/g;

const TOKEN_SEPARATOR_PATTERN = /[^\p{L}\p{N}\p{M}]+/u;
const NUMERIC_TOKEN_PATTERN = /^\p{N}+$/u;

// Clitic prefixes stripped for the low-weight Arabic "light" match form, longest first.
const ARABIC_ARTICLE_PREFIXES = ['وال', 'فال', 'بال', 'كال', 'ولل', 'فلل'] as const;

function normalizeArabicLetters(text: string): string {
  return text
    .replace(/[آأإٱٲٳٵ]/g, 'ا')
    .replace(/[ىیئ]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/[ةۃہھ]/g, 'ه')
    .replace(/ک/g, 'ك');
}

export function isArabicScriptToken(token: string): boolean {
  return ARABIC_SCRIPT_PATTERN.test(token);
}

export function isIdeographicToken(token: string): boolean {
  return IDEOGRAPHIC_PATTERN.test(token);
}

/**
 * Splits text into normalized match tokens: case-folded, Latin and Arabic diacritics
 * removed, Arabic letter variants unified, localized digits folded, and standalone
 * numbers dropped (translation packs use them as inline footnote markers).
 */
export function tokenizeSearchText(input: string): string[] {
  if (!input) return [];

  const text = normalizeArabicLetters(
    normalizeNumeralsToAscii(input)
      .normalize('NFKD')
      .replace(LATIN_COMBINING_MARKS_PATTERN, '')
      .replace(ARABIC_MARKS_PATTERN, '')
      .replace(HEBREW_MARKS_PATTERN, '')
      .normalize('NFC')
  )
    .toLowerCase()
    .replace(INVISIBLE_JOINERS_PATTERN, '')
    .replace(IDEOGRAPHIC_GLOBAL_PATTERN, ' $& ');

  return text
    .split(TOKEN_SEPARATOR_PATTERN)
    .filter((token) => token.length > 0 && !NUMERIC_TOKEN_PATTERN.test(token));
}

/**
 * Arabic match form that tolerates clitics and spelling differences: strips a leading
 * article or conjunction, then removes alefs so Uthmani and Imlaei spellings such as
 * العلمين / العالمين meet. Non-Arabic tokens are returned unchanged.
 */
const lightFormCache = new Map<string, string>();
const LIGHT_FORM_CACHE_LIMIT = 20_000;

export function toArabicLightForm(token: string): string {
  if (!isArabicScriptToken(token)) return token;

  const cached = lightFormCache.get(token);
  if (cached !== undefined) return cached;

  const lightForm = computeArabicLightForm(token);
  if (lightFormCache.size >= LIGHT_FORM_CACHE_LIMIT) lightFormCache.clear();
  lightFormCache.set(token, lightForm);
  return lightForm;
}

function computeArabicLightForm(token: string): string {
  let stem = token;
  const article = ARABIC_ARTICLE_PREFIXES.find(
    (prefix) => stem.startsWith(prefix) && stem.length - prefix.length >= 2
  );
  if (article) {
    stem = stem.slice(article.length);
  } else if (stem.startsWith('لل') && stem.length >= 4) {
    stem = stem.slice(2);
  } else if (stem.startsWith('ال') && stem.length >= 4) {
    stem = stem.slice(2);
  } else if ((stem.startsWith('و') || stem.startsWith('ف')) && stem.length >= 4) {
    stem = stem.slice(1);
  }

  const withoutAlef = stem.replace(/ا/g, '');
  return withoutAlef.length > 0 ? withoutAlef : stem;
}

export function canPrefixMatch(token: string): boolean {
  return Array.from(token).length >= 3 && !isIdeographicToken(token);
}

const LATIN_TOKEN_PATTERN = /^[a-zß-ɏ]+$/;

// Endings that keep an English word's meaning (prophet → prophets, believe → believers).
// Other extensions usually form a different word (light → lighten, lightning).
const LATIN_INFLECTION_SUFFIXES = new Set([
  's', 'es', 'd', 'ed', 'r', 'er', 'rs', 'ers', 'st', 'est', 'ing', 'ings', 'ly', 'ness', 'ful',
]);

/** Strength of a synonym match: below the word itself and its inflections. */
export const SYNONYM_MATCH_STRENGTH = 0.85;

/**
 * How strongly a normalized text token satisfies a normalized query token:
 * 1 exact; 0.9 English inflection; 0.85 synonym or same Arabic light form; 0.8 prefix in
 * other scripts; 0.65 Arabic light prefix; 0.6 other Latin prefix; 0 none.
 */
export function getTokenMatchStrength(queryToken: string, textToken: string): number {
  if (textToken === queryToken) return 1;

  if (isArabicScriptToken(queryToken)) {
    const queryLight = toArabicLightForm(queryToken);
    const textLight = toArabicLightForm(textToken);
    if (textLight === queryLight) return 0.85;
    if (canPrefixMatch(queryToken) && textToken.startsWith(queryToken)) return 0.8;
    if (Array.from(queryLight).length >= 2 && textLight.startsWith(queryLight)) return 0.65;
    return 0;
  }

  if (canPrefixMatch(queryToken) && textToken.startsWith(queryToken)) {
    if (!LATIN_TOKEN_PATTERN.test(queryToken)) return 0.8;
    return LATIN_INFLECTION_SUFFIXES.has(textToken.slice(queryToken.length)) ? 0.9 : 0.6;
  }
  if (getSearchSynonyms(queryToken).has(textToken)) return SYNONYM_MATCH_STRENGTH;
  return 0;
}

function quoteFtsTerm(token: string, prefix: boolean): string {
  return `"${token.replace(/"/g, '""')}"${prefix ? '*' : ''}`;
}

/**
 * Builds an FTS5 MATCH expression from normalized tokens, expanding each one with its
 * synonyms. Every term is quoted, so user input can never inject FTS operators.
 */
export function buildFtsMatchExpression(tokens: readonly string[], mode: 'all' | 'any'): string {
  return tokens
    .map((token) => {
      const term = quoteFtsTerm(token, canPrefixMatch(token));
      const synonyms = [...getSearchSynonyms(token)].map((synonym) => quoteFtsTerm(synonym, false));
      return synonyms.length > 0 ? `(${[term, ...synonyms].join(' OR ')})` : term;
    })
    .join(mode === 'all' ? ' AND ' : ' OR ');
}

/** Arabic index query: the Imlaei column with prefixes, or the light column. */
export function buildArabicFtsMatchExpression(
  tokens: readonly string[],
  mode: 'all' | 'any'
): string {
  const joiner = mode === 'all' ? ' AND ' : ' OR ';
  const surface = tokens.map((token) => quoteFtsTerm(token, canPrefixMatch(token))).join(joiner);
  const light = tokens
    .map((token) => {
      const lightForm = toArabicLightForm(token);
      return quoteFtsTerm(lightForm, Array.from(lightForm).length >= 2);
    })
    .join(joiner);
  return `imlaei : (${surface}) OR light : (${light})`;
}

/**
 * Arabic index columns built from the Imlaei text. Uthmani-script queries still match
 * through the light form, which drops the alefs where the two spellings differ.
 */
export function buildArabicIndexColumns(imlaei: string): { imlaei: string; light: string } {
  const imlaeiTokens = tokenizeSearchText(imlaei);
  return {
    imlaei: imlaeiTokens.join(' '),
    light: imlaeiTokens.map(toArabicLightForm).join(' '),
  };
}

// Escapes only what the `<em>` renderer would misread: tag openers and text that looks
// like an entity. Plain "&" stays literal so share and copy text needs no decoding.
function escapeHtml(text: string): string {
  return text.replace(/&(?=#?[a-z0-9]+;)/gi, '&amp;').replace(/</g, '&lt;');
}

/**
 * Wraps each displayed word that matches a query token in `<em>`, using the same match
 * rules as the index so highlights agree with why a verse was returned.
 */
export function highlightSearchMatches(text: string, queryTokens: readonly string[]): string {
  if (!text) return '';
  if (queryTokens.length === 0) return escapeHtml(text);

  const highlightSegment = (segment: string): string => {
    const wordTokens = tokenizeSearchText(segment);
    const isMatch = wordTokens.some((wordToken) =>
      queryTokens.some((queryToken) => getTokenMatchStrength(queryToken, wordToken) > 0)
    );
    return isMatch ? `<em>${escapeHtml(segment)}</em>` : escapeHtml(segment);
  };

  return text
    .split(/(\s+)/)
    .map((segment) => {
      if (!segment || /^\s+$/.test(segment)) return segment;
      if (!IDEOGRAPHIC_PATTERN.test(segment)) return highlightSegment(segment);
      // Space-free scripts: highlight individual characters instead of the whole run.
      return Array.from(segment)
        .map((char) => (IDEOGRAPHIC_PATTERN.test(char) ? highlightSegment(char) : escapeHtml(char)))
        .join('');
    })
    .join('');
}
