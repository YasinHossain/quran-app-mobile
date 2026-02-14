import { getItem, parseJson, setItem } from '@/lib/storage/appStorage';
import type {
  DownloadIndexItem,
  DownloadIndexItemPatch,
  DownloadIndexItemWithKey,
  DownloadableContent,
  DownloadKey,
} from '@/src/core/domain/entities/DownloadIndexItem';
import { getDownloadKey, isDownloadIndexItem } from '@/src/core/domain/entities/DownloadIndexItem';
import type { IDownloadIndexRepository } from '@/src/core/domain/repositories/IDownloadIndexRepository';
import { logger } from '@/src/core/infrastructure/monitoring/logger';

const DOWNLOAD_INDEX_STORAGE_KEY = 'quranAppDownloadIndex_v1';

type StoredDownloadIndex = Record<DownloadKey, DownloadIndexItem>;

async function loadIndexFromStorage(): Promise<StoredDownloadIndex> {
  try {
    const raw = parseJson<unknown>(await getItem(DOWNLOAD_INDEX_STORAGE_KEY));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

    const record = raw as Record<string, unknown>;
    const index: StoredDownloadIndex = {};

    for (const [key, value] of Object.entries(record)) {
      if (!isDownloadIndexItem(value)) continue;
      const expectedKey = getDownloadKey(value.content);
      if (expectedKey !== key) continue;
      index[key] = value;
    }

    return index;
  } catch (error) {
    logger.warn('Failed to load download index from storage', undefined, error as Error);
    return {};
  }
}

async function saveIndexToStorage(index: StoredDownloadIndex): Promise<void> {
  await setItem(DOWNLOAD_INDEX_STORAGE_KEY, JSON.stringify(index));
}

function applyPatch(
  existing: DownloadIndexItem | undefined,
  content: DownloadableContent,
  patch: DownloadIndexItemPatch,
  now: number
): DownloadIndexItem {
  const next: DownloadIndexItem = existing
    ? { ...existing, content }
    : {
        content,
        status: patch.status ?? 'queued',
        createdAt: now,
        updatedAt: now,
      };

  if (patch.status !== undefined) {
    next.status = patch.status;
  }

  if (patch.progress !== undefined) {
    if (patch.progress === null) {
      delete next.progress;
    } else {
      next.progress = patch.progress;
    }
  }

  if (patch.error !== undefined) {
    if (patch.error === null) {
      delete next.error;
    } else {
      next.error = patch.error;
    }
  }

  next.updatedAt = now;
  return next;
}

export class DownloadIndexRepository implements IDownloadIndexRepository {
  async list(): Promise<DownloadIndexItemWithKey[]> {
    const index = await loadIndexFromStorage();
    return Object.entries(index).map(([key, item]) => ({ key, ...item }));
  }

  async get(content: DownloadableContent): Promise<DownloadIndexItemWithKey | null> {
    const index = await loadIndexFromStorage();
    const key = getDownloadKey(content);
    const item = index[key];
    if (!item) return null;
    return { key, ...item };
  }

  async upsert(
    content: DownloadableContent,
    patch: DownloadIndexItemPatch
  ): Promise<DownloadIndexItemWithKey> {
    const index = await loadIndexFromStorage();
    const key = getDownloadKey(content);
    const now = Date.now();

    const updated = applyPatch(index[key], content, patch, now);
    index[key] = updated;
    await saveIndexToStorage(index);

    return { key, ...updated };
  }

  async remove(content: DownloadableContent): Promise<void> {
    const index = await loadIndexFromStorage();
    const key = getDownloadKey(content);
    if (!(key in index)) return;

    delete index[key];
    await saveIndexToStorage(index);
  }

  async clearErrors(content?: DownloadableContent): Promise<void> {
    const index = await loadIndexFromStorage();
    const now = Date.now();

    if (content) {
      const key = getDownloadKey(content);
      const item = index[key];
      if (!item || item.error === undefined) return;

      const next = { ...item };
      delete next.error;
      next.updatedAt = now;
      index[key] = next;
      await saveIndexToStorage(index);
      return;
    }

    let didChange = false;
    for (const key of Object.keys(index)) {
      const item = index[key];
      if (!item || item.error === undefined) continue;

      const next = { ...item };
      delete next.error;
      next.updatedAt = now;
      index[key] = next;
      didChange = true;
    }

    if (didChange) {
      await saveIndexToStorage(index);
    }
  }
}

