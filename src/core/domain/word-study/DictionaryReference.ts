export type DictionaryDefinitionFormat = 'plain-text' | 'sanitized-html';

export type DictionaryMatchKind = 'lemma-exact' | 'root-article' | 'root-family';

export interface DictionarySource {
  readonly packId: string;
  readonly sourceId: string;
  readonly title: string;
  readonly languageCode: string;
  readonly version: string;
  readonly attribution: string;
  readonly url: string;
}

export interface DictionaryLookupQuery {
  readonly packId: string;
  readonly lemmaNormalized?: string;
  readonly rootNormalized?: string;
}

export interface DictionaryEntrySummary {
  readonly entryId: string;
  readonly parentEntryId?: string;
  readonly headwordArabic: string;
  readonly normalizedHeadword: string;
  readonly isRoot: boolean;
  readonly sequence: number;
  readonly matchKind: DictionaryMatchKind;
}

export interface DictionaryEntryDetail extends DictionaryEntrySummary {
  readonly definition: string;
  readonly definitionFormat: DictionaryDefinitionFormat;
}

export interface DictionaryLookupResult {
  readonly source: DictionarySource;
  readonly query: DictionaryLookupQuery;
  readonly exactLemmaEntries: readonly DictionaryEntrySummary[];
  readonly rootEntries: readonly DictionaryEntrySummary[];
  readonly rootFamilyEntries: readonly DictionaryEntrySummary[];
}
