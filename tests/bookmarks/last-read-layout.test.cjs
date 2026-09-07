const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getLastReadCardWidth,
  getLastReadNumColumns,
  LAST_READ_GRID_GAP,
  LAST_READ_HORIZONTAL_PADDING,
  LAST_READ_MAX_COLUMNS,
} = require('../../components/bookmarks/last-read/lastReadLayout.ts');

test('getLastReadNumColumns returns 1 on very narrow viewports (< 350px)', () => {
  assert.equal(getLastReadNumColumns(320), 1);
  assert.equal(getLastReadNumColumns(280), 1);
});

test('getLastReadNumColumns returns 2 on all standard mobile phone portrait widths', () => {
  assert.equal(getLastReadNumColumns(360), 2); // Compact Android
  assert.equal(getLastReadNumColumns(375), 2); // iPhone SE, 13 mini
  assert.equal(getLastReadNumColumns(390), 2); // iPhone 12 / 13 / 14 / 15 / 16
  assert.equal(getLastReadNumColumns(393), 2); // iPhone 14 / 15 / 16 Pro
  assert.equal(getLastReadNumColumns(412), 2); // Pixel / Galaxy
  assert.equal(getLastReadNumColumns(430), 2); // iPhone Plus / Pro Max
});

test('getLastReadNumColumns scales responsively on foldables and tablets', () => {
  assert.equal(getLastReadNumColumns(600), 3); // Foldable / landscape phone
  assert.equal(getLastReadNumColumns(768), 4); // iPad portrait
  assert.equal(getLastReadNumColumns(1024), 5); // iPad landscape (capped at LAST_READ_MAX_COLUMNS)
  assert.equal(getLastReadNumColumns(1400), 5);
});

test('getLastReadCardWidth returns undefined for single-column layouts so cards take full row width', () => {
  assert.equal(getLastReadCardWidth(320, 1), undefined);
  assert.equal(getLastReadCardWidth(375, 1), undefined);
});

test('getLastReadCardWidth ensures each card in a multi-column row has an identical, non-stretching width', () => {
  // iPhone 14 / 15 (width 390):
  // Available: 390 - 32 = 358px.
  // 2 columns with 12px gap: (358 - 12) / 2 = 173px.
  const cardWidth390 = getLastReadCardWidth(390, 2);
  assert.equal(cardWidth390, 173);

  // A full row with 2 cards fits within available width:
  const rowWidth = (cardWidth390 ?? 0) * 2 + LAST_READ_GRID_GAP;
  assert.ok(rowWidth <= 390 - LAST_READ_HORIZONTAL_PADDING);

  // When a 3rd card is rendered on its own row, its width remains 173px (does not stretch):
  assert.equal(cardWidth390, 173);
});

test('getLastReadCardWidth never exceeds available row width across various screen sizes', () => {
  const testWidths = [360, 375, 390, 412, 430, 600, 768, 1024, 1280];

  for (const width of testWidths) {
    const columns = getLastReadNumColumns(width);
    const cardWidth = getLastReadCardWidth(width, columns);

    if (columns > 1 && cardWidth !== undefined) {
      const totalRowWidth = cardWidth * columns + (columns - 1) * LAST_READ_GRID_GAP;
      const availableWidth = width - LAST_READ_HORIZONTAL_PADDING;
      assert.ok(
        totalRowWidth <= availableWidth,
        `Total row width ${totalRowWidth} exceeds available ${availableWidth} at screen width ${width}`
      );
    }
  }
});
