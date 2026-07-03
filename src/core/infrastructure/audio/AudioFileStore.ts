import * as FileSystem from 'expo-file-system/legacy';

import type { QdcAudioFile } from './qdcAudio';

function normalizeId(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : 0;
}

function getDocumentDirectory(): string {
  const dir = FileSystem.documentDirectory;
  if (!dir) {
    throw new Error('FileSystem.documentDirectory is unavailable on this platform');
  }
  return dir;
}

function buildAudioFileUri({
  reciterId,
  surahId,
}: {
  reciterId: number;
  surahId: number;
}): { fileUri: string; metadataUri: string; parentDirUri: string } {
  const base = getDocumentDirectory();
  const parentDirUri = `${base}audio/${reciterId}/`;
  const fileUri = `${parentDirUri}${surahId}.mp3`;
  const metadataUri = `${parentDirUri}${surahId}.qdc.json`;
  return { fileUri, metadataUri, parentDirUri };
}

export type AudioFileDownloadProgress = {
  totalBytesWritten: number;
  totalBytesExpectedToWrite: number;
  percent: number | null;
};

export class AudioFileStore {
  private readonly reciterId: number;
  private readonly surahId: number;

  constructor(params: { reciterId: number; surahId: number }) {
    const reciterId = normalizeId(params.reciterId);
    const surahId = normalizeId(params.surahId);
    if (reciterId <= 0) throw new Error('reciterId must be a positive integer');
    if (surahId <= 0) throw new Error('surahId must be a positive integer');
    this.reciterId = reciterId;
    this.surahId = surahId;
  }

  getLocalUri(): string {
    return buildAudioFileUri({ reciterId: this.reciterId, surahId: this.surahId }).fileUri;
  }

  async getAudioFileMetadata(): Promise<QdcAudioFile | null> {
    const { metadataUri } = buildAudioFileUri({ reciterId: this.reciterId, surahId: this.surahId });
    const info = await FileSystem.getInfoAsync(metadataUri);
    if (!info.exists || info.isDirectory) return null;

    const raw = await FileSystem.readAsStringAsync(metadataUri);
    const parsed = JSON.parse(raw) as QdcAudioFile;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.verseTimings) || parsed.verseTimings.length === 0) return null;
    return parsed;
  }

  async saveAudioFileMetadata(audioFile: QdcAudioFile): Promise<void> {
    const { metadataUri, parentDirUri } = buildAudioFileUri({
      reciterId: this.reciterId,
      surahId: this.surahId,
    });
    await FileSystem.makeDirectoryAsync(parentDirUri, { intermediates: true });
    await FileSystem.writeAsStringAsync(metadataUri, JSON.stringify(audioFile));
  }

  async isDownloaded(): Promise<boolean> {
    const uri = this.getLocalUri();
    const info = await FileSystem.getInfoAsync(uri);
    return Boolean(info.exists && !info.isDirectory && info.size > 0);
  }

  async download(
    url: string,
    onProgress?: (progress: AudioFileDownloadProgress) => void,
    signal?: AbortSignal
  ): Promise<string> {
    const resolvedUrl = url.trim();
    if (!resolvedUrl) throw new Error('url is required');
    if (signal?.aborted) throw new Error('Download canceled');

    const { fileUri, parentDirUri } = buildAudioFileUri({
      reciterId: this.reciterId,
      surahId: this.surahId,
    });

    await FileSystem.makeDirectoryAsync(parentDirUri, { intermediates: true });

    const downloadResumable = FileSystem.createDownloadResumable(
      resolvedUrl,
      fileUri,
      {},
      (data) => {
        if (!onProgress) return;
        const expected = data.totalBytesExpectedToWrite;
        const percent =
          expected > 0
            ? Math.max(0, Math.min(100, (data.totalBytesWritten / expected) * 100))
            : null;
        onProgress({
          totalBytesWritten: data.totalBytesWritten,
          totalBytesExpectedToWrite: data.totalBytesExpectedToWrite,
          percent,
        });
      }
    );

    const cancelDownload = (): void => {
      void downloadResumable.cancelAsync().catch(() => undefined);
    };

    signal?.addEventListener('abort', cancelDownload, { once: true });

    try {
      const result = await downloadResumable.downloadAsync();
      if (!result?.uri) {
        throw new Error('Download failed');
      }
      return result.uri;
    } finally {
      signal?.removeEventListener('abort', cancelDownload);
    }
  }

  async delete(): Promise<void> {
    const { fileUri, metadataUri } = buildAudioFileUri({
      reciterId: this.reciterId,
      surahId: this.surahId,
    });
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
    await FileSystem.deleteAsync(metadataUri, { idempotent: true });
  }
}
