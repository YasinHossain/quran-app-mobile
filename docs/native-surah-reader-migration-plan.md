# Native Surah Reader Migration Plan

## Current Status

Branch: `native-surah-reader-android-poc`

The Android native reader proof is now past the original "should we try native?" stage.

Current implementation:

- Android has a Kotlin `NativeSurahReader` backed by `RecyclerView`.
- React Native exposes `components/surah/native/NativeSurahReader.tsx`.
- `app/surah/[surahId].tsx` uses the native reader for Android normal light translation mode.
- React Native still owns data loading, selected translations, offline/download state, network fallback, settings, verse actions, header, audio state, non-Android scrubbers, and Mushaf switching. The Android translation reader owns its RecyclerView fast scroller.
- Native currently renders real full-Surah light verse data from React Native.
- Native currently supports:
  - direct target verse landing
  - native scrolling
  - native edge fast scrolling and inertial fling
  - verse action press back to React Native
  - visible verse reporting
  - last-read updates
  - scrubber scroll commands
  - verse-level active audio highlight
  - light/dark theme colors
  - Arabic and translation font sizes
  - multi-translation attribution
  - native word-by-word rows
  - native Tajweed glyph-run rows

Current native gate:

- Android only
- translation view only
- content loaded
- full native payload available for the selected translation mode

The direction looks correct if the native reader feels significantly faster and closer to a real native Quran reader. From here, the plan should shift from "prove native" to "complete native reader parity in controlled modules."

## Important Principle

Do not rebuild the whole app in native.

Keep React Native responsible for app orchestration:

- route params
- settings sidebar
- selected translations
- downloads/offline state
- audio player state and controls
- verse action sheet
- bookmarks/planner/tafsir/share
- search/header and non-native scrubber overlays
- Mushaf-to-translation switching

Make Kotlin responsible for the reading surface:

- row rendering
- exact scrolling
- native fast-scroll indicator and drag handling
- native text layout
- word token layout
- Tajweed spans
- word-sync highlight rendering
- selection/tap behavior inside the verse row

This keeps the native migration focused on the real bottleneck: the reader surface.

## Architecture Guardrail

Do not let the new native reader become another single 2000-line feature file.

The old Surah screen already carries too many responsibilities:

- route parsing
- data loading
- mode selection
- list rendering
- settings wiring
- audio wiring
- scrubber wiring
- verse actions
- Mushaf switching
- navigation warmup
- performance workarounds

Future native-reader work should be split by responsibility before adding advanced modes.

Recommended React Native structure:

```text
components/surah/native/
  NativeSurahReader.tsx
  NativeSurahReader.types.ts
  NativeSurahReader.mapper.ts
  NativeSurahReader.theme.ts
  useNativeSurahReaderGate.ts
  useNativeSurahReaderEvents.ts
  useNativeSurahReaderCommands.ts
```

Recommended Android structure:

```text
android/app/src/main/java/com/anonymous/quranappmobile/nativesurahreader/
  NativeSurahReaderView.kt
  NativeSurahReaderViewManager.kt
  NativeSurahReaderPackage.kt
  NativeVerse.kt
  NativeReaderTheme.kt
  NativeVerseAdapter.kt
  NativeVerseViewHolder.kt
  NativeVerseRowView.kt
  NativeWordLayoutView.kt
  NativeTajweedTextFactory.kt
  ReadableMapExtensions.kt
```

Ownership guidance:

- `app/surah/[surahId].tsx` should decide which reader mode is active and compose the screen.
- Native reader mapping should live outside the route file.
- Native reader event handlers should live in a hook.
- Native command/ref handling should live in a hook.
- Kotlin parsing/data classes should not live inside the view file.
- Kotlin row rendering should not live inside the view manager.
- Word-by-word, Tajweed, and audio sync should be separate renderer modules, not conditional blocks piled into one method.

Exit rule:

