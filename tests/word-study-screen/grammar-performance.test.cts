declare function require(id: string): any;
const assert = require('node:assert/strict');
const test = require('node:test') as (name: string, callback: () => void) => void;

import { findSelectedWordGrammarPassages } from '../../components/word-study/full-study/grammarStudyModel';
import type { VerseGrammarAnalysis } from '../../src/core/domain/word-study';

test('grammar reuses phrase alignment across selections and isolates replacement verse data', () => {
  let surfaceReads = 0;
  const words = ['بِسْمِ', 'اللَّهِ'].map((surface, index) => ({
    location: { locationKey: `1:1:${index + 1}`, wordPosition: index + 1 },
    get surfaceUthmani() {
      surfaceReads += 1;
      return surface;
    },
  }));
  const grammar: VerseGrammarAnalysis = {
    verseKey: '1:1',
    passages: [{ sequence: 1, headingArabic: 'بسم الله', bodyArabic: 'تحليل العبارة' }],
    source: { sourceId: 'fixture', sourceVersion: '1', layer: 'grammar' },
    reviewStatus: 'source-provided',
  };
  for (let i = 0; i < 20; i += 1) {
    const selected = words[i % words.length];
    assert.deepEqual(findSelectedWordGrammarPassages(grammar, selected, words), grammar.passages);
  }
  assert.equal(surfaceReads, 2, 'normalize each verse word only once across selections');

  const replacement = [
    { location: words[0].location, surfaceUthmani: 'قُلْ' },
    { location: words[1].location, surfaceUthmani: 'هُوَ' },
  ];
  assert.deepEqual(findSelectedWordGrammarPassages(grammar, replacement[0], replacement), []);
  const replacementGrammar: VerseGrammarAnalysis = {
    ...grammar,
    passages: [{ sequence: 2, headingArabic: 'الله', bodyArabic: 'تحليل الكلمة' }],
  };
  assert.deepEqual(findSelectedWordGrammarPassages(replacementGrammar, words[0], words), []);
  assert.deepEqual(
    findSelectedWordGrammarPassages(replacementGrammar, words[1], words),
    replacementGrammar.passages
  );
});
