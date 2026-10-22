export type TranslationPackInstallPhase = 'manifest' | 'payload' | 'import';

export interface TranslationPackAvailability {
  translationId: number;
  name: string;
  authorName: string;
  languageName: string;
  version: string;
  sizeBytes: number;
  totalVerses?: number | undefined;
}

export interface TranslationPackInstallProgress {
  phase: TranslationPackInstallPhase;
  percent: number;
  activeFile: string;
}

export interface ITranslationPackRepository {
  getPackAvailability(translationId: number): Promise<TranslationPackAvailability | null>;
  installPack(params: {
    translationId: number;
    onProgress?: ((progress: TranslationPackInstallProgress) => void) | undefined;
    assertNotCanceled?: (() => void) | undefined;
  }): Promise<boolean>;
}
