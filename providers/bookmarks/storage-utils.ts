import { generateId } from '@/lib/id';

import { getItem, parseJson, removeItem, setItem } from '@/lib/storage/appStorage';

import {
  BOOKMARKS_STORAGE_KEY,
  OLD_BOOKMARKS_STORAGE_KEY,
  PINNED_STORAGE_KEY,
  LAST_READ_STORAGE_KEY,
  PLANNER_STORAGE_KEY,
  LEGACY_MEMORIZATION_STORAGE_KEY,
} from './constants';

import type { Bookmark, Folder, LastReadEntry, LastReadMap, PlannerPlan } from '@/types';

const normalizeBookmark = (bookmark: Bookmark): Bookmark => ({
  ...bookmark,
  verseId: String((bookmark as Bookmark & { verseId: string | number }).verseId),
});

const normalizeFolders = (folders: Folder[]): Folder[] =>
  folders.map((folder) => ({
    ...folder,
    bookmarks: (folder.bookmarks ?? []).map(normalizeBookmark),
  }));

export async function loadBookmarksFromStorage(): Promise<Folder[]> {
  const savedFolders = parseJson<Folder[]>(await getItem(BOOKMARKS_STORAGE_KEY));
  if (savedFolders && Array.isArray(savedFolders)) {
    return normalizeFolders(savedFolders);
  }

  const oldBookmarks = parseJson<unknown>(await getItem(OLD_BOOKMARKS_STORAGE_KEY));
  if (Array.isArray(oldBookmarks) && oldBookmarks.every((id) => typeof id === 'string')) {
    const migratedFolder: Folder = {
      id: generateId(),
      name: 'Uncategorized',
      createdAt: Date.now(),
      bookmarks: oldBookmarks.map((verseId) => ({
        verseId,
        createdAt: Date.now(),
      })),
    };

    await removeItem(OLD_BOOKMARKS_STORAGE_KEY);
    await setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify([migratedFolder]));

    return normalizeFolders([migratedFolder]);
  }

  return [];
}

export async function saveBookmarksToStorage(folders: Folder[]): Promise<void> {
  await setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(folders));
}

export async function loadPinnedFromStorage(): Promise<Bookmark[]> {
  const savedPinned = parseJson<Bookmark[]>(await getItem(PINNED_STORAGE_KEY));
  if (savedPinned && Array.isArray(savedPinned)) {
    return savedPinned.map(normalizeBookmark);
  }
  return [];
}

export async function savePinnedToStorage(pinnedVerses: Bookmark[]): Promise<void> {
  await setItem(PINNED_STORAGE_KEY, JSON.stringify(pinnedVerses));
}

const normalizeLastReadEntry = (value: unknown, fallbackUpdatedAt: number): LastReadEntry | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return {
      verseNumber: value,
      verseId: value,
      updatedAt: fallbackUpdatedAt,
    };
  }

  if (value && typeof value === 'object') {
    const maybeEntry = value as Partial<LastReadEntry> & { verseId?: unknown };

    const verseNumber =
      typeof maybeEntry.verseNumber === 'number' && Number.isFinite(maybeEntry.verseNumber)
        ? maybeEntry.verseNumber
        : typeof maybeEntry.verseId === 'number' && Number.isFinite(maybeEntry.verseId)
          ? maybeEntry.verseId
          : typeof maybeEntry.verseKey === 'string'
            ? Number(maybeEntry.verseKey.split(':')[1])
            : undefined;

    if (!verseNumber || Number.isNaN(verseNumber) || verseNumber <= 0) {
      return null;
    }

    const updatedAt =
      typeof maybeEntry.updatedAt === 'number' && Number.isFinite(maybeEntry.updatedAt)
        ? maybeEntry.updatedAt
        : fallbackUpdatedAt;

    const entry: LastReadEntry = {
      verseNumber,
      updatedAt,
      ...(typeof maybeEntry.verseKey === 'string' && maybeEntry.verseKey.length > 0
        ? { verseKey: maybeEntry.verseKey }
        : {}),
      ...(typeof maybeEntry.globalVerseId === 'number' && Number.isFinite(maybeEntry.globalVerseId)
        ? { globalVerseId: maybeEntry.globalVerseId }
        : {}),
      verseId: verseNumber,
    };

    return entry;
  }

  return null;
};

export async function loadLastReadFromStorage(): Promise<LastReadMap> {
  const raw = parseJson<Record<string, unknown>>(await getItem(LAST_READ_STORAGE_KEY));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const entries = Object.entries(raw);
  if (entries.length === 0) return {};

  const now = Date.now();
  return entries.reduce<LastReadMap>((acc, [surahId, value], index) => {
    const entry = normalizeLastReadEntry(value, now - index);
    if (entry) {
      acc[surahId] = entry;
    }
    return acc;
  }, {});
}

export async function saveLastReadToStorage(lastRead: LastReadMap): Promise<void> {
  await setItem(LAST_READ_STORAGE_KEY, JSON.stringify(lastRead));
}

const normalizePlannerRecord = (input: unknown): Record<string, PlannerPlan> => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  const entries = Object.entries(input as Record<string, PlannerPlan>);
  if (entries.length === 0) {
    return {};
  }

  return entries.reduce<Record<string, PlannerPlan>>((acc, [, value]) => {
    if (value && typeof value === 'object' && 'id' in value) {
      const plan = value as PlannerPlan;
      acc[plan.id] = plan;
    }
    return acc;
  }, {});
};

export async function loadPlannerFromStorage(): Promise<Record<string, PlannerPlan>> {
  const savedPlanner = parseJson<unknown>(await getItem(PLANNER_STORAGE_KEY));
  if (savedPlanner) {
    return normalizePlannerRecord(savedPlanner);
  }

  const legacy = parseJson<unknown>(await getItem(LEGACY_MEMORIZATION_STORAGE_KEY));
  if (legacy) {
    const parsed = normalizePlannerRecord(legacy);
    await removeItem(LEGACY_MEMORIZATION_STORAGE_KEY);
    await setItem(PLANNER_STORAGE_KEY, JSON.stringify(parsed));
    return parsed;
  }

  return {};
}

export async function savePlannerToStorage(planner: Record<string, PlannerPlan>): Promise<void> {
  await setItem(PLANNER_STORAGE_KEY, JSON.stringify(planner));
  await removeItem(LEGACY_MEMORIZATION_STORAGE_KEY);
}
