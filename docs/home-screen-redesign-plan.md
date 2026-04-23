# Home Screen Redesign Plan (Chunked, AI-Doable)

> **Last updated:** 2026-04-23  
> **Scope:** Expo (React Native) app in `quran-app-mobile`  
> **Goal:** Redesign the mobile home screen to match the requested layout more closely while keeping the existing search flow intact.

## Summary
Implement the requested home-screen redesign in small, safe chunks so you can hand each chunk to Codex separately.

Target home layout order:

1. Existing search bar and search dropdown behavior
2. Blank random-verse placeholder space
3. 4 shortcut tiles: `Recent`, `Bookmarks`, `Planner`, `Pinned`
4. One separate `Recent` card/pill below the shortcuts
5. Tab selector with `Surah`, `Juz`, `Page`
6. Active list content below the tabs

This is intentionally split into AI-sized chunks because doing the entire feature in one pass is more error-prone.

## Overall Difficulty
- **Whole task in one go:** `high` to `xhigh`
- **Chunk-by-chunk:** mostly `medium`, with one `high` chunk for shared recent-data wiring
- **Recommendation:** do not ask for the full feature at once; use this file chunk-by-chunk

## Locked Decisions
- Keep the current top search bar and `ComprehensiveSearchDropdown` behavior.
- Do not add a title row with a search icon; keep the search input.
- Add a blank placeholder for random verse now; do not implement random-verse fetching yet.
- Show 4 shortcut tiles: `Recent`, `Bookmarks`, `Planner`, `Pinned`.
- Show a separate `Recent` card below the shortcut grid.
- Use only 3 tabs in this pass: `Surah`, `Juz`, `Page`.
- Render the tab buttons in visual order `Page | Juz | Surah` so `Surah` appears on the right.
- Keep labels in English.
- Use `Pinned`, not `Pinned Verses`.
- Do not add `Hizb` in this pass.
- Do not change `src/core/domain` or `src/core/application`.

## Source of Truth
Mirror behavior and labels from these files where relevant, while following the requested mobile-specific layout:

- Web:
  - `../quran-app/app/(features)/home/page.tsx`
  - `../quran-app/app/(features)/home/components/HomePageClient.tsx`
  - `../quran-app/app/(features)/home/components/HomeQuickLinks.tsx`
  - `../quran-app/app/(features)/home/components/HomeTabsClient.tsx`
  - `../quran-app/app/(features)/home/components/TabNavigation.tsx`
- Mobile current implementation:
  - `app/(tabs)/index.tsx`
  - `components/home/HomeTabToggle.tsx`
  - `components/bookmarks/last-read/LastReadSection.tsx`
  - `providers/bookmarks/BookmarkProvider.tsx`
  - `app/(tabs)/bookmarks.tsx`

## Thinking Level Guide

| Chunk | Difficulty | Recommended Codex thinking | Why |
| --- | --- | --- | --- |
| Chunk 1 | Medium | `medium` | Mostly home layout reshaping and new UI shells |
| Chunk 2 | Medium | `medium` | Route wiring plus bookmarks section param support |
| Chunk 3 | High | `high` | Shared recent-data extraction and live home-card wiring |
| Chunk 4 | Medium | `medium` | 3-state tabs plus new page list/grid |
| Chunk 5 | Low | `low` | Docs updates, polish, and verification |

If a chunk starts failing because of unexpected UI integration issues, retry that chunk with `high`. `xhigh` should only be used if you ignore the chunking and ask for multiple chunks together.

## Chunked Implementation Plan

### Chunk 1 - Home shell and static dashboard sections
**Goal:** Replace the current simple title-row layout with the new dashboard-style home structure, but keep only static placeholders for the new sections.

**Recommended Codex thinking:** `medium`

**Change only:**
- `app/(tabs)/index.tsx`
- New home-only components under `components/home/`:
  - `HomeVersePlaceholder.tsx`
  - `HomeShortcutGrid.tsx`
  - `HomeRecentCard.tsx`

**Implementation details:**
- Keep the existing `HeaderSearchInput` and `ComprehensiveSearchDropdown` logic unchanged.
- Remove the current "All Surahs / All Juz" title row from the home screen.
- Add a blank hero/placeholder block for random verse.
- Add a 4-tile shortcut grid UI with labels only for now:
  - `Recent`
  - `Bookmarks`
  - `Planner`
  - `Pinned`