- If a single file grows past roughly 400-500 lines, split it before adding the next feature.
- If a function grows past roughly 80-100 lines, extract the responsibility before adding branches.
- Do not add new mode logic directly into `app/surah/[surahId].tsx` unless it is only a small composition decision.

## Immediate Recommendation

Do not jump directly into every advanced mode.

Next practical step:

1. Split the current native-reader integration into standard modules.
2. Stabilize the native light reader as the permanent Android normal reader.
3. Define the expanded native verse contract once.
4. Add native word-by-word.
5. Add native Tajweed.
6. Add native audio word sync.
7. Only then remove the FlashList reader for Android.

The old FlashList path should remain temporarily as a safety path until the native reader supports all Android translation modes.

## Phase 0 - Modularize Current Native Reader Integration

Goal: prevent the native migration from becoming another oversized Surah route file or oversized Kotlin view file.

Tasks:

- Move native reader TypeScript types into `components/surah/native/NativeSurahReader.types.ts`.
- Move Surah-verse-to-native-verse mapping into `components/surah/native/NativeSurahReader.mapper.ts`.
- Move native theme construction into `components/surah/native/NativeSurahReader.theme.ts`.
- Move the native-mode eligibility logic into `components/surah/native/useNativeSurahReaderGate.ts`.
- Move native reader event handlers into `components/surah/native/useNativeSurahReaderEvents.ts`.
- Move native scroll command helpers into `components/surah/native/useNativeSurahReaderCommands.ts` if command logic grows.
- Split Kotlin data classes and parsing helpers out of `NativeSurahReaderView.kt`.
- Split Kotlin adapter/row rendering out of `NativeSurahReaderView.kt`.
- Keep behavior unchanged.

Exit criteria:

- Native light reader behavior is unchanged.
- `app/surah/[surahId].tsx` gets smaller or at least stops growing.
- Kotlin native reader files are split by responsibility.
- `npm run verify` passes.
- Android Kotlin compile passes.

Suggested handoff prompt:

> Refactor the current NativeSurahReader integration into smaller TypeScript and Kotlin modules before adding new features. Keep behavior unchanged. Do not implement word-by-word or Tajweed yet.

## Phase A - Stabilize Native Light Reader

Goal: make the current native light reader robust before layering heavy features onto it.

Tasks:

- Verify target landing in release/performance build:
  - `2:255`
  - `3:1`
  - `5:1`
  - `6:1`
  - `70:41`
- Verify same-Surah Go To.
- Verify Search, Recent, Last Read, bookmarks/folders, Planner continue, and Mushaf-to-Translation.
- Verify airplane mode with downloaded selected translations.
- Verify selected translation not downloaded while offline.
- Add Arabic font face support to native rows.
- Confirm top header inset and bottom audio inset still line up after orientation/font-size/theme changes.
- Confirm native row action opens the existing `VerseActionsSheet` with correct data.
- Confirm native `onVisibleVerseChange` does not spam last-read writes during fast scrolling.

Exit criteria:

- Native light reader is clearly faster than FlashList.
- No blank delay.
- No visible correction jump.
- No wrong target landing.
- No row overlap.
- `npm run verify` passes.
- Android native build passes.

Suggested handoff prompt:

> Stabilize the current Android NativeSurahReader light mode. Add missing Arabic font face support, validate target landing and entry paths, and keep React Native orchestration unchanged.

## Phase B - Freeze The Native Reader Contract

Goal: expand the data contract before implementing word-by-word/Tajweed/audio sync so each mode does not invent its own payload shape.

Extend `NativeSurahReaderVerse` to support optional native-only fields:

- `words`
- `tajweedRuns`
- `audioWordSync`
- `displayMode`

Suggested word shape:

- `id`
- `position`
- `uthmani`
- `translationText`
- `charTypeName`
- `codeV2`
- `pageNumber`

Suggested settings shape:

- `arabicFontSize`
- `translationFontSize`
- `arabicFontFace`
- `showTranslationAttribution`
- `showByWords`
- `tajweed`
- `wordLang`
- `audioWordSyncEnabled`

Suggested native row modes:

