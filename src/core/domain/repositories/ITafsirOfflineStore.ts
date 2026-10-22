export interface OfflineTafsirRowInput {
  tafsirId: number;
  verseKey: string;
  html: string;
}

export interface ITafsirOfflineStore {
  upsertRows(rows: OfflineTafsirRowInput[]): Promise<void>;
  deleteTafsir(tafsirId: number): Promise<void>;
}
