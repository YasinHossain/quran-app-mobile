# Native Surah Reader Stabilization Handoff

Purpose: make Android `NativeSurahReader` feel like a static native page on entry and mode changes. The current direction is correct: React Native owns app orchestration, Kotlin owns the reader surface. The remaining work is mostly about making native startup atomic and avoiding partial renders.

Status: Phases 1-3 are complete. Keep this document as the native-reader landing contract for future work.

## Final Native Reader Contract

- React Native owns app orchestration and route state.
- All translation-reader entry paths use the Surah route with `startVerse` as the landing target.
- Android `NativeSurahReader` receives one batched `readerState` prop containing `surahId`, `targetVerse`, `surahIntro`, `verses`, `settings`, `activeVerseKey`, insets, and `theme`.
- Kotlin owns reader-surface startup and mounted updates:
  - Initial reader sessions parse theme/settings first, update adapter config and data, notify once, position the target, emit `onInitialPositioned`, then reveal.
  - Mounted reader updates preserve a stable scroll anchor and avoid remounts for mode/settings/theme changes.
  - Active audio highlight updates touch only the old and new verse rows.
- React Native treats native initial placement as programmatic:
  - `onInitialPositioned` marks targeted translation positioning ready.
  - Initial native visible/scroll events are suppressed from last-read writes and header/scrubber feedback until placement completes.

## Phase 1 - Atomic Native Startup

Status: Complete.

Goal: remove target-entry adjustment/flicker at the root by applying native reader state in one batch.

Problem to solve:

- Current native props can arrive separately: `surahId`, `targetVerse`, `surahIntro`, `verses`, `settings`, `theme`, insets.
- Kotlin may render or rebind with incomplete state, then correct after settings/theme/data arrive.
- Tajweed can briefly appear as plain text or remeasure after spans/fonts are applied.

Implementation target:

- Add one batched native prop, for example `readerState`.
- `readerState` should include:
  - `surahId`
  - `targetVerse`
  - `surahIntro`
  - `verses`
  - `settings`
  - `activeVerseKey`
  - `topInsetPx`
  - `bottomInsetPx`
  - `theme`
- In Kotlin, apply `readerState` in one method:
  - parse theme/settings first
  - update adapter config before data
  - update intro and verses
  - apply padding
  - notify adapter once
  - scroll to target
  - reveal reader after first target placement
- Add a dedicated native event like `onInitialPositioned` with `{ verseNumber, verseKey }`.
- React Native should mark targeted translation positioning ready from `onInitialPositioned`, not from a generic ready/load event.

Exit criteria:

- Opening `/surah/2?startVerse=255` does not show verse 1, a preview row, or a correction jump.
- Opening `/surah/3?startVerse=1` lands naturally with intro + verse 1.
- Tajweed mode does not flash plain text before colored glyph rendering.
- No arbitrary timeout is used for target reveal.
- `npm run verify` passes. Completed.
- Android debug build passes. Completed.

Suggested handoff prompt:

> Implement Phase 1 from `docs/native-surah-reader-stabilization-handoff.md`. Make Android `NativeSurahReader` startup atomic by replacing separate mount-time native props with a single `readerState` prop. Apply settings/theme/data before first adapter notify, scroll to target before reveal, and emit `onInitialPositioned`. Keep React Native responsible for orchestration and keep behavior unchanged outside targeted native reader entry. Finish with `npm run verify` and an Android debug build.

## Phase 2 - Stable Native Updates

Status: Complete.

Goal: keep already-mounted native reader updates from disturbing scroll position.

Problem to solve:

- Broad `notifyDataSetChanged()` calls can trigger visible rebind/re-measure work.
- Mode/settings/audio changes may disturb the reader more than necessary.

Implementation target:

- Keep initial startup atomic from Phase 1.
- Audit every adapter update path:
  - active verse highlight
  - theme changes
  - font-size changes
  - word-by-word toggle
  - Tajweed toggle
  - translation attribution changes
  - audio active verse updates
- Replace broad updates with targeted updates when possible:
  - active verse: old row + new row only
  - theme/font/mode: preserve scroll anchor before update, restore after layout if needed
  - data changes: use stable IDs and targeted range updates if the item set is same length
- Avoid remounting `NativeSurahReader` for mode changes unless truly required.

Exit criteria:

- Toggling active audio highlight does not rebind the whole list.
- Changing theme/font/mode does not jump the visible verse.
- Switching plain/word-by-word/Tajweed does not show a wrong intermediate row.
- `npm run verify` passes. Completed.
- Android debug build passes. Completed.

Suggested handoff prompt:

> Implement Phase 2 from `docs/native-surah-reader-stabilization-handoff.md`. Keep `NativeSurahReader` mounted where possible and make native updates stable: reduce broad adapter invalidations, preserve scroll anchor across settings/mode changes, and update active verse rows narrowly. Do not change app orchestration or add new features. Finish with `npm run verify` and an Android debug build.

## Phase 3 - Entry Path Parity Audit

Status: Complete.

Goal: make every route into the native reader use the same landing contract.

Paths verified:

- Home surah card: `components/home/SurahCard.tsx`
- Home quick links: `components/home/HomeQuickLinksCard.tsx`
- Search Go To and search result verse: `components/navigation/useHeaderSearch.ts`, `app/(tabs)/search.tsx`, `components/search/ComprehensiveSearchModal.tsx`
- Recent / Last Read: `components/home/HomeRecentCard.tsx`, `components/bookmarks/last-read/LastReadCard.tsx`
- Bookmarks and folders: `app/(tabs)/bookmarks.tsx`
- Planner continue: `components/bookmarks/planner/PlannerCard.tsx`
- Mushaf-to-translation switch: `app/surah/[surahId].tsx`
- Same-surah Go To from header search: `components/navigation/useHeaderSearch.ts`

Landing behavior:

- New Surah reader entries pass `startVerse` through route params.
- Same-surah header Go To updates `startVerse` with `router.setParams`, which updates `readerState.targetVerse`.
- Mushaf-to-translation returns with `view: 'translations'` and the focused `startVerse`.
- Native initial placement is quiet: header/scrubber feedback and last-read writes are suppressed until `onInitialPositioned`.

Target verses to test:

- `2:255`
- `3:1`
- `5:1`
- `6:1`
- `70:41`

Modes to test:

- Plain translation
- Word-by-word
- Tajweed
- Dark mode
- Multiple translations with attribution

Exit criteria:

- All entry paths land on the same target without visible correction.
- Last-read updates do not spam during initial native positioning.
- Header/scrubber do not animate from programmatic initial placement.
- Docs are updated if the native reader contract changes. Completed in this document.
- `npm run verify` passes. Completed.
- Android debug build passes. Completed.

Suggested handoff prompt:

> Implement Phase 3 from `docs/native-surah-reader-stabilization-handoff.md`. Audit every app entry path into Android `NativeSurahReader` and make them use the same target landing contract. Test the listed verses and modes, fix inconsistencies only in the native reader integration path, and update docs if the contract changes. Finish with `npm run verify` and an Android debug build.

## Recommendation

The three stabilization phases are complete. Treat the Android native reader as the permanent translation reader path unless a future regression reopens this contract.
