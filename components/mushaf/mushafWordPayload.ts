import type { MushafWord } from '@/types';

export interface MushafWordPressPayload {
  charType?: MushafWord['charType'];
  lineNumber?: number;
  location?: string;
  pageNumber?: number;
  text: string;
  verseKey?: string;
  wordPosition: number;
}

export interface MushafSelectionPayload {
  isCollapsed: boolean;
  pageNumber?: number;
  text: string;
  verseKeys: string[];
  wordPositions: number[];
}

export interface MushafHighlightAnchorPayload {
  height: number;
  offsetY: number;
  pageHeight: number;
  pageNumber?: number;
  verseKey: string;
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
      type: 'renderer-ready';
      payload: {
        ready: true;
      };
    }
  | {
      type: 'content-height';
      payload: {
        contentReady?: boolean;
        height: number;
        renderedWordCount?: number;
      };
    }
  | {
      type: 'highlight-anchor';
      payload: MushafHighlightAnchorPayload;
    }
  | {
      type: 'selection-change';
      payload: MushafSelectionPayload;
    }
  | {
      type: 'word-long-press' | 'word-press';
      payload: MushafWordPressPayload;
    };
