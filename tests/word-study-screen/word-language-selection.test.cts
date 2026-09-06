declare function require(id: string): any;
const assert = require('node:assert/strict');
const test = require('node:test');

import { resolveContextualMeaning } from '../../components/word-study/full-study/contextualMeaningModel';
import { WORD_STUDY_RICH_CONTRACT_FIXTURES } from '../../src/core/domain/word-study';

test('installing and removing Bangla changes only the contextual meaning at the addressed word', () => {
  const analysis = WORD_STUDY_RICH_CONTRACT_FIXTURES[0];
  const before = JSON.stringify(analysis);
  const position = analysis.location.wordPosition;
  const installed = JSON.stringify([
    { position: position + 1, translationText: 'adjacent word', charTypeName: 'word' },
    { position, translationText: 'এবং তিনি নাযিল করেছেন', charTypeName: 'word' },
  ]);
  const resolve = (words: string | null) => resolveContextualMeaning({
    analysis, selectedLanguageCode: 'bn', selectedLanguageWordsJson: words,
  });
  const missing = resolve(null);
  assert.equal(missing.isFallback, true);
  assert.equal(resolve(installed).text, 'এবং তিনি নাযিল করেছেন');
  assert.equal(resolve(installed).languageCode, 'bn');
  assert.deepEqual(resolve(null), missing);
  assert.equal(JSON.stringify(analysis), before);
  for (const invalid of ['{', '{}', '[]', JSON.stringify([{ position, translationText: ' ', charTypeName: 'word' }])]) {
    assert.equal(resolve(invalid).isFallback, true);
  }
});
