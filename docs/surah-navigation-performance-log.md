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

### 11. FlashList v2 Update, Row Buckets, and MVCP Disabled

Files touched:

- `package.json`
- `package-lock.json`
- `app/surah/[surahId].tsx`

What changed:

- Updated `@shopify/flash-list` from `2.0.2` to `2.3.2`.
- Added `initialScrollIndexParams.viewOffset` so the header offset is applied during initial indexed render.
- Added `getItemType` layout buckets (`verse-xs` through `verse-xl`) based on Arabic/translation/word length.
- Disabled FlashList `maintainVisibleContentPosition` for the translation reader.

What improved:

- Reduced cases where one unusually tall measured verse poisoned the estimated height for all rows.
- Reduced extreme wrong landings such as a requested early verse landing much farther down the Surah.

Tradeoffs/problems:

- Still relies on FlashList estimated layouts for unknown dynamic-height rows.
- Did not fully remove the initial visible settle/jump by itself.

### 12. Hidden Real List + Opaque Target Preview Handoff

Files touched:

- `app/surah/[surahId].tsx`

What changed:

- Reintroduced a preview, but with a stricter contract than the earlier broken overlay:
  - the real FlashList is opacity-hidden and non-interactive while positioning;
  - the preview has an opaque background;
  - the real list is revealed only after hidden programmatic scrolling confirms the target verse is visible.
- Removed the experiment that skipped the first corrective scroll, because it could remove the visible jump but allow wrong landings.

What improved:

- The user should no longer see the quick correction jump during direct Go To entry.
- Wrong initial estimates can be corrected behind the preview instead of being exposed visually.

Tradeoffs/problems:

- This is still a masking/handoff workaround, not a true pre-measured reader.
- If FlashList viewability does not update promptly, the preview can remain visible longer than desired.
- The first visible screen may show only the target preview until the hidden real list reports a usable target range.

### 13. Surah Intro Restored for Go To

Files touched:

- `app/surah/[surahId].tsx`

What changed:

- The Surah intro/header card is rendered again even for direct verse jumps.
- Earlier, it was skipped for `startVerse > 1` because its dynamic height made initial offset estimation worse.

What improved:

- Scrolling upward from a direct target preserves the complete Surah context, including the intro.
- The intro no longer creates a visible startup jump because the real list is hidden during initial positioning.

Tradeoffs/problems:

- The intro still increases dynamic content before verse 1, so it can affect FlashList offset estimation internally.
- The handoff must stay correct; otherwise the intro can reintroduce wrong-offset behavior.

### 14. Wider Target Window and Stuck Preview Fix

Files touched:

- `app/surah/[surahId].tsx`
- `hooks/useSurahVerses.ts`

What changed:

- Increased screen-level target prefetch to roughly `±72` verses around the requested verse.
- Increased initial hook loading from a 3-page target window to a 5-page target window.
- Forced FlashList viewability recomputation after hidden programmatic scroll.
- Relaxed reveal from "target must be first visible row" to "target must be visible", with a retry fallback so the preview does not get stuck forever.

What improved:

- Reduces the case where the user jumps to a target and immediately scrolling shows only one loaded verse.
- Makes nearby verses load sooner around the target, especially in long Surahs.

Tradeoffs/problems:

- Loads more data up front around direct Go To targets, so cold entry may do more work.
- This should be validated in release/performance builds, because dev-mode timing can exaggerate both blankness and jumpiness.
- If the reader still lands randomly or stalls, further tuning FlashList is likely the wrong direction.

### 15. Full-Surah Network Hydration for Light Translation Mode

Files touched:

- `hooks/useSurahVerses.ts`
- `lib/surah/surahTranslationNetworkCache.ts`
- `lib/surah/surahReaderWarmup.ts`

What changed:

- Added a light-path network load that requests `/verses/by_chapter/:id` with `per_page=all` after offline cache lookup fails.
- This path is intentionally skipped when word payloads or Tajweed glyph hydration are active, because whole-Surah word data can be very large.
- If the full-Surah request fails, the hook falls back to the previous paged target-window loading.
- Added a short-lived shared in-memory cache for full-Surah translation responses, keyed by Surah, selected translations, and word language.
- The navigation warmup now primes that same network cache only when the offline preload cannot provide a complete local Surah for the selected translations.

What improved:

- Long Surahs such as `2`, `3`, `5`, and `6` no longer need several separate network page requests before surrounding verses are available.
- In normal translation mode, all verses for the current Surah can hydrate from one request, reducing the "only target area is loaded, other rows fill in for seconds" behavior.
- Entry points that already use `warmSurahReaderBeforeNavigation` can now benefit from the same full-Surah light cache when they are in online/fallback mode instead of only warming the small offline page window.

Tradeoffs/problems:

- Online-only translation reading still depends on network latency. Downloaded translations remain the best path for consistently instant navigation.
- Whole-Surah fetches increase one response payload size, but avoid request waterfalls. This is acceptable for the light translation path and should be validated in release builds.
- This path is intentionally not used for word-by-word or Tajweed mode. Those modes still need separate performance work because their payload and render cost are much heavier.

### 16. Shared Warmup Coverage For Non-Go-To Entry Points

Files touched:

- `components/navigation/useHeaderSearch.ts`
- `app/surah/[surahId].tsx`
- existing entry points already using `warmSurahReaderBeforeNavigation`, including Search, Comprehensive Search, Home Quick Links, Recent, Last Read, Bookmarks/folders, Planner Continue Reading, and Surah cards.

What changed:

- The same-Surah header Go To path now uses the shared warmup instead of only `preloadOfflineSurahNavigationPage`.
- The Surah Mushaf-to-translation switch now triggers the shared warmup in the background for the return verse.
- Opening the settings sidebar while in Surah Mushaf mode also warms the translation reader with the shared helper.

What improved:

- Go To is no longer the only path that can benefit from the full-Surah light network cache.
- Quick links, recents, bookmark/folder verse cards, search result verse links, planner continue reading, and same-Surah header jumps now share the same warmup/cached response path.
- Switching from Surah Mushaf back to translation has a better chance of landing with the surrounding translation verses already available.

Tradeoffs/problems:

- Warmup remains offline-first: downloaded selected translations should satisfy the warmup without starting the full-Surah network cache.
- Warmup is capped to avoid blocking navigation, so very slow offline checks or network responses can still finish after the screen opens.
- If the user immediately scrolls before the full-Surah response resolves, the reader can still briefly show only the target/nearby loaded rows.
- Downloaded translations remain the only fully deterministic way to avoid online fetch latency.

### 17. Rare Full-Surah Fallback Stall and Placeholder Layout Corruption

Files touched:

- `hooks/useSurahVerses.ts`
- `app/surah/[surahId].tsx`

What changed:

- The online full-Surah hydration request now gets a short fast-path window. If it does not resolve quickly, the reader immediately loads the target page window while the full-Surah request continues in the background.
- FlashList layout cache is cleared when loaded verse content changes from placeholders to real rows.
- The translation FlashList remounts on Surah Mushaf-to-translation handoff.
- FlashList recycling is disabled while some translation rows are still placeholders, then normal recycling resumes once all rows are hydrated.

What improved:

- A random slow `per_page=all` online fallback should no longer block the target window for `5-6 seconds`.
- Mushaf-to-translation switches should no longer expose rows overlapping after nearby/remaining verses load.
- Placeholder rows are no longer allowed to poison the measured layout for taller real verse rows.

Tradeoffs/problems:

- During incomplete online hydration, disabling recycling prioritizes correctness over maximum scroll efficiency.
- If the target-page request itself is slow, the reader can still wait on network fallback. Downloaded selected translations remain the strongest fix for deterministic speed.
- This does not solve word-by-word/Tajweed render cost; it only protects the light translation path and mode-switch handoff.

## Current Known Problem

As of the historical FlashList reader work, the remaining hard problem was:

- `initialScrollIndex` gets close quickly, but row-height estimation is not exact.
- The exact non-animated correction can still be visually noticeable.
- Hiding the list creates blank delay.
- Showing a preview overlay can create duplicated/overlapping content if the gate and real list are not perfectly synchronized.

The screenshot provided after the preview overlay attempt is evidence that overlay-based masking can break the reader visually.

After the later workaround, the current intended behavior is different:

- The target preview is allowed, but it must be opaque and the real list must be hidden until positioning is complete.
- Revealing the real list before hidden correction finishes can expose random/wrong FlashList positions.
- Keeping the preview too strict can make the screen look stuck on one verse, so reveal uses target-visible plus retry fallback.
- Long-Surah delayed row hydration is primarily a data-loading issue; the light translation path now uses full-Surah network hydration to avoid request waterfalls.
- Non-Go-To Surah entry points should use `warmSurahReaderBeforeNavigation`; direct calls to `preloadOfflineSurahNavigationPage` only warm offline data and miss the shared full-Surah network fallback cache.
- A slow full-Surah network fallback should not block target-page loading. Keep the fast-path race so random API stalls do not become blank entry delays.
- Placeholder-to-real row replacement can corrupt FlashList measurements. Clear layout cache when verse content signatures change, and avoid recycling placeholder cells while rows are still incomplete.
- If this still fails in release/performance testing, the next serious step is a native/measured reader surface or a deterministic offset model, not more FlashList estimate tuning.

## Phase G Update - Android Native Reader Becomes Permanent

Files touched:

- `app/surah/[surahId].tsx`
- `components/surah/native/NativeSurahReader.types.ts`
- `components/surah/native/NativeSurahReader.theme.ts`
- `android/app/src/main/java/com/anonymous/quranappmobile/nativesurahreader/*`

What changed:

- Android translation mode no longer falls back to the FlashList reader.
- Android waits for the native full-Surah payload and shows an explicit lightweight loading state while that payload is being prepared.
- FlashList target-position preview/handoff behavior is now non-Android fallback behavior only.
- iOS keeps the existing FlashList translation reader until an iOS native reader exists.
- Web keeps the FlatList reader path.

What improved:

- Android no longer depends on FlashList dynamic row-height estimation for Surah translation navigation.
- Plain, word-by-word, Tajweed, and active word-sync rows share the same Kotlin-backed scrolling surface.
- The Android reader path now matches the native migration direction: React Native owns orchestration; Kotlin owns row rendering and scroll positioning.
- Targeted entry now queues the requested adapter position synchronously during native state application, before RecyclerView can perform a first layout at the intro row. The list stays transparent until RecyclerView has laid out the requested row as the first visible row, or reached the stable end boundary with the requested final row visible when there is not enough trailing content to place it at the top. Ready/positioned events and reveal happen only after that check. This removes the brief Surah-intro/verse-1 frame that was most noticeable while Tajweed rows were binding without blanking short Surahs near their final verse.

Tradeoffs/problems:

- Android native mode now requires complete native payload availability before showing the reader.
- If a selected translation, word language, or Tajweed resource is not ready, Android shows loading/error/settings states instead of silently using the old FlashList safety path.
- iOS still has the historical FlashList caveats until Phase H.

## Files Most Involved

- `app/surah/[surahId].tsx`
  - Route params, Surah/Mushaf mode, Android native reader selection, iOS FlashList fallback, web FlatList fallback, initial jump logic, scrubber, overlay/header.
- `hooks/useSurahVerses.ts`
  - Offline/network verse page loading, words/tajweed inclusion, initial snapshots.
- `components/surah/VerseCard.tsx`
  - Arabic/tajweed/word-by-word rendering decision.
- `components/surah/WordByWordVerse.tsx`
  - Per-word token rendering and pressability.
- `lib/surah/offlineSurahPageCache.ts`
  - Offline page preloading/cache behavior.
- `lib/surah/surahReaderWarmup.ts`
  - Warm-before-navigation helper for offline page/surah data plus light full-Surah network cache.
- `lib/surah/surahTranslationNetworkCache.ts`
  - Shared full-Surah network response cache for light translation-mode navigation.

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
| FlashList 2.3.2 + row buckets | Reduces extreme wrong estimates | Still estimated, not exact |
| Disable MVCP | Stops chat-style anchor preservation from fighting jumps | Loses MVCP behavior, acceptable for reader |
| Hidden real list + opaque target preview | Hides correction jump and wrong first estimate | Can feel like one-verse preview if reveal stalls |
| Restore intro under hidden handoff | Keeps full Surah context | Adds dynamic height before verse 1 |
| Wider target prefetch | Nearby verses ready sooner | More upfront work around Go To |
| Full-Surah light network fetch | Avoids long-Surah page request waterfall | Larger single response; skipped for word-heavy modes |
| Shared full-Surah warmup cache | Other verse-entry paths benefit like Go To in online fallback mode | Slow network can still resolve after navigation |
| Full-Surah fast-path race | Prevents rare full-request stall from blocking target pages | Target pages can still depend on network if not downloaded |
| Clear layout cache / disable recycling during placeholders | Prevents overlap after rows hydrate | Temporarily less recycling while incomplete |
| Stop hidden word rendering | Major speed gain | Word tap behavior reduced outside word mode |
| Reduce word Pressables | Lower word-mode overhead | Word-by-word still heavy |

## Notes For Future Work

This section records observations only.

- The default translation reader should stay on the light path: one Arabic text render per verse when word-by-word/audio word sync are off.
- Any approach that hides the real list needs a visible, correctly synchronized replacement; otherwise the user experiences a blank.
- Any overlay/preview approach can introduce duplicate layers, wrong visible verse context, and text overlap.
- Any approach that skips exact correction can land on the wrong verse.
- Any approach that loads too much up front can reintroduce the long blank delay.
- Current workaround depends on a careful handoff: hidden real list positions first, preview covers it, then reveal after target visibility.
- If immediate scrolling after Go To still exposes unloaded rows, tune the target window carefully; too small feels hollow, too large delays entry.
- If normal translation mode still takes multiple seconds to hydrate a long Surah, check whether the full-Surah `per_page=all` request is failing and falling back to paged loading.
- If a new card/link opens `/surah/[surahId]`, route it through `warmSurahReaderBeforeNavigation` instead of calling the offline preload directly. The shared warmup should remain offline-first and only start network fallback after local data is incomplete/missing.
- If overlap appears after data loads, check whether placeholder rows are being measured and then replaced by taller real rows without a FlashList layout cache clear.
- Word-by-word mode remains a separate performance problem because many word views are expensive in React Native.
- Competitor apps appear to avoid this by using native/Flutter text/span rendering rather than many native controls per word.
