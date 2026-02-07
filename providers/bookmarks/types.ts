import type { Bookmark, Folder, LastReadMap, PlannerPlan } from '@/types';

import type { PlannerPlanRangeConfig } from './bookmark-utils';

export type SectionId = 'bookmarks' | 'pinned' | 'last-read' | 'planner';

export interface BookmarkContextType {
  folders: Folder[];
  pinnedVerses: Bookmark[];
  lastRead: LastReadMap;
  planner: Record<string, PlannerPlan>;
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

  setLastRead: (
    surahId: string,
    verseNumber: number,
    verseKey?: string,
    globalVerseId?: number
  ) => void;
  removeLastRead: (surahId: string) => void;

  addToPlanner: (surahId: number, targetVerses?: number, estimatedDays?: number) => void;
  createPlannerPlan: (
    surahId: number,
    targetVerses: number,
    planName?: string,
    estimatedDays?: number,
    range?: PlannerPlanRangeConfig
  ) => void;
  updatePlannerProgress: (planId: string, completedVerses: number) => void;
  removeFromPlanner: (planId: string) => void;
}