- Add a separate `Recent` card UI below the shortcut grid, but keep it as a visual placeholder in this chunk.
- Keep the current 2-tab `Surah/Juz` behavior for now.
- Do not wire navigation or real recent data yet.

**Done when:**
- The home screen visually contains:
  - search bar
  - blank random-verse space
  - 4 shortcut tiles
  - one recent card slot
  - existing tab/list section below
- Existing search still works.
- Existing `Surah` and `Juz` list behavior still works.

**Prompt for Codex:**
> Read `docs/home-screen-redesign-plan.md` first. Implement only **Chunk 1**. Restructure `app/(tabs)/index.tsx` into the new dashboard layout, add static home components for the blank verse area, shortcut tiles, and recent card, but do not wire navigation or data yet. Keep the current search flow untouched. Do not implement later chunks. Finish with `npm run verify`.

---

### Chunk 2 - Shortcut tile navigation and bookmarks section routing
**Goal:** Make the 4 home shortcut tiles navigate to the correct existing screens/sections.

**Recommended Codex thinking:** `medium`

**Change only:**
- `components/home/HomeShortcutGrid.tsx`
- `app/(tabs)/index.tsx`
- `app/(tabs)/bookmarks.tsx`

**Implementation details:**
- Add support for an optional bookmarks route/search param named `section`.
- Valid values:
  - `bookmarks`
  - `last-read`
  - `pinned`
- In `app/(tabs)/bookmarks.tsx`, initialize `activeSection` from the route param on first load.
- If the param is missing or invalid, keep the current default behavior.
- Wire home shortcut tiles as:
  - `Recent` -> bookmarks screen with `section=last-read`
  - `Bookmarks` -> bookmarks screen with `section=bookmarks`
  - `Pinned` -> bookmarks screen with `section=pinned`
  - `Planner` -> planner tab
- Keep existing bookmarks screen behavior unchanged after the screen has loaded.

**Done when:**
- Tapping each home shortcut opens the correct destination.
- Bookmarks screen honors `section` on first render.
- Existing bookmarks interactions still work normally after entry.

**Prompt for Codex:**
> Read `docs/home-screen-redesign-plan.md` first. Implement only **Chunk 2**. Wire the home shortcut tiles to existing screens and add optional `section` route-param support to `app/(tabs)/bookmarks.tsx` for `bookmarks`, `last-read`, and `pinned`. Do not implement later chunks. Finish with `npm run verify`.

---

### Chunk 3 - Real Recent card using existing last-read state
**Goal:** Replace the placeholder recent card with live data from the existing bookmarks/last-read state.

**Recommended Codex thinking:** `high`

**Change only:**
- `components/home/HomeRecentCard.tsx`
- `app/(tabs)/index.tsx`
- `components/bookmarks/last-read/LastReadSection.tsx`
- New shared helper:
  - `components/bookmarks/last-read/lastReadEntries.ts`

**Implementation details:**
- Extract the shared last-read normalization logic out of `LastReadSection.tsx` into `components/bookmarks/last-read/lastReadEntries.ts`.
- Export:
  - normalized entry type
  - helper to build normalized last-read entries from `lastRead` + `chapters`
- Update `LastReadSection.tsx` to use the extracted helper so home and bookmarks share the same logic.
- Update `HomeRecentCard.tsx` to:
  - read `lastRead` from `useBookmarks()`
  - read chapter metadata from `useChapters()`
  - use the shared helper
  - take only the newest entry
- Home recent card behavior:
  - if data exists, show surah name and verse position
  - tapping the card opens `/surah/[surahId]` with `startVerse`
  - no remove button on the home card
  - if no data exists, show a subdued placeholder card, not an empty gap

**Done when:**
- Home recent card shows the newest last-read item.
- It opens the correct surah and verse.
- Bookmarks recent section still behaves the same.
- No duplicate last-read normalization logic remains in the two places.

