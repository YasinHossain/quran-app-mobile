export const WORD_STUDY_PACK_FORMAT = 'quran-word-study-sqlite-v1';
export const WORD_STUDY_PACK_SCHEMA_VERSION = 2;
export const WORD_STUDY_PACK_APPLICATION_ID = 1465078867;

export interface WordStudyPackSourceMetadata {
  readonly sourceId: string;
  readonly title: string;
  readonly version: string;
  readonly license: string;
  readonly url: string;
  readonly checksumSha256: string;
  readonly attribution: string;
}

export interface WordStudyPackManifest {
  readonly format: string;
  readonly compilerVersion: string;
  readonly schemaVersion: number;
  readonly databaseFile: string;
  readonly databaseSizeBytes: number;
  readonly databaseChecksumSha256: string;
  readonly logicalChecksumSha256: string;
  readonly sources: readonly WordStudyPackSourceMetadata[];
}

export interface WordStudyPackCatalogEntry {
  readonly packId: string;
  readonly version: string;
  readonly manifestUrl: string;
  readonly databaseUrl: string;
  readonly databaseSizeBytes: number;
  readonly databaseChecksumSha256: string;
  readonly schemaVersion: number;
}

export interface WordStudyPackCatalog {
  readonly format: 'quran-word-study-catalog-v1';
  readonly packs: readonly WordStudyPackCatalogEntry[];
}

export interface WordStudyInstalledPackRef {
  readonly packId: string;
  readonly version: string;
  readonly manifest: WordStudyPackManifest;
}

export interface WordStudyPackActivationState {
  readonly format: 'quran-word-study-activation-v1';
  readonly active: WordStudyInstalledPackRef;
  readonly previous?: WordStudyInstalledPackRef;
}

export interface ReadyWordStudyPack extends WordStudyInstalledPackRef {
  readonly databaseDirectoryUri: string;
  readonly databaseUri: string;
  readonly recovery: 'none' | 'rollback';
}

export function assertCompatibleWordStudyManifest(
  manifest: WordStudyPackManifest
): WordStudyPackManifest {
  if (manifest.format !== WORD_STUDY_PACK_FORMAT) {
    throw new Error(`Unsupported word-study pack format: ${manifest.format}`);
  }
  if (manifest.schemaVersion !== WORD_STUDY_PACK_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported word-study schema ${manifest.schemaVersion}; expected ${WORD_STUDY_PACK_SCHEMA_VERSION}`
    );
  }
  if (!manifest.databaseFile.trim() || manifest.databaseFile.includes('/')) {
    throw new Error('Word-study manifest databaseFile must be a file name');
  }
  if (!Number.isInteger(manifest.databaseSizeBytes) || manifest.databaseSizeBytes < 1) {
    throw new Error('Word-study manifest databaseSizeBytes must be a positive integer');
  }
  if (!/^[a-f0-9]{64}$/i.test(manifest.databaseChecksumSha256)) {
    throw new Error('Word-study manifest databaseChecksumSha256 is invalid');
  }
  if (!/^[a-f0-9]{64}$/i.test(manifest.logicalChecksumSha256)) {
    throw new Error('Word-study manifest logicalChecksumSha256 is invalid');
  }
  return manifest;
}
