import type { Bookmark, Folder } from '@/types';

export type SectionId = 'bookmarks' | 'pinned' | 'last-read' | 'planner';

export interface BookmarkContextType {
  folders: Folder[];
  pinnedVerses: Bookmark[];
  isHydrated: boolean;

  createFolder: (name: string, color?: string) => void;
  deleteFolder: (folderId: string) => void;
  renameFolder: (folderId: string, newName: string, color?: string) => void;

  addBookmark: (verseId: string, folderId?: string, metadata?: Partial<Bookmark>) => void;
  removeBookmark: (verseId: string, folderId: string) => void;
  toggleBookmark: (verseId: string, folderId?: string, metadata?: Partial<Bookmark>) => void;
  updateBookmark: (verseId: string, data: Partial<Bookmark>) => void;

  isBookmarked: (verseId: string) => boolean;
  findBookmark: (verseId: string) => { folder: Folder; bookmark: Bookmark } | null;
  bookmarkedVerses: string[];

  togglePinned: (verseId: string, metadata?: Partial<Bookmark>) => void;
  isPinned: (verseId: string) => boolean;
}

