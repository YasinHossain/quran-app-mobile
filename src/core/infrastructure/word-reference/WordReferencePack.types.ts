export const WORD_REFERENCE_PACK_FORMAT = 'quran-word-reference-sqlite-v1';
export const WORD_REFERENCE_PACK_SCHEMA_VERSION = 1;
export const WORD_REFERENCE_PACK_APPLICATION_ID = 1465078866;

export interface WordReferencePackSource {
  readonly packId: string;
  readonly sourceId: string;
  readonly title: string;
  readonly languageCode: string;
  readonly version: string;
  readonly attribution: string;
  readonly url: string;
  readonly checksumSha256: string;
}

export interface WordReferencePackManifest {
  readonly format: string;
  readonly compilerVersion: string;
  readonly schemaVersion: number;
  readonly databaseFile: string;
  readonly databaseSizeBytes: number;
  readonly databaseChecksumSha256: string;
  readonly logicalChecksumSha256: string;
  readonly entryCount: number;
  readonly matchedRootCount: number;
  readonly matchedLemmaCount: number;
  readonly source: WordReferencePackSource;
}

export interface WordReferencePackCatalogEntry {
  readonly packId: string;
  readonly kind: 'dictionary';
  readonly sourceId: string;
  readonly title: string;
  readonly languageCode: string;
  readonly version: string;
  readonly manifestUrl: string;
  readonly databaseUrl: string;
  readonly databaseSizeBytes: number;
  readonly databaseChecksumSha256: string;
  readonly schemaVersion: number;
}

export interface WordReferencePackCatalog {
  readonly format: 'quran-word-reference-catalog-v1';
  readonly packs: readonly WordReferencePackCatalogEntry[];
}

export interface WordReferenceInstalledPackRef {
  readonly packId: string;
  readonly version: string;
  readonly manifest: WordReferencePackManifest;
}

export interface WordReferencePackSlot {
  readonly active: WordReferenceInstalledPackRef;
  readonly previous?: WordReferenceInstalledPackRef;
}

export interface WordReferencePackRegistry {
  readonly format: 'quran-word-reference-registry-v1';
  readonly packs: Readonly<Record<string, WordReferencePackSlot>>;
}

export interface ReadyWordReferencePack extends WordReferenceInstalledPackRef {
  readonly databaseDirectoryUri: string;
  readonly databaseUri: string;
  readonly recovery: 'none' | 'rollback';
}

export function assertCompatibleWordReferenceManifest(
  manifest: WordReferencePackManifest
): WordReferencePackManifest {
  if (manifest.format !== WORD_REFERENCE_PACK_FORMAT) {
    throw new Error(`Unsupported word-reference format: ${manifest.format}`);
  }
  if (manifest.schemaVersion !== WORD_REFERENCE_PACK_SCHEMA_VERSION) {
    throw new Error(`Unsupported word-reference schema: ${manifest.schemaVersion}`);
  }
  if (!manifest.databaseFile.trim() || manifest.databaseFile.includes('/')) {
    throw new Error('Word-reference databaseFile must be a file name');
  }
  if (!Number.isInteger(manifest.databaseSizeBytes) || manifest.databaseSizeBytes < 1) {
    throw new Error('Word-reference database size is invalid');
  }
  if (!/^[a-f0-9]{64}$/i.test(manifest.databaseChecksumSha256)) {
    throw new Error('Word-reference database checksum is invalid');
  }
  if (!/^[a-f0-9]{64}$/i.test(manifest.logicalChecksumSha256)) {
    throw new Error('Word-reference logical checksum is invalid');
  }
  if (manifest.source.packId.trim().length < 1 || manifest.source.sourceId.trim().length < 1) {
    throw new Error('Word-reference source identity is invalid');
  }
  return manifest;
}
