import { getItem, parseJson, setItem } from '@/lib/storage/appStorage';

import type { Chapter } from '@/types';

const CHAPTERS_STORAGE_KEY = 'quranAppChapters_v1';

const isChapterLike = (value: unknown): value is Chapter => {
  if (!value || typeof value !== 'object') return false;
  const chapter = value as Partial<Chapter>;
  return typeof chapter.id === 'number' && typeof chapter.name_simple === 'string';
};

export async function loadChaptersFromStorage(): Promise<Chapter[]> {
  const raw = parseJson<unknown>(await getItem(CHAPTERS_STORAGE_KEY));
  if (!Array.isArray(raw)) return [];
  return raw.filter(isChapterLike);
}

export async function saveChaptersToStorage(chapters: Chapter[]): Promise<void> {
  await setItem(CHAPTERS_STORAGE_KEY, JSON.stringify(chapters));
}

