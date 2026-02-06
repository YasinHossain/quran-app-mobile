import { v4 as uuidv4 } from 'uuid';

import type { Bookmark, Folder } from '@/types';

const generateId = (): string => uuidv4();

const normalizeVerseId = (id: string | number): string => String(id);

const matchesVerseId = (bookmark: Bookmark, verseId: string | number): boolean =>
  normalizeVerseId(bookmark.verseId) === normalizeVerseId(verseId);

export const createNewFolder = (name: string, color?: string): Folder => {
  const base: Folder = {
    id: generateId(),
    name,
    createdAt: Date.now(),
    bookmarks: [],
  };

  if (color !== undefined) {
    base.color = color;
  }

  return base;
};

export const findBookmarkInFolders = (
  folders: Folder[],
  verseId: string
): { folder: Folder; bookmark: Bookmark } | null => {
  for (const folder of folders) {
    const bookmark = folder.bookmarks.find((b) => matchesVerseId(b, verseId));
    if (bookmark) {
      return { folder, bookmark };
    }
  }
  return null;
};

export const isVerseBookmarked = (folders: Folder[], verseId: string): boolean => {
  return findBookmarkInFolders(folders, verseId) !== null;
};

export const getAllBookmarkedVerses = (folders: Folder[]): string[] => {
  const allVerses = folders.flatMap((folder) =>
    folder.bookmarks.map((bookmark) => normalizeVerseId(bookmark.verseId))
  );
  return [...new Set(allVerses)];
};

export const addBookmarkToFolder = (
  folders: Folder[],
  verseId: string,
  folderId?: string,
  metadata: Partial<Bookmark> = {}
): Folder[] => {
  const normalizedVerseId = normalizeVerseId(verseId);
  let targetFolderId = folderId;

  if (!targetFolderId) {
    let defaultFolder = folders.find((f) => f.name === 'Uncategorized');
    if (!defaultFolder) {
      defaultFolder = createNewFolder('Uncategorized');
      folders = [defaultFolder, ...folders];
    }
    targetFolderId = defaultFolder.id;
  }

  const targetFolder = folders.find((folder) => folder.id === targetFolderId);
  if (targetFolder?.bookmarks.some((bookmark) => matchesVerseId(bookmark, normalizedVerseId))) {
    return folders;
  }

  const newBookmark: Bookmark = {
    verseId: normalizedVerseId,
    createdAt: Date.now(),
    ...metadata,
  };

  return folders.map((folder) =>
    folder.id === targetFolderId
      ? { ...folder, bookmarks: [...folder.bookmarks, newBookmark] }
      : folder
  );
};

export const removeBookmarkFromFolder = (
  folders: Folder[],
  verseId: string,
  folderId: string
): Folder[] => {
  const normalizedVerseId = normalizeVerseId(verseId);
  return folders.map((folder) =>
    folder.id === folderId
      ? {
          ...folder,
          bookmarks: folder.bookmarks.filter((b) => !matchesVerseId(b, normalizedVerseId)),
        }
      : folder
  );
};

export const updateBookmarkInFolders = (
  folders: Folder[],
  verseId: string,
  data: Partial<Bookmark>
): Folder[] => {
  const normalizedVerseId = normalizeVerseId(verseId);
  return folders.map((folder) => ({
    ...folder,
    bookmarks: folder.bookmarks.map((bookmark) =>
      matchesVerseId(bookmark, normalizedVerseId) ? { ...bookmark, ...data } : bookmark
    ),
  }));
};