**Prompt for Codex:**
> Read `docs/home-screen-redesign-plan.md` first. Implement only **Chunk 3**. Extract the last-read normalization logic from `components/bookmarks/last-read/LastReadSection.tsx` into a shared helper, then wire `HomeRecentCard` to show the newest real recent item from `useBookmarks()` + `useChapters()`. Keep the home recent card read-only. Do not implement later chunks. Finish with `npm run verify`.

---

### Chunk 4 - 3-tab control and new Page list
**Goal:** Finish the requested tab model by adding `Page` and making the tab order read right-to-left visually.

**Recommended Codex thinking:** `medium`

**Change only:**
- `components/home/HomeTabToggle.tsx`
- `app/(tabs)/index.tsx`
- New home components:
  - `components/home/PageCard.tsx`
  - `components/home/PageGrid.tsx`

**Implementation details:**
- Expand `HomeTab` to:
  - `surah`
  - `juz`
  - `page`
- Keep the internal tab ids logical, but render buttons in visual order:
  - `page`
  - `juz`
  - `surah`
- Add a new page grid/list below the tabs.
- Generate pages `1..604` in `app/(tabs)/index.tsx` with `React.useMemo`.
- `PageGrid` should accept `pages: number[]`.
- `PageCard` should:
  - display `Page {n}`
  - navigate to `/page/[pageNumber]`
  - reuse the same card language/style family as existing `SurahCard` and `JuzCard`
- Keep existing `Surah` and `Juz` content behavior unchanged.

**Done when:**
- Home tabs now switch between `Surah`, `Juz`, and `Page`.
- `Surah` appears on the right side of the segmented control.
- `Page` tab renders a working page grid/list for all 604 pages.
- Tapping a page opens the page reader route.

**Prompt for Codex:**
> Read `docs/home-screen-redesign-plan.md` first. Implement only **Chunk 4**. Expand the home tab control from 2 tabs to 3 (`Surah`, `Juz`, `Page`), render the buttons in visual order `Page | Juz | Surah`, and add a new `PageGrid`/`PageCard` that navigates to `/page/[pageNumber]`. Do not implement later chunks. Finish with `npm run verify`.

---

### Chunk 5 - Docs, polish, and verification
**Goal:** Finish the feature cleanly and document the new home-screen structure.

**Recommended Codex thinking:** `low`

**Change only:**
- `docs/ui-parity.md`
- `docs/components.md`
- Minor polish in the files touched by Chunks 1-4 if needed

**Implementation details:**
- Update `docs/ui-parity.md` to describe the new mobile home layout and note the divergence from the current web quick-links placement.
- Update `docs/components.md` for:
  - `HomeVersePlaceholder`
  - `HomeShortcutGrid`
  - `HomeRecentCard`
  - `PageCard`
  - `PageGrid`
  - updated `HomeTabToggle`
- Do a small polish pass only:
  - spacing
  - empty-state copy
  - press states
  - list padding
- Do not introduce new behavior beyond the already planned chunks.

**Done when:**
- Docs reflect the new home structure.
- UI spacing and press states are clean.
- `npm run verify` passes.

**Prompt for Codex:**
> Read `docs/home-screen-redesign-plan.md` first. Implement only **Chunk 5**. Update `docs/ui-parity.md` and `docs/components.md` for the new home-screen pieces, do a small polish pass only on already-touched files, and finish with `npm run verify`.

## Manual Acceptance Checklist
- Search bar still behaves exactly like the current home search.
- A blank random-verse placeholder space exists and does nothing yet.
- Home shows 4 shortcut tiles: `Recent`, `Bookmarks`, `Planner`, `Pinned`.
- Home shows a separate recent card below the shortcuts.
- Shortcut tiles navigate correctly.
- Recent card opens the latest last-read surah/verse.
- Tabs are `Surah`, `Juz`, `Page`.
- Visual tab order is right-to-left with `Surah` on the right.
- Page tab opens valid page routes.
- `npm run verify` passes at the end of each chunk.

## Notes
- If you want the AI to stay efficient, give it **one chunk only** per prompt.
- If a chunk touches both layout and routing, `medium` is usually enough.
- If a chunk extracts shared logic or refactors existing behavior, prefer `high`.
- `xhigh` is unnecessary for this work if you follow the chunk order in this file.
