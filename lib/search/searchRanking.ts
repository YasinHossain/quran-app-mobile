/**
 * Relevance scoring shared by offline (FTS5) and online (Quran.com) search results, so
 * both lists order verses the same way. Retrieval engines supply candidates and their
 * own order (bm25 offline, API order online); this scorer re-ranks them on phrase,
 * coverage, and proximity signals.
 */

import { getTokenMatchStrength, isIdeographicToken, tokenizeSearchText } from './searchText';

export type SearchRankInput = {
  /** Normalized tokens of the text that matched. */
  tokens: readonly string[];
  /** Position in the retrieval engine's order, 1 for its best result down to 0. */
  retrievalRank?: number;
  /** Extra points, such as preferring the reader's selected translation. */
  bonus?: number;
  /**
   * How much each query token matters, aligned with the query tokens. Usually inverse
   * document frequency from the index, so "light" outweighs "upon".
   */
  termWeights?: readonly number[];
};

// Without index statistics, short words ("of", "في") count less toward coverage.
function getFallbackTokenWeight(token: string): number {
  return isIdeographicToken(token) || Array.from(token).length > 2 ? 1 : 0.35;
}

function getMinimumWindow(positionLists: number[][]): number {
  const events: Array<{ position: number; list: number }> = [];
  positionLists.forEach((positions, list) => {
    for (const position of positions) events.push({ position, list });
  });
  events.sort((a, b) => a.position - b.position);

  const counts = new Array<number>(positionLists.length).fill(0);
  let covered = 0;
  let best = Number.POSITIVE_INFINITY;
  let start = 0;

  for (const event of events) {
    if (counts[event.list]++ === 0) covered += 1;
    while (covered === positionLists.length) {
      const first = events[start]!;
      best = Math.min(best, event.position - first.position + 1);
      if (--counts[first.list] === 0) covered -= 1;
      start += 1;
    }
  }

  return best;
}

export function scoreSearchMatch(queryTokens: readonly string[], input: SearchRankInput): number {
  const textTokens = input.tokens;
  const queryCount = queryTokens.length;
  const baseScore = 150 * (input.retrievalRank ?? 0) + (input.bonus ?? 0);
  if (queryCount === 0 || textTokens.length === 0) return baseScore;

  const bestStrengths = new Array<number>(queryCount).fill(0);
  const positions: number[][] = queryTokens.map(() => []);
  const strengthAt: number[][] = queryTokens.map(() => new Array<number>(textTokens.length).fill(0));

  textTokens.forEach((textToken, textIndex) => {
    queryTokens.forEach((queryToken, queryIndex) => {
      const strength = getTokenMatchStrength(queryToken, textToken);
      if (strength <= 0) return;
      strengthAt[queryIndex]![textIndex] = strength;
      positions[queryIndex]!.push(textIndex);
      bestStrengths[queryIndex] = Math.max(bestStrengths[queryIndex]!, strength);
    });
  });

  const weights = queryTokens.map(
    (token, index) => input.termWeights?.[index] ?? getFallbackTokenWeight(token)
  );
  // A word is significant when it carries at least half the weight of the query's rarest word.
  const significantWeight = 0.5 * Math.max(...weights);

  let weightTotal = 0;
  let weightedCoverage = 0;
  let missingSignificant = false;
  weights.forEach((weight, index) => {
    weightTotal += weight;
    weightedCoverage += weight * bestStrengths[index]!;
    if (weight >= significantWeight && bestStrengths[index] === 0) missingSignificant = true;
  });

  let score = baseScore + 400 * (weightTotal > 0 ? weightedCoverage / weightTotal : 0);
  if (!missingSignificant) score += 100;

  if (queryCount >= 2) {
    // Longest run of consecutive query tokens found at consecutive text positions.
    let longestRun = 0;
    let longestExactRun = 0;
    let previousRun = new Array<number>(textTokens.length).fill(0);
    let previousExactRun = new Array<number>(textTokens.length).fill(0);
    for (let queryIndex = 0; queryIndex < queryCount; queryIndex += 1) {
      const run = new Array<number>(textTokens.length).fill(0);
      const exactRun = new Array<number>(textTokens.length).fill(0);
      for (let textIndex = 0; textIndex < textTokens.length; textIndex += 1) {
        const strength = strengthAt[queryIndex]![textIndex]!;
        if (strength <= 0) continue;
        run[textIndex] = (textIndex > 0 ? previousRun[textIndex - 1]! : 0) + 1;
        if (strength === 1) {
          exactRun[textIndex] = (textIndex > 0 ? previousExactRun[textIndex - 1]! : 0) + 1;
        }
        longestRun = Math.max(longestRun, run[textIndex]!);
        longestExactRun = Math.max(longestExactRun, exactRun[textIndex]!);
      }
      previousRun = run;
      previousExactRun = exactRun;
    }

    if (longestRun === queryCount) {
      score += 600;
      if (longestExactRun === queryCount) score += 200;
    } else if (longestRun > 1) {
      score += 120 * ((longestRun - 1) / (queryCount - 1));
    }

    const matchedPositions = positions.filter((list) => list.length > 0);
    if (matchedPositions.length >= 2) {
      score += 200 * (matchedPositions.length / getMinimumWindow(matchedPositions));
    }
  }

  const firstMatch = Math.min(...positions.flatMap((list) => (list.length ? [list[0]!] : [textTokens.length])));
  score += 40 * (1 - firstMatch / textTokens.length);

  // Among equally good matches, prefer the shorter verse where the match is the point.
  score += 60 / (1 + textTokens.length / 25);

  return score;
}

/**
 * Re-ranks retrieved items. Earlier items in `items` are treated as the retrieval
 * engine's better results. Ties keep the incoming order.
 */
export function rankSearchResults<T>(
  items: readonly T[],
  query: string,
  getText: (item: T) => string,
  options: { getBonus?: (item: T) => number; termWeights?: readonly number[] } = {}
): T[] {
  const queryTokens = tokenizeSearchText(query);
  if (queryTokens.length === 0 || items.length === 0) return [...items];

  const lastIndex = Math.max(1, items.length - 1);
  return items
    .map((item, index) => ({
      item,
      index,
      score: scoreSearchMatch(queryTokens, {
        tokens: tokenizeSearchText(getText(item)),
        retrievalRank: 1 - index / lastIndex,
        bonus: options.getBonus?.(item) ?? 0,
        termWeights: options.termWeights,
      }),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}
