import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import {
  addBookmarkToFolder,
  createNewFolder,
  findBookmarkInFolders,
  getAllBookmarkedVerses,
  isVerseBookmarked,
  removeBookmarkFromFolder,
  updateBookmarkInFolders,
} from '@/providers/bookmarks/bookmark-utils';
import { BookmarkContext } from '@/providers/bookmarks/BookmarkContext';
import {
  loadBookmarksFromStorage,
  loadPinnedFromStorage,
  saveBookmarksToStorage,
  savePinnedToStorage,
} from '@/providers/bookmarks/storage-utils';

import type { BookmarkContextType } from '@/providers/bookmarks/types';
import type { Bookmark, Folder } from '@/types';

const PERSIST_DEBOUNCE_MS = 250;

const sameVerseId = (a: string | number, b: string | number): boolean => String(a) === String(b);

/**
 * Check if a verseId matches a bookmark by comparing against multiple identifiers.
 * This handles cases where pins were created with different ID formats:
 * - Numeric API ID (e.g., "1" for verse 1:1)
 * - VerseKey format (e.g., "1:1")
 * - VerseApiId field
 */
const matchesPinnedBookmark = (bookmark: Bookmark, searchId: string): boolean => {
  const id = String(searchId);
  const bookmarkVerseId = String(bookmark.verseId);

  if (bookmarkVerseId === id) return true;

  if (bookmark.verseKey) {
    const verseKey = String(bookmark.verseKey);
    if (verseKey === id) return true;
    if (bookmarkVerseId === verseKey && bookmark.verseApiId) {
      if (String(bookmark.verseApiId) === id) return true;
    }
  }

  if (bookmark.verseApiId && String(bookmark.verseApiId) === id) return true;

  if (bookmarkVerseId.includes(':') && !id.includes(':')) {
    if (bookmark.verseApiId && String(bookmark.verseApiId) === id) return true;
  }

  return false;
};

