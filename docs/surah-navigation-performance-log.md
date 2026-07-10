# Surah Navigation Performance Work Log

Date recorded: 2026-07-11

This document is a work log, not an implementation plan. It records the goal, observations, attempted fixes, tradeoffs, and regressions seen while trying to make the Surah translation reader and Go To navigation feel instant.

## Goal

Make Surah translation navigation feel close to fast Quran apps:

- Jump directly to a target verse such as `2:255`.
- Avoid a blank render delay, skeleton/loading flash, or "render delay" state.
- Avoid visible scroll-from-top behavior.
- Avoid the first-entry adjustment where the page appears near the target and then visibly settles.
- Keep normal scrolling smooth in long Surahs.
- Keep Mushaf and translation switching usable.
- Preserve word-by-word, tajweed, audio word sync, settings, and verse actions without making the default reader heavy.

## Reference Apps Observed

### GreenTech Quran

Observed through ADB and UI behavior.

- Package: `com.greentech.quran`
- Version observed: `1.35.7`
- Android native app using Kotlin/Java style stack.
- Uses local SQLite/Room-style data, with DB files such as `quran.db`, `en_sahih.db`, `words.db`, `corpus.db`.
- Jump to `2:255` felt instant.
- Scrollbar scrubbing felt smooth.
- Switching between Mushaf and translation appeared to do a quick position adjustment, but it did not expose a long blank state.
- Likely uses native RecyclerView/ViewPager/TextView spans or equivalent native primitives, not one React Native native view per Arabic word in normal reader mode.

### IRD Quran

Observed through ADB and UI behavior.

- Package: `com.ihadis.quran`
- Version observed: `7.0.1`
- Flutter/Dart app.
- Uses Flutter/Skia rendering and local encrypted DB data, including `quran_main.db`.
- Jump navigation felt fast.
- No real-time Mushaf/translation switch was observed in the same way as GreenTech.
- Search/go-to UX had its own quirks, but direct verse navigation was still fast.
- Likely benefits from Flutter text/layout primitives and virtualized list behavior rather than many native Android child views.

## Local App Findings

### ADB Finding: Word Buttons Were a Major Cost

ADB showed the app process could reach very high memory and view counts on the Surah reader:

- Total PSS around `1.4 GB` in one measurement before cleanup.
- `Views` around `1500+`.
- UI hierarchy showed many `android.widget.Button` nodes with content-desc `Show word translation`.
- Visible Surah reader was rendering many per-word `Pressable`/button nodes.

Important finding:

- `app/surah/[surahId].tsx` passed `includeWords: Boolean(!isMushafView)`.
- `components/surah/VerseCard.tsx` rendered `WordByWordVerse` whenever `words` existed and tajweed mode was not active.
- This meant normal translation reading could still mount word-level native views even when the user was not intentionally using word-by-word display.

This was one of the clearest root causes for blank/render delay and heavy scrolling.

## Attempt Log

### 1. Stable List Key and Same-Surah Route Handling

Files touched:

- `app/surah/[surahId].tsx`
- `hooks/useSurahVerses.ts`

What changed:

- Made the translation list key stable per Surah instead of remounting on every `startVerse` change.
- Stopped treating `initialVerseNumber` as a full hook reload trigger.
- Allowed same-Surah Go To navigation to scroll the existing list instead of remounting it.

What improved:

- Reduced unnecessary list remounts.
- Same-Surah jumps became less disruptive.

Tradeoffs/problems:

- Did not solve the first-entry blank/render delay by itself.
- Did not solve inaccurate initial positioning for deep jumps.

### 2. Warm Before Navigation

Files touched:

- `lib/surah/surahReaderWarmup.ts`
- navigation/search/home/bookmark entry points that route to Surah
- `lib/surah/offlineSurahPageCache.ts`

What changed:

- Added a warmup helper to preload target Surah/page data before navigation.
- Used a short max wait so navigation would not block indefinitely.

What improved:

- Helped some route entries feel less cold.
- Reduced cases where target data was unavailable immediately.

Tradeoffs/problems:

- Warmup cannot fix a heavy render tree.
- Warmup cannot fix FlashList initial offset estimation.
- If render cost is the bottleneck, preloading data only moves the problem.

### 3. Target Window / Prepend Approach

What changed:

- Tried rendering/loading a target-centered window of verses first, then expanding around it.

What improved:

- Initial target could appear sooner in some cases.

Tradeoffs/problems:

- Scrolling upward later could jump back toward the start or verse 1.
- Loading chunks above/below introduced visible behavior after every group of verses.
- User observed "scroll a few verses upward, then it quickly goes to start of Surah."

Outcome:

- Reverted/abandoned.
- This approach created navigation correctness problems.

### 4. Whole Surah / Large Page Size Attempt

What changed:

- Tried loading a very large verse page, effectively closer to whole-Surah loading.

What improved:

- Reduced incremental load behavior while scrolling.

Tradeoffs/problems:

- Increased initial blank/render delay, especially on long Surahs.
- User observed a `2-3 second` blank state.

Outcome:

- Reverted/abandoned.
- Loading more data up front made first entry worse.

### 5. FlashList Initial Scroll Index and Larger Draw Distance

Files touched:

- `app/surah/[surahId].tsx`

What changed:

- Added `initialScrollIndex` for the target verse.
- Increased draw distance.
- Increased initial draw batch size.
- Skipped Surah intro/header for direct verse jumps.

What improved:

- Avoided obvious scroll-from-top behavior.
- The app could land near the target quickly.

Tradeoffs/problems:

- FlashList v2 estimates row height before rows are measured.
- Verse rows are highly variable height because Arabic text, translation count, font size, word-by-word, and tajweed change row height.
- `initialScrollIndex` often lands near the target, then exact correction scrolls again.
- If the correction is skipped, the app can land at the wrong verse, e.g. observed `2:249` for target `2:255`.
- If correction is allowed, user sees a small first-entry adjustment.

Outcome:

- Useful but incomplete.
- It solves "not from top" but does not solve "no visible settle."

### 6. Tajweed Parsing Cleanup

Files touched:

- `hooks/useSurahVerses.ts`

What changed:

- Avoided parsing/building tajweed glyph runs unless tajweed is enabled.
- Avoided parsing words unless words are needed.

What improved:

- Reduced avoidable data processing when tajweed/word features are disabled.

Tradeoffs/problems:

- Helpful but not sufficient for first-position correction.
- Does not solve FlashList height estimation.

### 7. Only Load Words When Needed

Files touched:

- `app/surah/[surahId].tsx`
- `components/surah/VerseCard.tsx`

What changed:

- Changed Surah screen from `includeWords: Boolean(!isMushafView)` to only include words when word-by-word or audio word seek is active.
- Changed `VerseCard` so it renders `WordByWordVerse` only when word-by-word or audio word seek is active.

What improved:

- Normal translation mode stopped secretly rendering every word as a native control.
- ADB showed the visible Arabic text as a single `TextView` in normal mode.
- This was the biggest meaningful performance improvement.

Tradeoffs/problems:

- Word-by-word mode still remains heavy because it naturally renders many word tokens.
- If word translation by tapping individual words is expected while word-by-word is disabled, this change removes that hidden interaction in favor of reader performance.

### 8. Disabled Unnecessary Word Pressables in Word-by-Word Mode

Files touched:

- `components/surah/VerseCard.tsx`
- `components/surah/WordByWordVerse.tsx`

What changed:

- When word-by-word translations are already visible and audio seek is not active, word tokens use plain `View` wrappers instead of disabled/unused `Pressable` buttons.
- `Show word translation` buttons are no longer created for every word in that state.

What improved:

- ADB view load dropped in word-by-word mode in one measurement, roughly from `740` attached views to `533`.
- Accessibility tree no longer showed `Show word translation` spam for visible word-by-word translation.

Tradeoffs/problems:

- Word-by-word is still much heavier than plain Arabic text.
- True GreenTech-level word-by-word performance likely needs a native/span-based renderer, not many React Native views.

### 9. Hide Translation Layer During Initial Positioning

Files touched:

