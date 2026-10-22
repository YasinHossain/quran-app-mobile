export const VERB_REFERENCE_PACK_FORMAT = 'quran-verb-reference-sqlite-v1';
export const VERB_REFERENCE_PACK_SCHEMA_VERSION = 1;
export const VERB_REFERENCE_PACK_APPLICATION_ID = 1448231473;

export interface VerbReferencePackManifest {
  readonly format: string;
  readonly compilerVersion: string;
  readonly schemaVersion: number;
  readonly databaseFile: string;
  readonly databaseSizeBytes: number;
  readonly databaseChecksumSha256: string;
  readonly logicalChecksumSha256: string;
  readonly rowCount: number;
  readonly source: {
    readonly sourceId: string;
    readonly title: string;
    readonly version: string;
    readonly license: string;
    readonly attribution: string;
    readonly url: string;
    readonly checksumSha256: string;
  };
}

export interface VerbReferencePackCatalogEntry {
  readonly packId: string;
  readonly version: string;
  readonly sourceId: string;
  readonly title: string;
  readonly manifestUrl: string;
  readonly databaseUrl: string;
  readonly databaseSizeBytes: number;
  readonly databaseChecksumSha256: string;
  readonly schemaVersion: number;
}

export interface VerbReferencePackCatalog {
  readonly format: 'quran-verb-reference-catalog-v1';
  readonly packs: readonly VerbReferencePackCatalogEntry[];
}

export interface VerbReferenceInstalledPackRef {
  readonly packId: string;
  readonly version: string;
  readonly manifest: VerbReferencePackManifest;
}

export interface VerbReferencePackRegistry {
  readonly format: 'quran-verb-reference-registry-v1';
  readonly active?: VerbReferenceInstalledPackRef;
}

export interface ReadyVerbReferencePack extends VerbReferenceInstalledPackRef {
  readonly databaseDirectoryUri: string;
  readonly databaseUri: string;
}

export function assertCompatibleVerbReferenceManifest(
  manifest: VerbReferencePackManifest
): VerbReferencePackManifest {
  if (manifest.format !== VERB_REFERENCE_PACK_FORMAT) {
    throw new Error(`Unsupported verb-reference format: ${manifest.format}`);
  }
  if (manifest.schemaVersion !== VERB_REFERENCE_PACK_SCHEMA_VERSION) {
    throw new Error(`Unsupported verb-reference schema: ${manifest.schemaVersion}`);
  }
  if (!manifest.databaseFile.trim() || manifest.databaseFile.includes('/')) {
    throw new Error('Verb-reference databaseFile must be a file name');
  }
  if (!Number.isInteger(manifest.databaseSizeBytes) || manifest.databaseSizeBytes < 1) {
    throw new Error('Verb-reference databaseSizeBytes must be a positive integer');
  }
  if (!/^[a-f0-9]{64}$/i.test(manifest.databaseChecksumSha256)) {
    throw new Error('Verb-reference database checksum is invalid');
  }
  if (!Number.isInteger(manifest.rowCount) || manifest.rowCount < 1) {
    throw new Error('Verb-reference rowCount must be a positive integer');
  }
  return manifest;
}
