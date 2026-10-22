import { createContext, useContext } from 'react';

import type { BookmarkContextType } from './types';

export const BookmarkContext = createContext<BookmarkContextType | undefined>(undefined);

export const useBookmarks = (): BookmarkContextType => {
  const context = useContext(BookmarkContext);
  if (!context) {
    throw new Error('useBookmarks must be used within a BookmarkProvider');
  }
  return context;
};

