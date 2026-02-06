import { v4 as uuidv4 } from 'uuid';

import { getItem, parseJson, removeItem, setItem } from '@/lib/storage/appStorage';

import { BOOKMARKS_STORAGE_KEY, OLD_BOOKMARKS_STORAGE_KEY, PINNED_STORAGE_KEY } from './constants';

import type { Bookmark, Folder } from '@/types';

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
      id: uuidv4(),
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

