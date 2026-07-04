export type WordTranslationPackInstallPhase = 'manifest' | 'payload' | 'import';

export interface WordTranslationPackInstallProgress {
  phase: WordTranslationPackInstallPhase;
  percent: number;
  activeFile: string;
}

export interface IWordTranslationPackRepository {
  installPack(params: {
    languageCode: string;
    onProgress?: ((progress: WordTranslationPackInstallProgress) => void) | undefined;
    assertNotCanceled?: (() => void) | undefined;
  }): Promise<boolean>;
}
