import type { MushafWord } from '@/types';

export interface MushafWordPressPayload {
  charType?: MushafWord['charType'];
  lineNumber?: number;
  location?: string;
  text: string;
  verseKey?: string;
  wordPosition: number;
}

export interface MushafSelectionPayload {
  isCollapsed: boolean;
  text: string;
  verseKeys: string[];
  wordPositions: number[];
}

export function resolveMushafVerseKey(value: {
  verseKey?: string | undefined;
  location?: string | undefined;
}): string | undefined {
  const verseKey = typeof value.verseKey === 'string' ? value.verseKey.trim() : '';
  if (verseKey) {
    return verseKey;
  }

  const location = typeof value.location === 'string' ? value.location.trim() : '';
  if (!location) {
    return undefined;
  }

  const [surahPart, ayahPart] = location.split(':');
  if (!surahPart || !ayahPart) {
    return undefined;
  }

  return `${surahPart}:${ayahPart}`;
}

export type MushafWebViewMessage =
  | {
      type: 'content-height';
      payload: {
        height: number;
      };
    }
  | {
      type: 'selection-change';
      payload: MushafSelectionPayload;
    }
  | {
      type: 'word-long-press' | 'word-press';
      payload: MushafWordPressPayload;
    };
