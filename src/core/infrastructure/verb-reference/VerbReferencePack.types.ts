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
  return manifest;
}