- `plain`
- `wordByWord`
- `tajweed`
- `audioWordSync`

Exit criteria:

- TypeScript types and Kotlin parsing support the expanded optional payload.
- Plain native reader behavior is unchanged.
- Unsupported optional data can be omitted without breaking rows.

Suggested handoff prompt:

> Expand the NativeSurahReader TypeScript and Kotlin data contract for optional words, Tajweed, and audio word sync payloads, but keep rendering behavior unchanged for plain mode.

## Phase C - Native Word-By-Word Rendering

Goal: replace the React Native word-by-word row cost with native row rendering.

Tasks:

- Allow native reader when `settings.showByWords` is true.
- Pass words from the existing `useSurahVerses` path.
- Render Arabic word tokens natively.
- Render visible word translations under tokens.
- Avoid one native `Button` per word.
- Use lightweight native views or spans.
- Keep row action menu behavior intact.
- Preserve accessibility without creating noisy repeated "Show word translation" controls.
- Keep word-by-word disabled from native only if required data is missing.

Design direction:

- Prefer a custom native token layout or efficient span/text layout.
- Avoid a deeply nested layout per word if performance starts regressing.
- Word tap translation can be added later if visible word-by-word translations are already present.

Exit criteria:

- Android word-by-word no longer falls back to FlashList.
- Scrolling remains smooth in long Surahs.
- View count/memory are materially better than old RN word-by-word.
- Existing settings toggle works.

Suggested handoff prompt:

> Implement native Android word-by-word rendering in NativeSurahReader using the existing word data from useSurahVerses. Avoid one Button per word and keep the existing React Native action sheet.

## Phase D - Native Tajweed Rendering

Goal: support Tajweed mode without falling back to React Native FlashList.

Status: implemented for Android translation mode. React Native still owns loading/enrichment of QCF Tajweed V4 glyph runs and font files; Kotlin renders ready runs with `Spannable` typeface spans and falls back to plain Arabic text when run/font data is unavailable.

Tasks:

- Allow native reader when `settings.tajweed` is true.
- Reuse existing Tajweed glyph/run data where possible.
- Render Tajweed coloring with Android `Spannable` or a dedicated native text renderer.
- Respect selected Arabic font face and font size.
- Preserve plain fallback if Tajweed data/fonts are not ready.
- Avoid blocking first render on expensive parsing when plain text can appear first.

Exit criteria:

- Android Tajweed mode renders in native reader.
- No visible row overlap after Tajweed data/fonts load.
- Switching Tajweed on/off from settings does not corrupt scroll position.
- Target landing remains correct.

Suggested handoff prompt:

> Add native Android Tajweed rendering to NativeSurahReader using Spannable or an efficient native text renderer. Keep target landing stable and preserve plain fallback while Tajweed assets load.

## Phase E - Audio Playback And Word Sync

Goal: keep the audio system in React Native but render active verse and word sync highlights natively.

Status: implemented for the Android native reader. Active-word ticks update attached Kotlin holders
directly and invalidate the outer native surface on the next frame, without waiting for a
`RecyclerView` scroll pass or queuing full-row refreshes. Word tap enablement and audio-bar inset
changes are updated in place. Plain-reader word data and token rows are prepared before playback,
so opening the audio player does not reload the verse model or replace visible Arabic rows. Tajweed
continues to use its glyph renderer without word highlighting, matching the React Native reader.
When playback advances to another verse, Kotlin smoothly centers it in the reader viewport. Verses
taller than the viewport use a safe top offset instead; word-level ticks repaint in place and do not
trigger scrolling.

React Native should continue to own:

- play/pause
- reciter/audio source
- audio bar
- verse-level playback state
- timing data source

Native reader should own:

- active verse row highlight
- active word highlight
- optional tap-to-seek word event

Tasks:

- Pass active verse key to native.
- Pass active word position/id to native when available.
- Add event from native word tap to React Native if tap-to-seek is supported.
- Ensure rows update efficiently when active word changes rapidly.
- Avoid full adapter refresh on every word tick if possible.