export const BookmarkProvider = ({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement => {
  const value = useBookmarkProviderValue();
  return <BookmarkContext.Provider value={value}>{children}</BookmarkContext.Provider>;
};

function useBookmarkProviderValue(): BookmarkContextType {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [pinnedVerses, setPinnedVerses] = useState<Bookmark[]>([]);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedFromStorage = useRef(false);
  const latestStateRef = useRef<{ folders: Folder[]; pinnedVerses: Bookmark[] }>({
    folders,
    pinnedVerses,
  });
  const [isHydrated, setIsHydrated] = useReducer(() => true, false);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      const [loadedFolders, loadedPinned] = await Promise.all([
        loadBookmarksFromStorage(),
        loadPinnedFromStorage(),
      ]);

      if (cancelled) return;
      hasLoadedFromStorage.current = true;
      setFolders(loadedFolders);
      setPinnedVerses(loadedPinned);
      latestStateRef.current = { folders: loadedFolders, pinnedVerses: loadedPinned };
      setIsHydrated();
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistLatest = useCallback(async () => {
    const latest = latestStateRef.current;
    await Promise.all([saveBookmarksToStorage(latest.folders), savePinnedToStorage(latest.pinnedVerses)]);
  }, []);

  useEffect(() => {
    latestStateRef.current = { folders, pinnedVerses };
    if (!hasLoadedFromStorage.current) return;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      void persistLatest();
    }, PERSIST_DEBOUNCE_MS);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [folders, pinnedVerses, persistLatest]);

  useEffect(() => {
    return () => {
      if (!timeoutRef.current) return;
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      void persistLatest();
    };
  }, [persistLatest]);

  const createFolder = useCallback(
    (name: string, color?: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const newFolder = createNewFolder(trimmed, color);
      setFolders((prev) => [...prev, newFolder]);
    },
    [setFolders]
  );

  const deleteFolder = useCallback(
    (folderId: string) => {
      setFolders((prev) => prev.filter((f) => f.id !== folderId));
    },
    [setFolders]
  );

  const renameFolder = useCallback(
    (folderId: string, newName: string, color?: string) => {
      const trimmed = newName.trim();
      if (!trimmed) return;
      setFolders((prev) =>
        prev.map((folder) =>
          folder.id === folderId ? { ...folder, name: trimmed, ...(color && { color }) } : folder
        )
      );
    },
    [setFolders]
  );

  const addBookmark = useCallback(
    (verseId: string, folderId?: string, metadata?: Partial<Bookmark>) => {
      if (folderId === 'pinned') {
        setPinnedVerses((prev) =>
          prev.some((b) => sameVerseId(b.verseId, verseId))
            ? prev
            : [...prev, { verseId: String(verseId), createdAt: Date.now(), ...(metadata ?? {}) }]
        );
        return;
      }

      setFolders((prev) => addBookmarkToFolder(prev, verseId, folderId, metadata));
    },
    [setFolders, setPinnedVerses]
  );

  const removeBookmark = useCallback(
    (verseId: string, folderId: string) => {
      if (folderId === 'pinned') {
        setPinnedVerses((prev) => prev.filter((b) => !sameVerseId(b.verseId, verseId)));
        return;
      }
      setFolders((prev) => removeBookmarkFromFolder(prev, verseId, folderId));
    },
    [setFolders, setPinnedVerses]
  );

  const toggleBookmark = useCallback(
    (verseId: string, folderId?: string, metadata?: Partial<Bookmark>) => {
      if (isVerseBookmarked(folders, verseId)) {
        const match = findBookmarkInFolders(folders, verseId);
        if (match) removeBookmark(verseId, match.folder.id);
      } else {
        addBookmark(verseId, folderId, metadata);
      }
    },
    [addBookmark, folders, removeBookmark]
  );

  const updateBookmark = useCallback(
    (verseId: string, data: Partial<Bookmark>) => {
      setFolders((prev) => updateBookmarkInFolders(prev, verseId, data));
      setPinnedVerses((prev) =>
        prev.map((b) => (sameVerseId(b.verseId, verseId) ? { ...b, ...data } : b))
      );
    },
    [setFolders, setPinnedVerses]
  );

  const isBookmarked = useCallback((verseId: string) => isVerseBookmarked(folders, verseId), [folders]);

  const findBookmark = useCallback((verseId: string) => findBookmarkInFolders(folders, verseId), [folders]);

  const bookmarkedVerses = useMemo(() => getAllBookmarkedVerses(folders), [folders]);

  const togglePinned = useCallback(
    (verseId: string, metadata?: Partial<Bookmark>) => {
      setPinnedVerses((prev) => {
        const alreadyPinned = prev.some((b) => matchesPinnedBookmark(b, verseId));
        if (alreadyPinned) {
          const bookmark = prev.find((b) => matchesPinnedBookmark(b, verseId));
          if (!bookmark) return prev;
          return prev.filter((b) => !sameVerseId(b.verseId, bookmark.verseId));
        }

        return [...prev, { verseId: String(verseId), createdAt: Date.now(), ...(metadata ?? {}) }];
      });
    },
    [setPinnedVerses]
  );

  const isPinned = useCallback(
    (verseId: string) => pinnedVerses.some((b) => matchesPinnedBookmark(b, verseId)),
    [pinnedVerses]
  );

  return useMemo(
    () => ({
      folders,
      pinnedVerses,
      isHydrated,
      createFolder,
      deleteFolder,
      renameFolder,
      addBookmark,
      removeBookmark,
      toggleBookmark,
      updateBookmark,
      isBookmarked,
      findBookmark,
      bookmarkedVerses,
      togglePinned,
      isPinned,
    }),
    [
      folders,
      pinnedVerses,
      isHydrated,
      createFolder,
      deleteFolder,
      renameFolder,
      addBookmark,
      removeBookmark,
      toggleBookmark,
      updateBookmark,
      isBookmarked,
      findBookmark,
      bookmarkedVerses,
      togglePinned,
      isPinned,
    ]
  );
}

