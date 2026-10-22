export type TafsirPackInstallPhase = 'manifest' | 'payload' | 'import';

export interface TafsirPackAvailability {
  tafsirId: number;
  name: string;
  authorName: string;
  languageName: string;
  version: string;
  sizeBytes: number;
  totalVerses?: number | undefined;
}

export interface TafsirPackInstallProgress {
  phase: TafsirPackInstallPhase;
  percent: number;
  activeFile: string;
}

export interface ITafsirPackRepository {
  getPackAvailability(tafsirId: number): Promise<TafsirPackAvailability | null>;
  installPack(params: {
    tafsirId: number;
    onProgress?: ((progress: TafsirPackInstallProgress) => void) | undefined;
    assertNotCanceled?: (() => void) | undefined;
  }): Promise<boolean>;
}
