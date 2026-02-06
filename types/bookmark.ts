/**
 * A saved verse reference with optional cached metadata for quick display.
 *
 * Mirrored from the web app's `types/bookmark.ts` for UI/UX parity.
 */
export interface Bookmark {
  /** Unique verse identifier stored as a string. */
  verseId: string;
  /** Numeric verse identifier from the source API. */
  verseApiId?: number;
  /** Timestamp when the bookmark was created (ms since epoch). */
  createdAt: number;

  /** Surah and ayah representation (e.g., "1:1"). */
  verseKey?: string;
  /** Arabic text of the verse (cached for offline display). */
  verseText?: string;
  /** English name of the surah (cached). */
  surahName?: string;
  /** Translation text for the verse (cached). */
  translation?: string;
}

/**
 * A collection of bookmarks grouped under a user-defined folder.
 */
export interface Folder {
  /** Unique identifier (UUID). */
  id: string;
  /** Display name for the folder. */
  name: string;
  /** Bookmarks contained in this folder. */
  bookmarks: Bookmark[];
  /** Timestamp of when the folder was created (ms since epoch). */
  createdAt: number;
  /** Optional folder color customization. */
  color?: string;
}

