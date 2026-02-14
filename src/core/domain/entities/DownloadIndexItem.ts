export const DOWNLOAD_STATUSES = [
  'queued',
  'downloading',
  'installed',
  'failed',
  'deleting',
] as const;

export type DownloadStatus = (typeof DOWNLOAD_STATUSES)[number];

export type DownloadableContent =
  | { kind: 'translation'; translationId: number }
  | { kind: 'tafsir'; tafsirId: number }
  | { kind: 'tafsir'; scope: 'surah'; surahId: number; tafsirId: number }
  | { kind: 'audio'; reciterId: number; scope: 'surah'; surahId: number }
  | { kind: 'words'; scope: 'surah'; surahId: number };

export type DownloadProgress =
  | { kind: 'percent'; percent: number } // 0..100
  | { kind: 'items'; completed: number; total: number };

export type DownloadKey = string;

export interface DownloadIndexItem {
  content: DownloadableContent;
  status: DownloadStatus;
  progress?: DownloadProgress;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface DownloadIndexItemWithKey extends DownloadIndexItem {
  key: DownloadKey;
}

export type DownloadIndexItemPatch = {
  status?: DownloadStatus;
  progress?: DownloadProgress | null;
  error?: string | null;
};

export function getDownloadKey(content: DownloadableContent): DownloadKey {
  switch (content.kind) {
    case 'translation':
      return `translation:${content.translationId}`;
    case 'tafsir':
      if ('scope' in content && content.scope === 'surah') {
        return `tafsir:${content.tafsirId}:surah:${content.surahId}`;
      }
      return `tafsir:${content.tafsirId}`;
    case 'audio':
      return `audio:${content.reciterId}:${content.scope}:${content.surahId}`;
    case 'words':
      return `words:${content.scope}:${content.surahId}`;
    default: {
      const exhaustiveCheck: never = content;
      return String(exhaustiveCheck);
    }
  }
}

export function isDownloadStatus(value: unknown): value is DownloadStatus {
  return typeof value === 'string' && (DOWNLOAD_STATUSES as readonly string[]).includes(value);
}

export function isDownloadableContent(value: unknown): value is DownloadableContent {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DownloadableContent> & { kind?: unknown };

  if (candidate.kind === 'translation') {
    return (
      typeof (candidate as { translationId?: unknown }).translationId === 'number' &&
      Number.isFinite((candidate as { translationId: number }).translationId) &&
      (candidate as { translationId: number }).translationId > 0
    );
  }

  if (candidate.kind === 'tafsir') {
    const tafsirId = (candidate as { tafsirId?: unknown }).tafsirId;
    if (typeof tafsirId !== 'number' || !Number.isFinite(tafsirId) || tafsirId <= 0) return false;

    const scope = (candidate as { scope?: unknown }).scope;
    if (scope === undefined) return true;
    if (scope !== 'surah') return false;

    const surahId = (candidate as { surahId?: unknown }).surahId;
    return typeof surahId === 'number' && Number.isFinite(surahId) && surahId > 0;
  }

  if (candidate.kind === 'audio') {
    const audio = candidate as Partial<Extract<DownloadableContent, { kind: 'audio' }>>;
    return (
      typeof audio.reciterId === 'number' &&
      Number.isFinite(audio.reciterId) &&
      audio.reciterId > 0 &&
      audio.scope === 'surah' &&
      typeof audio.surahId === 'number' &&
      Number.isFinite(audio.surahId) &&
      audio.surahId > 0
    );
  }

  if (candidate.kind === 'words') {
    const words = candidate as Partial<Extract<DownloadableContent, { kind: 'words' }>>;
    return (
      words.scope === 'surah' &&
      typeof words.surahId === 'number' &&
      Number.isFinite(words.surahId) &&
      words.surahId > 0
    );
  }

  return false;
}

export function isDownloadProgress(value: unknown): value is DownloadProgress {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DownloadProgress> & { kind?: unknown };

  if (candidate.kind === 'percent') {
    const percent = (candidate as { percent?: unknown }).percent;
    return (
      typeof percent === 'number' && Number.isFinite(percent) && percent >= 0 && percent <= 100
    );
  }

  if (candidate.kind === 'items') {
    const completed = (candidate as { completed?: unknown }).completed;
    const total = (candidate as { total?: unknown }).total;
    return (
      typeof completed === 'number' &&
      Number.isFinite(completed) &&
      typeof total === 'number' &&
      Number.isFinite(total) &&
      total >= 0 &&
      completed >= 0 &&
      completed <= total
    );
  }

  return false;
}

export function isDownloadIndexItem(value: unknown): value is DownloadIndexItem {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DownloadIndexItem>;

  if (!isDownloadableContent(candidate.content)) return false;
  if (!isDownloadStatus(candidate.status)) return false;

  if (candidate.progress !== undefined && !isDownloadProgress(candidate.progress)) return false;
  if (candidate.error !== undefined && typeof candidate.error !== 'string') return false;

  if (typeof candidate.createdAt !== 'number' || !Number.isFinite(candidate.createdAt)) return false;
  if (typeof candidate.updatedAt !== 'number' || !Number.isFinite(candidate.updatedAt)) return false;

  return true;
}
