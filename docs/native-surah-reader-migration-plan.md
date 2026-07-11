# Native Surah Reader Migration Plan

## Summary

Build a small Android native reader proof first, then migrate only if it proves the performance hypothesis.

The first milestone is not a full rewrite and not another FlashList targeting workaround. It is a native rendering experiment:

- React Native keeps data loading, settings, offline checks, network fallback, verse actions, audio state, header, and scrubber orchestration.
- Android Kotlin owns only the scroll surface and verse row rendering for normal translation mode.
- The first native reader receives already-normalized full-Surah light verse data from React Native.
- Word-by-word, Tajweed, and audio word sync stay on the existing React Native path until native rendering is proven.

If the Android proof works in release/performance testing, continue toward full Android replacement for normal translation reading. iOS gets the same component contract later.

## Why This Direction

The work log in `docs/surah-navigation-performance-log.md` shows that FlashList tuning helped but did not remove the core issue:

- Dynamic verse heights make initial offset estimation imprecise.
- Exact correction can be visibly noticeable.
- Hiding the list creates blank delay.
- Preview overlays can duplicate or overlap content if handoff timing is imperfect.
- Word-heavy React Native rows are expensive, especially when every word becomes a native control.

The next serious experiment should therefore be a native measured reader surface, not more preview, hidden-list, target-window, or correction-retry tuning.

## Key Correction To The Original Plan

Do not make Kotlin own offline SQLite loading in the MVP.

The existing TypeScript side already handles:

- selected translations
- offline/download state
- bundled Arabic text fallback
- online full-Surah fallback
- cache warmup
- word language
- settings
- verse action payloads
- last-read reporting
- Mushaf-to-translation return flow

Duplicating that in Kotlin would create a second data pipeline too early. The MVP should pass complete light Surah data from React Native into the native reader and let Kotlin focus on rendering and exact scroll behavior.

## Native Reader Contract

Create one React Native-facing component:

`NativeSurahReader`

### Props

- `surahId`
- `targetVerse`
- `verses`
- `settings`
- `activeVerseKey`
- `topInsetPx`
- `bottomInsetPx`
- `theme`

### Verse Shape

Use only light translation fields in the first version:

- `verseKey`
- `verseNumber`
- `verseApiId`
- `arabicText`
- `translationItems`

Do not include word-by-word payloads or Tajweed glyph runs in the MVP.

### Events

- `onReady`
- `onVisibleVerseChange`
- `onVerseActionPress`
- `onScroll`

### Command

- `scrollToVerse(verseNumber, animated)`

## Phase 0 - Branch And Baseline

Goal: prepare a safe branch and record current behavior before changing the reader.

Tasks:

- Create a branch such as `native-surah-reader-android-poc`.
- Keep the current React Native FlashList reader intact.
- Record baseline release/performance behavior for direct Go To:
  - `2:255`
  - `3:1`
  - `5:1`
  - `6:1`
  - `70:41`
- Record whether the current path shows blank delay, visible correction, wrong landing, overlap, or delayed hydration.

Exit criteria:

- Branch exists.
- Baseline notes are added to this document or a new dated log entry.
- No behavior change yet.

Suggested handoff prompt:

> Create the native-surah-reader-android-poc branch and add a short baseline note for the current Surah Go To behavior. Do not implement the native reader yet.

## Phase 1 - Native Component Shell

Goal: prove the Expo/React Native native-view plumbing works before adding real reader behavior.

Tasks:

- Add an Android native view named `NativeSurahReader`.
- Expose it to React Native.
- Render a simple native placeholder view on Android.
- Add a TypeScript wrapper component.
- Keep iOS/web using the existing React Native reader.
- Do not replace the Surah screen yet.

Exit criteria:

- App builds on Android.
- Placeholder native component can be mounted in a temporary/local test surface.
- `npm run type-check` passes.

Suggested handoff prompt:

> Implement only the Android NativeSurahReader shell and TypeScript wrapper. It should render a simple native placeholder and not replace the production Surah reader yet.

## Phase 2 - Static RecyclerView Proof

Goal: verify native RecyclerView renders rows and can jump exactly with fixed/static sample data.

Tasks:

- Implement Kotlin `RecyclerView`.
- Render simple verse rows using native `TextView`.
- Use `LinearLayoutManager`.
- Use stable adapter IDs:
  - prefer `verseApiId` when available
  - otherwise use `surahId * 1000 + verseNumber`
- Use `setHasStableIds(true)`.
- Expose `scrollToVerse(verseNumber, animated)`.
- Implement `scrollToPositionWithOffset(targetIndex, topInsetPx)`.
- Add `clipToPadding=false`.
- Apply top and bottom padding from `topInsetPx` and `bottomInsetPx`.

Exit criteria:

- Static rows render on Android.
- Calling `scrollToVerse` lands on the requested row.
- No production Surah screen replacement yet.

Suggested handoff prompt:

> Extend the NativeSurahReader shell into a static RecyclerView proof with sample verse rows and an imperative scrollToVerse command. Do not wire real Surah data yet.

## Phase 3 - Real Light Surah Data From React Native

Goal: feed real complete light Surah data from the existing React Native data path.

Tasks:

- Reuse `useSurahVerses` from `app/surah/[surahId].tsx`.
- Mount the native reader only when normal light translation data is ready.
- Pass complete available `verses` into native.
- Keep offline-not-installed and error states in React Native.
- Keep network/offline hydration logic in React Native.
- Do not let Kotlin query SQLite in this phase.

Normal light mode means:

- `!isMushafView`
- `!settings.showByWords`
- `!settings.tajweed`
- no audio word sync requirement

Exit criteria:

- Android native reader renders real Surah translation rows.
- Verse text and selected translations match the existing React Native reader.
- Unsupported modes still use the existing React Native FlashList path.

Suggested handoff prompt:

> Wire NativeSurahReader to real Surah light translation data from the existing useSurahVerses path. Keep Kotlin out of SQLite. Use the native reader only for normal Android translation mode.

## Phase 4 - Replace Android Normal Translation Mode

Goal: use native rendering for the real Android normal translation reader path.

Tasks:

- In `app/surah/[surahId].tsx`, choose native reader only for Android normal light translation mode.
- Keep React Native FlashList for:
  - web
  - iOS
  - word-by-word
  - Tajweed
  - audio word sync
  - any unsupported state
- Remove native-reader preview experiments from this path if they are no longer needed.
- Keep `VerseActionsSheet` in React Native.
- Native action button sends verse payload to React Native.

Exit criteria:

- Android normal translation mode uses native reader.
- All unsupported modes still work through the existing reader.
- Verse action sheet opens from native row action button.

Suggested handoff prompt:

> Replace only Android normal light translation mode with NativeSurahReader. Keep all unsupported modes on the existing FlashList reader and keep the existing VerseActionsSheet.

## Phase 5 - Reader State Wiring

Goal: connect native scrolling to existing app behavior.

Tasks:

- Native `onVisibleVerseChange` updates:
  - visible verse number
  - last-read state
  - scrubber state
- Existing scrubber calls native `scrollToVerse`.
- Native `onScroll` feeds the collapsible reader header.
- `activeVerseKey` updates native row highlight for verse-level audio playback.
- Keep existing Mushaf-to-translation route behavior.

Exit criteria:

- Header collapse still works.
- Verse scrubber still works.
- Last Read updates correctly.
- Active audio verse highlight works at verse level.
- Mushaf-to-translation returns to the intended verse.

Suggested handoff prompt:

> Wire NativeSurahReader visible-verse, scroll, scrubber, last-read, and activeVerseKey behavior into the existing Surah screen. Do not add word-by-word or Tajweed yet.

## Phase 6 - Styling And Parity Polish

Goal: make the native normal reader visually match the current reader closely enough to ship behind Android normal mode.

Tasks:

- Match light and dark colors.
- Match Arabic font size.
- Match translation font size.
- Match row spacing.
- Match verse number/action placement.
- Match top header inset and bottom audio inset.
- Match selected translation attribution when multiple translations are enabled.

Exit criteria:

- Normal translation rows visually match the existing reader closely.
- No row overlap.
- Text remains readable across configured font sizes.
- Dark and light mode both pass manual review.

Suggested handoff prompt:

> Polish NativeSurahReader styling for parity with the existing normal translation reader, including dark/light theme, font sizes, spacing, insets, and multi-translation attribution.

## Phase 7 - Performance Acceptance

Goal: decide whether native Android reader should continue toward full adoption.

Test in Android release/performance build, not only Expo dev mode.

Acceptance targets:

- Direct Go To `2:255` shows the correct target verse on first visible render.
- Direct Go To does not visibly scroll from top.
- Direct Go To does not show a correction jump.
- No blank screen before first useful content.
- Scrolling up from target preserves full Surah context.
- Fast scrubber jumps remain responsive.
- No overlap after data/settings changes.
- Memory and native view count are materially lower than the previous word-heavy path.

Required test cases:

- `2:255`
- `3:1`
- `5:1`
- `6:1`
- `70:41`
- same-Surah Go To
- Search result to verse
- Recent/Last Read to verse
- Bookmark/folder verse card to verse
- Planner continue reading
- Mushaf to Translation
- airplane mode with downloaded selected translations
- selected translation not downloaded while offline

Exit criteria:

- Performance result is clearly better than FlashList.
- No correctness regression in normal Android translation mode.
- Decision is recorded: continue native migration, pause, or revert.

Suggested handoff prompt:

> Run release/performance validation for the Android native normal translation reader using the acceptance checklist in docs/native-surah-reader-migration-plan.md. Record findings and decide whether to continue.

## Phase 8 - Later Native Feature Expansion

Only after Phase 7 passes:

- Implement word-by-word natively using spans or efficient native text/token rendering.
- Implement Tajweed natively using `Spannable` or a dedicated native text renderer.
- Implement audio word sync natively.
- Consider moving offline SQLite reads native-side only if there is a measured reason.

Do not block the initial native reader decision on these modes.

## Phase 9 - iOS After Android Is Proven

After Android native normal reader is accepted:

- Port the same `NativeSurahReader` contract to Swift.
- Use `UICollectionView` or `UITableView`.
- Keep React Native data ownership at first.
- Use the same phased approach: shell, static proof, real light data, state wiring, parity, performance.

## Non-Goals For The MVP

- No Kotlin SQLite data pipeline.
- No permanent redesign of the Surah screen.
- No native word-by-word mode.
- No native Tajweed mode.
- No native audio word sync.
- No removal of the existing FlashList path until unsupported modes have replacements.
- No more preview-overlay or hidden-list masking experiments as the main strategy.

## Final Decision Rule

Continue the native migration only if the small Android native proof demonstrates a real improvement:

- correct first landing
- no blank delay
- no visible correction jump
- smooth normal scrolling
- acceptable visual parity

If the native proof does not beat the current reader in release/performance testing, stop and reassess before expanding the migration.