- `app/surah/[surahId].tsx`

What changed:

- Added an opacity gate to hide the FlashList while it mounted near the target and then corrected to the exact verse.

What improved:

- Reduced visible first-entry adjustment in some cases.

Tradeoffs/problems:

- Created a blank render delay because the real list was hidden.
- User reported around `1 second` blank render delay even with word-by-word off.

Outcome:

- Bad tradeoff.
- Hiding the list without showing useful content is not acceptable.

### 10. Target Verse Preview Overlay While Real List Positions

Files touched:

- `app/surah/[surahId].tsx`

What changed:

- Reused `VerseCard` rendering to show the target verse as a preview while the real FlashList positions behind it.
- The real list was hidden only if the preview verse was available.

What improved:

- ADB sampled around `450ms` after jumping to `2:255` and saw `2:255` plus the Ayatul Kursi Arabic text, not a blank.

Tradeoffs/problems:

- User screenshot showed a serious visual regression:
  - Wrong visible context around `19:48`, `19:49`, `19:50`.
  - Arabic and translation text overlapped.
  - Preview/real list layers appeared to coexist incorrectly.
  - The overlay created a duplicated/misaligned reader surface instead of a seamless handoff.

Outcome:

- This approach avoids blank in one measured path but creates layer-overlap bugs.
- It should be considered risky and not a clean long-term solution.

## Current Known Problem

As of this log, the remaining hard problem is:

- `initialScrollIndex` gets close quickly, but row-height estimation is not exact.
- The exact non-animated correction can still be visually noticeable.
- Hiding the list creates blank delay.
- Showing a preview overlay can create duplicated/overlapping content if the gate and real list are not perfectly synchronized.

The screenshot provided after the preview overlay attempt is evidence that overlay-based masking can break the reader visually.

## Files Most Involved

- `app/surah/[surahId].tsx`
  - Route params, Surah/Mushaf mode, FlashList, initial jump logic, scrubber, overlay/header.
- `hooks/useSurahVerses.ts`
  - Offline/network verse page loading, words/tajweed inclusion, initial snapshots.
- `components/surah/VerseCard.tsx`
  - Arabic/tajweed/word-by-word rendering decision.
- `components/surah/WordByWordVerse.tsx`
  - Per-word token rendering and pressability.
- `lib/surah/offlineSurahPageCache.ts`
  - Offline page preloading/cache behavior.
- `lib/surah/surahReaderWarmup.ts`
  - Warm-before-navigation helper added during this work.

## Observed Tradeoff Summary

| Attempt | Helped | Broke / Tradeoff |
| --- | --- | --- |
| Stable list key | Reduced remounts | Did not solve first-entry positioning |
| Warmup | Better cold data readiness | Cannot fix heavy render or wrong offsets |
| Target window | Faster target in some cases | Scroll-up jumps and chunk loading |
| Whole Surah load | Less incremental loading | Worse initial blank delay |
| `initialScrollIndex` | Starts near target | Height estimate causes visible correction |
| Skip correction | Avoids adjustment | Lands on wrong verse |
| Allow correction | Lands correctly | Visible settle/jump |
| Hide list during correction | Hides settle | Creates blank delay |
| Preview overlay | Avoids blank in sample | Can overlap/duplicate content badly |
| Stop hidden word rendering | Major speed gain | Word tap behavior reduced outside word mode |
| Reduce word Pressables | Lower word-mode overhead | Word-by-word still heavy |

## Notes For Future Work

This section records observations only.

- The default translation reader should stay on the light path: one Arabic text render per verse when word-by-word/audio word sync are off.
- Any approach that hides the real list needs a visible, correctly synchronized replacement; otherwise the user experiences a blank.
- Any overlay/preview approach can introduce duplicate layers, wrong visible verse context, and text overlap.
- Any approach that skips exact correction can land on the wrong verse.
- Any approach that loads too much up front can reintroduce the long blank delay.
- Word-by-word mode remains a separate performance problem because many word views are expensive in React Native.
- Competitor apps appear to avoid this by using native/Flutter text/span rendering rather than many native controls per word.

