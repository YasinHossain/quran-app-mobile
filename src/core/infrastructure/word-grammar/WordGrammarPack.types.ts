export const WORD_GRAMMAR_PACK_FORMAT = 'quran-word-grammar-sqlite-v1';
export const WORD_GRAMMAR_PACK_SCHEMA_VERSION = 1;

export interface WordGrammarPackManifest {
  readonly format: string;
  readonly compilerVersion: string;
  readonly schemaVersion: number;
  readonly databaseFile: string;
  readonly databaseSizeBytes: number;
  readonly databaseChecksumSha256: string;
  readonly logicalChecksumSha256: string;
  readonly verseCount: number;
  readonly passageCount: number;
  readonly source: {
    readonly sourceId: string;
    readonly title: string;
    readonly version: string;
    readonly url: string;
    readonly checksumSha256: string;
  };
}

export function assertCompatibleWordGrammarManifest(
  manifest: WordGrammarPackManifest
): WordGrammarPackManifest {
  if (manifest.format !== WORD_GRAMMAR_PACK_FORMAT) {
    throw new Error(`Unsupported word grammar pack format: ${manifest.format}`);
  }
  if (manifest.schemaVersion !== WORD_GRAMMAR_PACK_SCHEMA_VERSION) {
    throw new Error(`Unsupported word grammar schema: ${manifest.schemaVersion}`);
  }
  if (!manifest.databaseFile.trim() || manifest.databaseFile.includes('/')) {
    throw new Error('Word grammar databaseFile must be a file name');
  }
  if (!Number.isInteger(manifest.verseCount) || manifest.verseCount < 1) {
    throw new Error('Word grammar verseCount must be a positive integer');
  }
  return manifest;
}
