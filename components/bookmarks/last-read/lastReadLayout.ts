export const LAST_READ_HORIZONTAL_PADDING = 32; // 16 * 2
export const LAST_READ_GRID_GAP = 12;
export const LAST_READ_MIN_CARD_WIDTH = 152;
export const LAST_READ_MAX_COLUMNS = 5;

/**
 * Computes the optimal number of columns for the last-read grid based on available width.
 * Ensures small to standard phones get 2 columns, while scaling gracefully to tablets and landscape.
 */
export function getLastReadNumColumns(width: number): number {
  const available = Math.max(0, width - LAST_READ_HORIZONTAL_PADDING);
  const columns = Math.floor((available + LAST_READ_GRID_GAP) / (LAST_READ_MIN_CARD_WIDTH + LAST_READ_GRID_GAP));
  return Math.max(1, Math.min(LAST_READ_MAX_COLUMNS, columns || 1));
}

/**
 * Computes the exact card width so every card in the grid—including the final card
 * in an incomplete row—has an identical width and does not stretch.
 */
export function getLastReadCardWidth(width: number, numColumns: number): number | undefined {
  if (numColumns <= 1) return undefined;
  const available = Math.max(0, width - LAST_READ_HORIZONTAL_PADDING);
  return Math.floor((available - (numColumns - 1) * LAST_READ_GRID_GAP) / numColumns);
}