Exit criteria:

- Verse-level audio highlight still works.
- Word-level sync works without FlashList.
- Audio playback controls remain unchanged.
- Fast word highlight updates do not jank scrolling.

Suggested handoff prompt:

> Add native active-word audio sync rendering to NativeSurahReader while keeping audio playback ownership in React Native. Avoid full row refreshes on every word tick.

## Phase F - Settings Parity

Goal: make every reader-affecting setting update the native reader correctly.

Status: implemented for mounted Android readers. Kotlin rebinds attached `RecyclerView` holders and
runs an explicit next-frame native measure/layout pass after reader-state changes, so theme, font,
translation, word-by-word, and Tajweed updates no longer wait for a user-initiated scroll.

Verify these settings:

- Arabic font size
- Translation font size
- Arabic font face
- Translation selection
- Multiple translations and attribution
- Word-by-word toggle
- Tajweed toggle
- Theme
- Content language where it affects labels/resources
- Word language
- Mushaf/translation switch

Exit criteria:

- Settings sidebar behavior remains React Native.
- Native reader updates without remounting unless remount is intentionally required.
- Scroll position is preserved when reasonable.
- Unsupported/temporarily unavailable settings are clearly gated, not silently broken.

Suggested handoff prompt:

> Audit and complete settings parity for NativeSurahReader. Keep the settings UI in React Native and make native rows respond correctly to every reader setting.

## Phase G - Remove Android FlashList Translation Reader

Goal: ditch FlashList for Android translation reading only after native supports all Android translation modes.

Status: implemented for the Surah translation reader. Android now gates translation mode to `NativeSurahReader`; FlashList remains available for iOS until an iOS native reader exists, and web keeps its FlatList path.

Tasks:

- Remove Android translation-mode FlashList usage.
- Keep web/iOS FlashList or platform fallback until iOS native reader exists.
- Remove Android-only preview/handoff/correction code made obsolete by native reader.
- Keep shared route/search/settings/audio/action-sheet logic.
- Update docs:
  - `docs/components.md` if native component docs are useful
  - `docs/surah-navigation-performance-log.md`

Exit criteria:

- Android translation reader never uses FlashList.
- Web/iOS still work.
- `npm run verify` passes.
- Android native build passes.
- Release/performance testing passes.

Suggested handoff prompt:

> Remove the Android FlashList translation-reader path now that NativeSurahReader supports plain, word-by-word, Tajweed, and audio word sync. Preserve web/iOS fallback.

## Phase H - iOS Native Reader

Goal: port the proven native reader contract to iOS.

Tasks:

- Implement Swift `NativeSurahReader` using `UICollectionView` or `UITableView`.
- Keep the same React Native props/events/commands.
- Start with plain light translation mode.
- Then port word-by-word, Tajweed, and audio word sync.
- Remove iOS FlashList only after iOS reaches parity.

Exit criteria:

- iOS native reader reaches the same feature set as Android native reader.
- The shared React Native Surah screen can select native reader on both Android and iOS.

Suggested handoff prompt:

> Port the proven NativeSurahReader contract to iOS, starting with plain light translation mode and keeping React Native data ownership.

## Current Known Gaps

- Native reader does not yet support word-level audio sync.
- Current native mode may still be active while audio is visible; decide whether verse-level highlight is acceptable until word sync lands, or temporarily fall back when word sync is required.
- Kotlin currently uses `notifyDataSetChanged()` broadly; optimize updates before word-sync ticks.
- Android native files are intentionally tracked inside an otherwise generated `/android` folder. Keep `.gitignore` exceptions tight.

## Recommended Next Step

Do **Phase A** next.

Even though the reader feels fast now, stabilize the plain native path before adding word-by-word/Tajweed/audio sync. Once the base native row is solid, each advanced mode becomes an additive native rendering feature instead of a moving target.

After Phase A, do Phase B immediately. Freezing the contract before adding word-by-word will save a lot of churn.
