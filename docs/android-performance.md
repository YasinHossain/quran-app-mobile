# Android Performance Program

## Purpose

This is the living handoff for Android performance work on Quran App Mobile. Every AI session must read this document and `AGENTS.md`, execute only the requested phase, save bulky output under `.artifacts/performance/`, and update this document before finishing.

The immediate problem is high and apparently retained memory around the Surah reader. The broader release goal also covers startup, rendering smoothness, app size, crashes/ANRs, battery, network, storage, and low-memory behavior.

## Progress summary — 2026-09-23

**Acceptance principle:** reducing RAM is not an improvement if reading becomes slower, jumps,
loses functionality, or becomes less reliable offline. Preserve the current experience and change
one measured cause at a time. A language change or application rewrite is not justified by the evidence.

| Work | Outcome | What the evidence establishes |
|---|---|---|
| Hidden Mushaf WebView during translation reading | Fixed | Historical same-screen comparison saved 67.4 MB RSS / 43.8 MB PSS; the on-demand transition also worked offline. |
| Hermes/Worklets idle-memory regression | SDK 57 fix implemented; idle reduction verified | Five fresh launches: main process **297.21 MiB RSS / 186.75 MiB PSS**, down **108.12 / 106.65 MiB** from SDK 56. Widget: **20.31 MiB PSS**, reported separately. Full journey/readiness acceptance remains open. |
| Experimental Worklets Bundle Mode | Diagnostic only; not enabled in the current build | Approximately 284 MiB RSS demonstrated an opportunity. It is not the current RAM reading or an additional saving to add to the SDK upgrade. |
| Bounded reader word window | Reverted | Memory improved, but loading and scroll regressions made the implementation unacceptable. Do not restore that implementation as the next experiment. |
| Bundled Quran payload as the main idle cause | Not supported by the isolates | Excluding it changed RSS by only about 5 MiB in a screening run; it did not explain the large native allocation overhead. |
| Reader copies, repeated conversion and retention on SDK 57 | Baseline, trace and one reuse isolate complete | A post-back heap held one 286-verse/6,607-word Kotlin reader. In three matched diagnostic journeys, unchanged updates parsed the full model 22/22 times in control and reused it 21/21 times in the isolate. The reuse removed about 4.47 MB of Java-thread allocation and 29.1 ms of parsing per eligible update, but did not establish a retained-RAM saving. |
| Native reader model reuse | Implemented; emulator behavior checks passed | Unchanged content/configuration reuses one parsed snapshot and its hash. Changed content, settings and theme invalidate it. Release A/B did not establish a retained-memory or scrolling improvement; physical-device validation remains open. |

These results cover different app states and builds; **do not add their savings together**. Historical
reader costs must be remeasured after the runtime update. The recorded SDK 57 release build and
`npm run verify` passed. The ten-cycle reader baseline and a warm content-readiness bound are now
recorded below; mode, offline/audio, physical-device and matched readiness comparisons remain open.

## Agent operating rules

1. Preserve all existing user changes. Inspect `git status` before editing.
2. Never run `expo prebuild --clean`; this repository contains custom native Android reader code.
3. Use a non-debuggable, release-like build for measurements. Record the exact commit, dirty state, build command, package version, device, Android version, settings, and test date.
4. Do not clear application data or silently change saved reader settings. When a scenario requires different settings, record the change and restore the original settings afterward.
5. Use the same journey, waits, and device for before/after comparisons. Run enough iterations to distinguish a stable plateau from continuing growth.
6. Do not mix baseline collection, diagnosis, and implementation. Complete the requested phase and its exit gate before proceeding.
7. Store CSV, traces, heap dumps, screenshots, and long logs in `.artifacts/performance/`. Keep this document short by recording only summaries, conclusions, artifact paths, and the next action.
8. Label statements as **confirmed**, **supported**, or **hypothesis**. Do not present a suspected cause as proven.
9. Run tests proportional to the phase. Phase 1 and read-only Phase 2 do not require the full application verification suite unless source behavior changes.
10. End each session with: work completed, measurements, files changed, unresolved issues, phase status, and the exact next recommended phase.

Use this prompt to start a session:

> Read `AGENTS.md` and `docs/android-performance.md` completely. Execute Phase N only and carry it to its exit gate. Reuse existing artifacts instead of repeating completed discovery. Preserve existing user changes, keep reporting concise, and update the living document before finishing.

## Known environment and initial observations

These numbers are exploratory observations collected on 2026-09-15. They are not yet the controlled Phase 1 baseline.

- Device: Android API 36 `sdk_gphone64_arm64` emulator
- Device memory: approximately 2.5 GB
- Resolution/density: 1080 x 2400 at 420 dpi
- Our package: `com.anonymous.quranappmobile`, version `1.0.0` (1)
- Comparator: Al Quran by Greentech, `com.greentech.quran`, version `1.35.7` (165)
- Our installed app was non-debuggable and used Hermes/New Architecture.
- PSS is useful for a system snapshot. RSS is the primary metric for tracking one process through a repeated journey; also record anonymous RSS and swap.

### Exploratory same-emulator comparison

| Scenario | Total PSS | Total RSS | Native heap PSS | Views | Notes |
|---|---:|---:|---:|---:|---|
| Our app, cold home | 297,258 KB | 407,264 KB | 176,800 KB | ~586 | Fresh process |
| Our app, Al-Baqarah loaded | 468,644 KB | 607,996 KB | 268,904 KB | ~680 | Clean journey |
| Our app, home after back | 447,229 KB | 569,480 KB | 237,208 KB | ~671 | Memory remained elevated |
| Our app, later repeated Al-Baqarah visit | 509,858 KB | 649,656 KB | 295,824 KB | ~680 | Suggests growth; not proof of a leak |
| Greentech, home | 89,227 KB | 210,108 KB | 21,269 KB | 219 | Same emulator |
| Greentech, Al-Baqarah loaded | 104,613 KB | 226,400 KB | 31,562 KB | 461 | Same emulator |
| Greentech, after fixed scroll | 104,535 KB | 226,360 KB | 32,574 KB | 557 | Memory stayed stable |

Fixed eight-swipe exploratory `gfxinfo` result:

| App | Frames | Janky frames | P50 | P90 | P95 | P99 |
|---|---:|---:|---:|---:|---:|---:|
| Greentech reader | 210 | 1 (0.48%) | 17 ms | 17 ms | 18 ms | 19 ms |
| Our reader | 244 | 6 (2.46%) | 17 ms | 17 ms | 18 ms | 19 ms |

These results support investigating our architecture, but they are not a product-level claim about either app. A React Native app has a different baseline from a native Android app, and PSS varies with shared pages.

## Current evidence and hypotheses

### Supported by source inspection

- `app/surah/[surahId].tsx` requests word data on Android even when word-by-word display is off.
- The Android path constructs a complete `nativeLightSurahVerses` model, waits until its length equals the full Surah verse count, and passes that model through `readerState`.
- `hooks/useSurahVerses.ts` lazily constructs a permanent chapter map for all 6,236 bundled verses, creating new wrapper objects and translation arrays.
- `lib/verse-spotlight/bundledFallback.ts` constructs another permanent 6,236-entry lookup map at module initialization.
- Verse normalization primes additional verse-detail caches.
- `NativeSurahReaderViewManager.kt` currently has no explicit `onDropViewInstance` cleanup hook.
- The exploratory universal release APK was approximately 130 MB. It contained a roughly 59 MB packaged word-study database and an approximately 10.9 MB JavaScript bundle. The production AAB will split architectures, but it will not automatically remove bundled application data.
- R8 minification and resource shrinking default to disabled in the current local Android release configuration.

### Original hypotheses — 2026-09-15

These record the initial investigation, not current conclusions. The Phase 2 findings and SDK 57
results below supersede them; do not restart the completed idle-memory attribution.

1. The largest Surah increase comes from multiple simultaneous representations of full verse/word data across SQLite/offline rows, Hermes objects, React Native prop structures, and Kotlin models.
2. Full-Surah word loading and the requirement to finish all verses before mounting the native reader create an unnecessarily high peak.
3. Global bundled-Quran maps and caches explain a meaningful portion of cold-home and post-reader retention.
4. Native reader teardown leaves a view, adapter, callbacks, queued work, data, or recycled holders reachable after navigation.
5. Some post-navigation memory is allocator high-water memory rather than a reachable leak. Repeated allocation counts and heap reachability must distinguish these cases.

## Phase status

| Phase | Status | Exit gate |
|---|---|---|
| 1. Controlled baseline | Complete (2026-09-15) | Reusable harness and completed repeatable baseline artifacts |
| 2. Root-cause diagnosis | SDK 57 ownership trace and reuse isolate complete; reuse selected for production | Retained-RAM attribution remains open |
| 3. Memory implementation | Hidden WebView and SDK 57 idle fixes retained; native model reuse implemented; word window stays reverted | Emulator reader checks passed; no additional retained-RAM saving is established |
| 4. Release performance | Acceptance incomplete | SDK 57 ten-cycle reader baseline is recorded; offline/audio, matched readiness, jank and physical-device checks remain open |

## Phase 1 — Controlled baseline

### Objective

Create a repeatable Android benchmark harness and establish the trusted before-change baseline. Do not implement performance fixes in this phase.

### Required scenarios

At minimum, automate this ten-cycle journey:

1. Force-stop without clearing data.
2. Launch to home and wait for a stable UI.
3. Open Al-Baqarah through the existing deep link.
4. Wait for reader content, not merely a fixed delay when a reliable readiness signal is available.
5. Perform a fixed scroll sequence.
6. Return home and wait for settling.
7. Repeat steps 3–6 ten times in the same process.

Also capture isolated runs for:

- Plain Arabic plus translation
- Word-by-word
- Tajweed
- Audio start/stop and continued scrolling
- Mushaf mode
- Short, medium, and longest-Surah cases

If a setting or interaction cannot be automated reliably, document a precise manual step instead of hiding fragile coordinate taps in the harness.

### Required metrics

- Process ID and timestamp
- Total RSS, anonymous RSS, file RSS, and swap
- Total PSS and private dirty/clean memory
- Native and Dalvik heap size/allocation/PSS
- Unknown/private-other memory
- Android view and activity counts
- `dumpsys gfxinfo` frames, janky frames, and frame percentiles for a reset fixed-scroll window
- Cold launch `TotalTime` as an exploratory value; formal startup measurement belongs in Phase 4

### Deliverables

- Reusable scripts under `scripts/perf/`
- Timestamped CSV and logs under `.artifacts/performance/baseline/`
- A summarized baseline table added below
- Explicit statement: plateau, inconclusive, or continued growth
- Exact reproduction command

### Phase 1 results

**Confirmed:** Phase 1 completed on 2026-09-15 using commit
`eb8052854d174a91a0118b8dcc6e641dbe2b8b48` with the pre-existing `AGENTS.md`
change and this performance work dirty. Build/install command: `npm run perf:android` (release,
non-debuggable, embedded bundle; no app-data or cache clear). Device: API 36 / Android 16
`sdk_gphone64_arm64`, 2.5 GB, 1080 x 2400 at 420 dpi. Package: `1.0.0` (1).

Ten-cycle plain Arabic plus translation baseline (`RSS` is `/proc`; other memory is
`dumpsys meminfo`):

| Snapshot | RSS | Anon RSS | PSS | Native allocated | Views |
|---|---:|---:|---:|---:|---:|
| Cold home | 405.1 MB | 249.3 MB | 290.5 MB | 178.4 MB | 586 |
| Cycle 1 reader | 546.8 MB | 327.8 MB | 416.8 MB | 229.6 MB | 906 |
| Cycle 1 home | 544.2 MB | 322.1 MB | 432.8 MB | 227.5 MB | 897 |
| Cycle 10 reader | 604.9 MB | 393.5 MB | 479.3 MB | 274.1 MB | 906 |
| Cycle 10 home | 558.8 MB | 347.8 MB | 445.2 MB | 227.6 MB | 897 |

**Supported:** memory reaches a plateau after cycle 2, with GC/allocator oscillation rather
than continued cycle-over-cycle growth. Cycles 2–10 stayed within 597.8–623.5 MB reader RSS
and 552.2–581.9 MB home RSS. The fixed-scroll aggregate was 3,435 frames, 96 janky
(2.79%); per-cycle P50 was 17 ms and cycle-10 P90/P95/P99 was 17/18/19 ms. Exploratory cold
launch `TotalTime` was 873 ms.

Isolated first-cycle reader snapshots:

| Scenario | RSS | PSS | Native allocated | Views | Gfx jank; P50/P90/P95/P99 |
|---|---:|---:|---:|---:|---|
| Short, Al-Kawthar (108) | 499.2 MB | 366.1 MB | 196.0 MB | 695 | 4.92%; 17/18/22/25 ms |
| Medium, Yusuf (12) | 515.8 MB | 379.2 MB | 207.1 MB | 874 | 2.92%; 17/17/17/18 ms |
| Word-by-word, Al-Baqarah | 543.6 MB | 417.7 MB | 228.5 MB | 921 | 2.92%; 17/18/19/21 ms |
| Tajweed, Al-Baqarah | 565.8 MB | 447.1 MB | 244.2 MB | 921 | 2.91%; 17/18/19/22 ms |
| Mushaf/Tajweed pack, Al-Baqarah | 523.9 MB | 392.3 MB | 209.6 MB | 623 | 0.84%; 21/23/25/32 ms |
| Audio playing after scroll | 543.0 MB | 436.2 MB | 215.8 MB | 939 | See raw gfx log |
| Audio stopped, continued scroll | 546.0 MB | 443.5 MB | 221.2 MB | 940 | See raw gfx log |

Artifacts are under `.artifacts/performance/baseline/`; the canonical ten-cycle run is
`20260915T121210Z-plain-translation-surah-2/`. The two explicitly prefixed `failed-` and
`excluded-` directories are not baseline evidence. Reader toggles, translation mode, audio
state, and the temporary Tajweed pack were restored after collection.

Exact canonical reproduction command:

```sh
PERF_PROFILE=plain-translation PERF_SURAH_ID=2 PERF_CYCLES=10 scripts/perf/android-reader-baseline.sh
```

For feature isolates, first set the named mode in Reader Settings without changing other
settings, run the same command with `PERF_CYCLES=1`, then restore it. Mushaf uses
`PERF_READY_PATTERN='text="Mushaf pages"'`. Audio intentionally has a precise manual step:
force-stop without clearing data, launch home, open `quranappmobile://surah/2`, start verse
audio from the first verse action sheet, then run `scripts/perf/android-audio-isolate.sh`.
This avoids locale- and layout-fragile coordinate taps.

### Exit gate

Phase 1 is complete only when another session can rerun the same command and produce comparable results without rediscovering the procedure.

## Phase 2 — Root-cause diagnosis

### Objective

Explain the memory increase and post-navigation retention with evidence. Avoid broad production fixes. Narrow diagnostic instrumentation is allowed when it is removable or clearly gated.

### Required investigation

Compare at least four snapshots:

1. Cold home after settling.
2. Al-Baqarah after content load and fixed scrolling.
3. Home after leaving the reader and settling.
4. After ten open/scroll/back cycles.

Use an appropriate release-like, non-debuggable but profileable build. Inspect Java/Kotlin heap reachability, native allocations, Hermes/JS allocations where tooling permits, and Perfetto traces. Determine whether old reader instances remain reachable and whether allocation growth is bounded.

Test the major hypotheses independently where practical. Useful controlled experiments include disabling nonessential word materialization, bypassing duplicate full-Quran indexes, forcing native-reader teardown, and reducing cache retention. Do not combine experiments when that prevents attributing the result.

### Deliverables

- Heap/allocation artifacts under `.artifacts/performance/diagnosis/`
- Ranked root causes with supporting evidence and estimated impact
- Clear separation of reachable leaks, intentional caches, transient peaks, and allocator high-water behavior
- One recommended first production change with acceptance criteria

### Phase 2 results

**Confirmed:** Phase 2 completed on 2026-09-15 at commit
`eb8052854d174a91a0118b8dcc6e641dbe2b8b48`, with the same dirty state, release
build command, package, saved plain-translation settings, emulator, and eight-swipe journey as
Phase 1. No app data was cleared. Diagnostic build flags were removed and the normal release APK
was restored afterward.

Required checkpoint run (`.artifacts/performance/diagnosis/20260915T130551Z-surah-2/`):

| Snapshot | RSS | PSS | Native allocated | Views |
|---|---:|---:|---:|---:|
| Cold home | 403.2 MB | 295.4 MB | 178.2 MB | 586 |
| Cycle 1 reader | 531.5 MB | 438.1 MB | 261.2 MB | 891 |
| Cycle 1 home | 493.9 MB | 390.9 MB | 214.5 MB | 882 |
| Cycle 10 home | 548.4 MB | 457.8 MB | 261.6 MB | 890 |

Heap dumps themselves force GC and perturb later allocator state, so the Phase 1 canonical run,
not the cycle-10 number above, remains the trusted bounded-growth result. Java heap reachability was
stable from cycle 1 home through cycle 10 home: one detached `NativeSurahReaderView`, one adapter,
286 `NativeVerse` objects, 6,402 `NativeWord` objects, and one RecyclerView. The parent chain ends in
a detached `react-native-screens` `ScreensCoordinatorLayout`; old reader instances do not multiply.

Ranked diagnosis:

1. **Confirmed — eager full-Surah word materialization is the largest attributable reader cost.**
   Disabling only the plain-mode Android word parse/prop/native layout path reduced cycle-1 reader
   RSS by 73.5 MB, native allocated memory by 71.7 MB, and views by 166. Post-back RSS fell 32.6 MB.
   The reader heap contained zero `NativeWord` objects instead of 6,402.
2. **Confirmed — one detached native reader intentionally remains reachable after back.** It owns
   the complete Kotlin verse/word model but is bounded to one instance. A deferred diagnostic clear
   released 279/286 verses and 6,309/6,402 words; immediate post-back native allocation remained
   effectively unchanged and RSS changed by only 6.9 MB, supporting allocator high-water behavior.
3. **Supported — transient allocation and allocator/graphics high-water explain much of the
   remaining RSS.** The system Perfetto trace recorded seven ART GC/free samples, an ART heap range
   of 2.2–75.2 MB, and HWUI memory up to 38.0 MB. A coarse startup native sample attributed 12.3 MB
   to Hermes stacks, 9.2 MB to graphics, and 3.7 MB to React Native before profiler disconnect.
4. **Supported low impact for this journey — the eager Verse Spotlight fallback map is not a main
   cause.** Bypassing it independently changed cold-home/reader/post-back RSS by +0.6/-1.6/+2.4 MB,
   within run noise. The lazy Arabic-only `useSurahVerses` full-Quran chapter map was not exercised
   by the saved translation profile and remains a separate future optimization, not the first fix.

The heapprofd traces report client error 2 after their first dump, so they support stack categories
but not longitudinal retained-size claims. A direct adapter clear during `onDetachedFromWindow`
also crashed RecyclerView during the screen transition; any lifecycle cleanup must be deferred or
performed at a safer navigation/manager boundary. The crash is saved at
`.artifacts/performance/diagnosis/detach-cleanup-crash.txt`.

Isolated builds used `EXPO_PUBLIC_PERF_DISABLE_ANDROID_WORD_MATERIALIZATION=1 npm run perf:android`,
`EXPO_PUBLIC_PERF_BYPASS_FALLBACK_INDEX=1 npm run perf:android`, and
`ORG_GRADLE_PROJECT_perfNativeReaderDetachCleanup=true npm run perf:android`, one at a time.

**Selected first production change for Phase 3:** stop parsing and bridging Al-Baqarah's complete
word graph in plain translation mode. Keep word data on disk and materialize only a bounded
visible/active window, loading the active range for audio or word interaction. Do not merely remove
word seeking, highlighting, tapping, Tajweed, or word-by-word behavior.

Acceptance criteria: the canonical plain-translation reader RSS improves by at least 50 MB and
post-back RSS by at least 20 MB; a plain-reader heap holds at most 500 native word models; the
ten-cycle run still plateaus; word tap, audio seek/highlighting, targeted navigation, offline,
word-by-word, and Tajweed cases remain correct; reader readiness changes by no more than 10%; and
fixed-scroll jank does not exceed 3.0% with no worse P90/P95/P99 than 17/18/19 ms.

Artifacts include four HPROFs and metrics in the required checkpoint directory, controlled
experiments under `.artifacts/performance/diagnosis/experiments/`, the system trace at
`.artifacts/performance/diagnosis/quran-phase2-system.perfetto-trace`, native traces beside it, and
their CSV summaries. Reproduction: `PERF_SURAH_ID=2 PERF_CYCLES=10 scripts/perf/android-reader-diagnosis.sh`.

### Exit gate

Phase 2 is complete only when the first implementation is selected from measured evidence, not source inspection alone.

## Phase 3 — Memory implementation

### Objective

Implement the highest-confidence memory fix from Phase 2, validate religious-data and reader behavior, and measure it against the saved Phase 1 baseline.

Likely architectural direction, subject to Phase 2 confirmation:

- Keep Quran data installed/indexed on disk while materializing a bounded visible verse window.
- Avoid transferring the complete Surah word graph through one React Native prop.
- Let the native reader request or receive page/range updates.
- Remove duplicate permanent full-Quran maps where SQLite or one compact index can serve the same behavior.
- Add explicit native-reader disposal and cancel pending callbacks/work.
- Apply byte-aware bounds to caches that retain variable-sized verse or word data.

Implement one attributable change at a time. Preserve word tapping, word study, word-level audio seeking, translations, Tajweed, targeted navigation, offline behavior, accessibility, and Quran text integrity.

### Required verification

- Relevant focused tests while iterating
- `npm run verify` before handoff
- Exact Phase 1 ten-cycle benchmark before/after comparison
- Word tap/dismiss repetition
- Audio start/stop and active-word highlighting
- Navigation to target verses near the beginning, middle, and end of Al-Baqarah
- Plain, word-by-word, Tajweed, and offline cases

### Acceptance criteria

- Memory reaches a repeatable plateau rather than showing sustained cycle-over-cycle growth.
- Peak and retained memory improve materially relative to the controlled baseline.
- The improvement is not achieved by removing required reader behavior or data integrity.
- No material regression in fixed-scroll jank or reader readiness.

### Phase 3 results

**Confirmed:** Phase 3 completed on 2026-09-16 at commit
`eb8052854d174a91a0118b8dcc6e641dbe2b8b48`, with the existing dirty worktree preserved.
The plain Android reader now transfers a wordless full-Surah base model and a separate bounded word
window. The window follows visible verses, target navigation, and active audio; loads exact saved
word JSON before network pages; and is capped at 400 native word models. Word-by-word and Tajweed
continue to use their complete established models. TypeScript and Kotlin tests enforce the bound and
verify that the overlay reuses base verse data instead of duplicating it.

The canonical release, non-debuggable ten-cycle run used the same package, saved settings, API 36
emulator, waits, and fixed eight-swipe journey as Phase 1. No app data was cleared.

| Snapshot | Phase 1 RSS | Phase 3 RSS | Improvement |
|---|---:|---:|---:|
| Cycle 1 reader | 546.8 MB | 453.0 MB | 93.8 MB |
| Cycle 1 home | 544.2 MB | 457.0 MB | 87.2 MB |
| Cycle 10 reader | 604.9 MB | 480.1 MB | 124.8 MB |
| Cycle 10 home | 558.8 MB | 476.4 MB | 82.4 MB |

**Confirmed:** cycles 5–10 plateaued within 9.0 MB reader RSS and 8.1 MB home RSS. The
fixed-scroll aggregate improved slightly from 96/3,435 janky frames (2.79%) to 95/3,435 (2.77%);
cycle-10 P90/P95/P99 improved from 17/18/19 ms to 17/17/18 ms. Cold launch `TotalTime` changed from
873 ms to 767 ms. The readiness-file timing proxy improved from 2,930 ms to 2,510 ms (14.3% faster),
so neither smoothness nor readiness regressed materially.

**Confirmed:** repeated word-sheet open/dismiss, word-origin audio start/pause/stop and active-word
highlighting, target navigation to verses 1/143/286, offline verse 143 word study, word-by-word, and
Tajweed render/tap checks passed. The temporary Tajweed pack and reader toggles were restored.
Focused TypeScript and Android unit tests passed, as did `npm run verify`.

Canonical artifacts are under
`.artifacts/performance/phase3/20260915T191600Z-plain-translation-final-surah-2/`; behavior evidence
is under `.artifacts/performance/phase3/`. Reproduction:

```sh
PERF_OUTPUT_ROOT=.artifacts/performance/phase3 PERF_PROFILE=plain-translation-final \
  PERF_SURAH_ID=2 PERF_CYCLES=10 scripts/perf/android-reader-baseline.sh
```

**Supported:** the plain reader holds at most 400 native word models by construction and unit-test
coverage. The Phase 2 detached reader remains, but it now retains only a bounded plain-mode word
window; allocator high-water behavior remains a Phase 4 observation rather than a Phase 3 blocker.

### Phase 3 regression review and rollback

**Confirmed:** the Phase 3 production word-window implementation was reverted on 2026-09-16.
Although its controlled plain-reader benchmark improved, it blocked native reader readiness on an
optional local/network word lookup when no word-language pack was installed. The resulting loading
skeleton delayed reader display. Applying an asynchronously arriving word window also rebuilt the
full native verse list, notified every row, forced a RecyclerView refresh, and restored the scroll
anchor afterward, matching the reported visible jump during reader transitions.

The implementation did not optimize word-by-word or Tajweed modes and still required the full Surah
base model before mounting the native Android reader. Its focused tests covered the 400-word bound
and overlay behavior, but did not cover a missing word pack, slow/offline network, Tafsir return,
fresh pack installation, or transition stability. The production hook, native overlay code, helper,
and implementation-specific tests were removed. Performance scripts and historical artifacts remain
for diagnosis. Phase 4 must not begin until the stable reader journeys and downloads pass again and
the approximately 400 MB cold-home baseline is attributed independently.

### Post-rollback optimization: lazy Mushaf WebView

**Confirmed on 2026-09-16:** the translation reader mounted a complete Mushaf WebView behind its
visible native reader whenever prefetched Mushaf page data was available. The prefetch is retained,
but Chromium is now created only when Mushaf mode is active or the user explicitly requests the
mode switch. During that switch the WebView warms invisibly over the current translation reader and
the route changes only after the first Mushaf page is positioned, with a 1.5-second safety fallback.

The controlled Surah 2 release-like A/B used the same emulator, saved data, screen, and 20-second
settle. Before the change the translation screen reported 386.2 MB PSS, 530.4 MB RSS, 210.8 MB
native allocated, 681 views, and one WebView. Three fresh-process runs after the change reported
340.3–357.9 MB PSS, 460.9–477.5 MB RSS, 198.7–198.9 MB native allocated, 672 views, and zero
WebViews. The median improvement was 43.8 MB PSS, 67.4 MB RSS, and 11.9 MB native allocated.

The actual settings-tab transition kept the existing screen visible and showed the positioned
Mushaf within 750 ms in captured 250/750/1500/3000 ms checkpoints. The same installed-pack switch
also passed with Wi-Fi and mobile data disabled. Evidence is under
`.artifacts/performance/production-runtime/`.

### Same-emulator Greentech idle comparison (2026-09-16)

**Confirmed:** `com.greentech.quran` was foregrounded on the API 36 `sdk_gphone64_arm64`
emulator. `adb shell dumpsys meminfo` reported the following main-process snapshots. Our installed
app was then force-stopped and launched without clearing data; its settled reading was taken about
30 seconds after an initial eight-second snapshot. These are exploratory snapshots, not a
controlled A/B of equivalent screens or builds.

| Main process | Greentech | Our app, initial | Our app, settled |
|---|---:|---:|---:|
| Total PSS | 75,975 KB | 291,294 KB | 295,890 KB |
| Total RSS | 176,636 KB | 407,096 KB | 417,508 KB |
| Native heap PSS | 17,608 KB | 176,452 KB | 177,008 KB |
| Native heap allocated | 28,015 KB | 181,349 KB | 181,824 KB |
| Code PSS | 24,108 KB | 50,556 KB | ~50,616 KB |
| WebViews | 0 | 0 | 0 |
| Android views | 217 | 586 | 586 |

**Confirmed:** our separate `:verse_spotlight_widget` process was also present. It measured
40,183 KB PSS / 94,892 KB RSS at one snapshot, but only 260 KB native-heap PSS; much of its RSS
was shared code and much of its PSS was system-attributed. Do not add raw process RSS and call it
unique app RAM. The approximately 650 MB RSS reported during a prior Surah-reader journey was a
different app state, not this idle-home measurement. Both main processes had zero WebViews in this
comparison, so a hidden WebView cannot explain this particular idle gap.

**Confirmed from observable behavior:** Greentech had open SQLite databases including `quran.db`,
`corpus.db`, `words.db`, and `en_sahih.db`. This makes it a useful *reference pattern* for keeping
Quran content on disk and querying as needed. We have not inspected its source or profiled its heap,
so its exact in-memory caching and rendering design remain unknown; do not claim that SQLite alone
explains the difference. Its process has a much smaller native heap and code PSS, while our app has
the fixed overhead of React Native/Hermes and a larger view tree.

**Supported by our source, not yet measured as a memory attribution:** startup imports the bundled
Saheeh International JSON into the Hermes bundle and calls
`bootstrapBundledSaheehInternationalAsync()`; the payload has 6,236 verses and is about 2.7 MB on
disk. `lib/verse-spotlight/bundledFallback.ts` eagerly validates it and constructs a 6,236-entry
map. `lib/verse-spotlight/canonicalIndex.ts` also constructs a 6,236-key index/map. On reader use,
`hooks/useSurahVerses.ts` can build another permanent chapter map with wrapper objects and
translation arrays. The release APK examined in this session had an 11,139,124-byte embedded JS
bundle; R8/resource shrinking were disabled. These facts make JS object retention and startup
materialization worth isolating, but **do not prove** they own the ~159 MB native-heap PSS gap.
Hermes allocations are included in Android's native-heap category alongside other native owners.
The earlier statement that bundled JSON was the definitive primary cause was too strong.

**Diagnostic completed below (2026-09-22/23):** the largest actionable idle-memory owner is
supported as Hermes V1 runtime compilation used by Worklets. Bundled Quran storage is not selected
for the first fix. The first production change should address the runtime through a supported SDK
update; it remains subject to the implementation acceptance checks below.

## Idle-memory attribution — 2026-09-22/23

**Status: diagnostic pass complete; SDK 57 implementation measured below.** Existing reader
changes, installed content and settings were preserved. All diagnostic source substitutions were
restored. There is no evidence here requiring a language change or application rewrite.

### Release measurements

Current dirty checkout: Expo 56.0.14, RN 0.85.3, Reanimated 4.3.1, Worklets 0.8.3, Hermes
250829098.0.10. API 36 `quran_api36`, arm64 release, same package/data. Five fresh baseline
processes were sampled at 5/15/30/60 seconds after home was detected. Controls and the principal
worklet comparison used three fresh processes each. The four broad exclusions and inline-requires control used one screening
run each; they are not repeated estimates or production fixes. No builds ran during measurements.

Values below are **MiB**, at 60 seconds, main process only; medians when N > 1.

| Diagnostic | N | RSS | PSS | Anonymous RSS | Native allocated | Views |
|---|---:|---:|---:|---:|---:|---:|
| Original baseline | 5 | 405.33 | 293.40 | 249.57 | 177.58 | 586 |
| Minimal RN, no application imports | 3 | 193.82 | 87.94 | 65.98 | 22.13 | 14 |
| Same minimal screen + Reanimated import | 3 | 272.75 | 167.83 | 142.45 | 95.87 | 14 |
| Bundled payload/fallback map excluded | 1 | 400.75 | 287.48 | 246.03 | 177.46 | 586 |
| Root DB/bootstrap calls skipped | 1 | 404.84 | 292.05 | 249.17 | 177.07 | 586 |
| Startup prefetch component/imports removed | 1 | 408.16 | 295.09 | 249.77 | 177.26 | 586 |
| Home route/imports replaced; providers retained | 1 | 334.95 | 223.04 | 180.98 | 120.86 | 70 |
| Full app, experimental Worklets Bundle Mode | 3 | 283.93 | 166.61 | 121.88 | 51.72 | 586 |
| Original APK restored, baseline recheck | 3 | 405.97 | 295.33 | 249.57 | 177.30 | 586 |
| Inline-requires only, normal worklet eval | 1 | 391.23 | 278.52 | 236.23 | 167.10 | 586 |

**Confirmed:** importing Reanimated alone adds 78.93 MiB RSS / 73.74 MiB native allocations to the
minimal control. The full-app worklet diagnostic reduces median RSS by 121.40 MiB against the first
baseline, or 122.04 MiB against the recheck; recheck PSS/anonymous/native reductions are
128.72/127.69/125.58 MiB. Bundle Mode RSS range was 281.71–284.03 MiB; the restored baseline range
was 405.91–408.90 MiB. This exceeds the initial 30 MB opportunity target, but is **not** an accepted
production optimization. Bundle Mode also enables Metro inline-requires. A separate inline-requires-only screening run
saved about 15 MiB RSS; it remained 107.30 MiB above Bundle Mode with 115.38 MiB more native
allocations. Thus the entire 122 MiB cannot be assigned solely to worklet eval. That screening run
followed another emulator restart and is not a repeated estimate. Exclusion deltas overlap and must
not be added together as separate savings.

Baseline widget process: median 111.76 MiB RSS, 27.60 MiB PSS, 5.23 MiB native allocated. It is
reported separately in every run. Shared pages mean raw RSS must not be summed as unique app RAM.
See [Android's memory-report definitions](https://developer.android.com/tools/dumpsys#meminfo).

Home detection used the first accessibility dump containing `আল-ফাতিহা` (different explicit markers
for empty controls). Readiness proxy medians were 3,258 ms baseline, 3,275 ms Bundle Mode and
3,290 ms baseline recheck. This coarse upper-bound proxy does **not** prove the ≤10% startup or
reader-readiness acceptance criterion. No reader-speed or visual-regression acceptance is claimed.
The emulator restarted between the first baseline/control and later comparisons; the restored
baseline recheck reproduced the original native/anonymous memory levels.

### Attribution and limits

**Confirmed:** source-map audits exclude application routes and bundled Quran payload from the
minimal controls; the no-payload build has no payload module. The Bundle Mode build retains the
payload, normal routes and 586 views, and contains 487 generated worklet modules. These are import
and compilation changes, not merely hidden UI. Skipping root bootstrap calls does not disable other
DB consumers. Removing the home route does not exclude providers or other router modules. The
canonical verse-address index remains in the no-payload build. These screening runs do not prove
all database/index/prefetch work has zero cost.

**Confirmed, instrumented evidence:** the release-engine main JS runtime reports 21.77 MiB allocated
Hermes objects and a 28 MiB heap. Release Hermes cannot write heap snapshots in this build. A
same-version debug-engine diagnostic successfully produced a complementary snapshot with about
26.4 MiB of shallow node sizes. This is only the main JS runtime, not the UI runtime, a retained-size
analysis, or total native memory. Its largest groups include objects, strings, arrays and code blocks.

Separate libc `malloc_debug` dumps using both the release and same-version debug Hermes engines
each contain 477 allocations of 256 KiB (119.25 MiB). The release-engine capture occurred before
the diagnostic JS heap callback.
Two dominant groups each contain 206 blocks (51.5 MiB each), with PCs mapped into
`libhermesvm.so` through the APK and process mappings. Symbols are stripped, so the exact C++
function names are not independently established. Instrumented sizes are kept out of release
benchmarks. Perfetto heapprofd again stopped early with `INVALID_STACK_BOUNDS` (error 2); it is
not a valid complete allocation profile and the failure is not a buffer-overflow finding.

**Supported cause:** unnecessary Hermes V1 compilation metadata retained by Worklets' eval path.
The repeated import comparison, native allocation shape and full-app compilation-path comparison
agree with the [upstream Hermes fix](https://github.com/facebook/hermes/pull/2090) and
[Expo's SDK 56 regression notice](https://expo.dev/changelog/sdk-56#known-regressions).
This attributes a major idle-memory owner, not every byte of the Greentech gap or all reader memory.

Two attempted workarounds are **not production recommendations**. A verified Hermes 0.15 pin
(with byte-identical app bytecode) crashes because RN 0.85.3 JSI lacks `Runtime::isTypedArray`.
The first pin attempt did not replace the engine at all; both attempts are explicitly excluded.
Bundle Mode works in this diagnostic, but [Expo's current guidance](https://expo.dev/changelog/sdk-57#known-regressions)
still calls it unsupported/experimental. The later Expo guidance takes precedence over the earlier
[Worklets article's generic pin advice](https://swmansion.com/blog/how-worklets-bundle-mode-accidentally-fixed-Hermes-v1-memory-regression/).

### SDK-upgrade specification — historical diagnostic handoff

The target below was the original specification. The implementation used **57.0.24**, as recorded
in the following results section; do not downgrade or repeat the upgrade. Outstanding acceptance
checks still apply.

**Selected owner and change:** move the app to a supported Expo SDK 57 dependency set containing
fixed Hermes, while retaining the existing reader, content/storage design and normal Worklets mode.
A reproducible starting target is Expo **57.0.17**, RN **0.86.3**, Reanimated **4.5.1**, Worklets
**0.10.1**; Expo's published dependency manifest is saved with the evidence. Audit the resulting
Hermes **250829098.0.17** runtime and compiler rather than assuming a package version changed the APK.
This is a coordinated dependency/native-build update, not a Kotlin rewrite. App-specific integration
work remains possible and must be tested; the SDK update itself was not executed in this diagnostic pass.

1. Preserve the current dirty files and custom/ignored native project files in an isolated working
   copy. Update `package.json` and `package-lock.json` with `npm install expo@57.0.17 --save-exact`,
   then `npx expo install --fix` and `npx expo-doctor`. Align the complete Expo dependency set; do not
   force only the Hermes AAR. Keep Bundle Mode disabled and remove all diagnostic overrides.
2. Apply only required native template changes using the SDK upgrade helper. Preserve native reader
   registrations, widget integration, signing and application ID. **Do not run prebuild --clean or
   delete native directories.** Rebuild the release APK and development client. Audit resolved
   Gradle dependencies, the packaged engine binary and absence of profiling hooks.
3. Repeat five release launches on this emulator with the saved settings/downloads and all four
   checkpoints. Require ≥30 MB repeatable idle-RSS reduction, corroborated by PSS/anonymous memory,
   without moving the cost into the widget process or increasing swap. The 122 MiB diagnostic delta
   is an opportunity estimate, not a promised SDK-upgrade result.
4. Compare actual home-content and reader-content readiness with finer timestamps/trace markers;
   neither may slow by >10%. Run `scripts/perf/android-reader-baseline.sh` for ten cycles with the
   same saved-settings Al-Baqarah journey, waits and swipes. Check scrolling, audio/highlighting,
   targeted navigation, settings sheets and word-by-word behavior for loading/jump regressions.
5. Verify Quran/translation addressing and content integrity, installed-pack offline reading, widget
   behavior, dark mode/RTL and persisted settings. Run relevant native/behavior tests, then one final
   `npm run verify`. Accept only after these checks pass; otherwise restore the pre-upgrade build.

**Diagnostic handoff:** idle attribution selected the SDK 57 implementation. The diagnostic pass
itself did not change production behavior. Implementation results follow; reader regression checks
and the ≤10% readiness condition remain open.

Evidence and reproduction: `.artifacts/performance/idle-memory/README.md`, `summary.json`, per-run
CSV/raw meminfo/process status/timing files, `builds/*/audit.json`, `profiles/`, and `session/`.
Reusable diagnostic entry points: `scripts/perf/android-idle-memory.py`, `build-idle-isolate.py`,
`summarize-idle-memory.py`; temporary profiling sources live under `scripts/perf/idle-native/` and
are not compiled or imported in normal builds. Backups in each build directory preserve the exact
source bytes used, including the user's pre-existing changes. Source preservation, Python/JS syntax checks and `git diff --check` passed. The normal release
rebuild succeeded; its app bytecode and Hermes binary match the original baseline exactly, with no
profiling library/import or generated Bundle Mode modules. Saved settings matched exactly after the runs; no AsyncStorage keys were
removed (only the two ordinary home-spotlight cache values refreshed). The malloc wrapper was
restored to empty, and the original normal APK was reinstalled and launched successfully.

### SDK 57 implementation and idle result — 2026-09-23

**Confirmed:** Expo 57.0.24, React Native 0.86.3, Reanimated 4.5.1, and Worklets 0.10.1 were
installed. The ARM64 release APK was built with normal Worklets mode, and its packaged
`libhermesvm.so` reports `250829098.0.17`. The custom Android project was updated using
`expo prebuild --no-clean`; app data was retained during `adb install -r`. FlashList 2.3.2 was
retained because this app uses `initialScrollIndexParams`, absent from Expo's suggested 2.0.2.

Five fresh-process home launches on the same API 36 `quran_api36` emulator reached the expected
accessibility marker. At 60 seconds after readiness, the median main-process memory was
**297.21 MiB RSS, 186.75 MiB PSS, 137.87 MiB anonymous RSS, 64.89 MiB native allocated,
and 19.37 MiB swap**. The separate widget process was 105.21 MiB RSS and 20.31 MiB PSS.
Raw RSS from the two processes must not be added as unique app RAM. The 5/15/30/60-second
checkpoints, per-run logs, APK hash, device configuration, and build command are in
`.artifacts/performance/idle-memory/20260922T183833Z-sdk57-home/` and
`20260922T184243Z-sdk57-home-followup/`.

Against the five-run SDK 56 baseline above, the main process improved by **108.12 MiB RSS**
and **106.65 MiB PSS** at 60 seconds, with 111.70 MiB less anonymous RSS and 112.69 MiB
less native allocation. Swap was effectively unchanged. The widget also fell from 27.60 to
20.31 MiB PSS, so the savings did not move into that process. `npm run verify` and the ARM64
release build passed. Expo Doctor passed 19/21 checks; its two findings are the existing `metro`
script name conflict and `react-native-render-html` maintenance warning.
An emulator deep link to Surah 2 opened the reader and exposed the Al-Baqarah heading in the
accessibility tree; this is a launch smoke check, not a reader journey test.

**Open acceptance work:** the accessibility-dump readiness proxy is too coarse to establish the
≤10% startup criterion. Reader journeys, audio, offline packs, widget behavior, and physical-device
checks from the implementation specification have not yet been rerun for this SDK change. The idle
memory reduction is measured; full release acceptance remains open.

### SDK 57 reader baseline and verse/word ownership — 2026-09-23

**Confirmed:** A fresh ten-cycle Al-Baqarah open/eight-swipe/back run used the installed, non-debuggable
SDK 57 release APK (`17da4075a56a7b4fd126ab843bb7937a3983ab0705d11afd64677d42f5248764`),
commit `62c51398c25698f5f946d439855ebc2e8d9bb882` with the pre-existing dirty worktree, the same
API 36/Android 16 `sdk_gphone64_arm64` emulator, and unchanged saved data/settings. The visible profile
was dark translation reading with Saheeh International and Al-Hilali & Khan; word-by-word and Tajweed
were not enabled. The APK was the recorded `npm run perf:android` release build. No data was cleared.
The main process kept PID 17767 for all ten cycles. Values below are MiB (1024 KiB), except views:

| Snapshot | RSS | Anonymous RSS | PSS | Native allocated | Views |
|---|---:|---:|---:|---:|---:|
| Cold home | 296.3 | 137.3 | 179.4 | 66.0 | 586 |
| Cycle 1 reader, after scroll | 368.8 | 194.4 | 267.3 | 113.0 | 901 |
| Cycle 1 home | 349.3 | 173.5 | 238.3 | 86.4 | 892 |
| Cycle 10 reader, after scroll | 391.0 | 213.3 | 275.0 | 97.8 | 895 |
| Cycle 10 home | 388.8 | 211.0 | 275.6 | 96.5 | 886 |

**Supported:** cycles 2–10 oscillated rather than growing monotonically: reader RSS ranged
369.6–401.1 MiB and post-back home RSS 367.9–391.3 MiB. The last home still exceeded cold home
by 92.5 MiB RSS. The widget process was separate: 102.0 MiB RSS / 14.6 MiB PSS at cycle 10;
do not add its RSS to main-process RSS as unique memory. The fixed-scroll `gfxinfo` result was
226/3,400 janky frames (6.65%), with cycle rates from 2.28% to 14.95%. This is an SDK 57 emulator
observation and needs a controlled repeat before diagnosing a scrolling regression. Historical SDK 56
reader totals reflect different builds and possibly different saved settings, so the differences are
not an isolated SDK effect.

**Confirmed readiness bound:** the cold activity `TotalTime` was 1,030 ms, which is not home-content
readiness. Five warm home-to-reader reopens, sampled with `screencap` about every 200 ms, first showed
the Al-Baqarah 2:1 label and verse content between 453–495 ms (last negative frame completion) and
663–708 ms (first positive frame completion) after the deep-link command began. Median bounds were
457–667 ms. Screenshots were visually checked; the loading/skeleton state was not counted as ready.
The older accessibility-dump probe took about 2.6 seconds per poll and only supplies an upper bound.
No matched SDK 56 frame-level capture exists, so the ≤10% readiness acceptance condition remains open.

**Confirmed Java reachability after forced GC:** the SDK 57 reader heap contained one
`NativeSurahReaderView`, one `NativeVerseAdapter`, 286 `NativeVerse` and 6,607 `NativeWord` objects.
The post-cycle-10 home heap contained the same counts. Reopening did not multiply native readers.
The class counter was validated against the historical dump (286 verses and 6,402 words). Heap dumps
perturb allocator state and do not assign the 92.5 MiB post-back RSS increase to those Java objects.

**Supported ownership and update trace from current source:**

- The offline Surah cache retains row objects with `wordsJson`; its page cache slices arrays that
  reference those same rows. Limits are 16 Surahs and 64 pages with a ten-minute TTL, not a byte budget.
  The 150-entry verse-details caches keep text/translation previews, not the full word graph.
- `useSurahVerses` parses the cached word JSON into a separate `SurahVerse` word graph. On a warm route
  mount, both the initial memo and `loadInitialWindow` normalize the full cached Surah, so unchanged
  JSON is parsed again even if equivalent pages are later kept. `loadInitialWindow` sets
  `pagesByNumberRef` to the second graph before its equality check can keep the initial graph in
  React state; both can then remain reachable. The equality check itself builds word signatures.
  A new reader route repeats this work.
- The Android mapper builds a second 286-verse JS prop graph with new word objects. React Native
  transfers it through `readerState`; Kotlin parses it into its own verse/word objects. The JS and
  Kotlin graphs coexist while reading, and the Kotlin graph survives back navigation in one reader.
- Audio active-verse changes keep the memoized JS verse array but create a new `readerState` object.
  `setReaderState` unconditionally parses all verses and hashes that newly parsed list before its
  unchanged-render early return. An active-word change alone uses a separate prop. Font/layout
  settings likewise reparse the native list; word-by-word, Tajweed and translation selection also
  invalidate upstream JS normalization or mapping. Target-verse changes create a new combined state.

**Unresolved attribution:** these are confirmed object counts and supported source paths, not
separate byte or CPU costs for the offline JSON, JS graphs, React Native transfer and Kotlin graph.
Release Hermes did not provide a retained JS heap snapshot here. Do not choose a memory fix or claim
the old 73.5 MiB word-isolate saving applies to SDK 57 without one controlled isolate that preserves
readiness and scrolling.

Artifacts: `.artifacts/performance/sdk57-reader/20260922T190624Z-saved-settings-surah-2/`
(`metrics.csv`, `gfx.csv`, `readiness.json`, `frames/repeated/summary.json`, screenshots, raw heap
dumps, class counts and run metadata). Reproduce the memory journey with
`PERF_OUTPUT_ROOT=.artifacts/performance/sdk57-reader PERF_PROFILE=saved-settings PERF_SURAH_ID=2 PERF_CYCLES=10 scripts/perf/android-reader-baseline.sh`.
The read-only heap counter is `scripts/perf/hprof-class-counts.py` after `hprof-conv -z`; the UI-marker
probe is `scripts/perf/android-reader-readiness.py`. No production behavior was changed. Python syntax
checks, parser validation against the historical heap, and `git diff --check` passed; a new full
`npm run verify` was not required for this read-only measurement.

### SDK 57 native parse/reuse isolate — 2026-09-23

**Confirmed:** Two non-debuggable ARM64 release APKs were built from the same SDK 57 source and
identical JS bundle at commit `62c51398c25698f5f946d439855ebc2e8d9bb882` plus the pre-existing
dirty worktree. Control SHA-256 was `8659859c24fad9b800dc3cda77c2ef47e25ef0d671c84f394c457f5c6e675478`;
reuse SHA-256 was `d9534d5ad7f6fb1104fe7607e44879ce417b7704349a800e5f90e222c33b6c56`.
The only behavioral difference was a diagnostic native fast path for the same Surah, verse-content
revision, reader settings and theme. Both builds parsed the initial full model. Instrumentation used
`System.nanoTime`, Android `Debug` thread-allocation counts and `dumpsys meminfo`; both APKs carried
the same instrumentation. The same API 36 emulator, saved dark translation profile, and eight-swipe
journey were used for three fresh-process runs per build. APK installs retained app data.

| Measured operation across three runs | Control | Reuse isolate |
|---|---:|---:|
| Initial full parses | 3/3 | 3/3 |
| Median initial parse time / Java-thread allocation | 48.5 ms / 4,470,344 B | 41.4 ms / 4,470,344 B |
| Unchanged-state calls parsed / reused | 22 / 0 | 0 / 21 |
| Median time for unchanged-state parse block | 29.1 ms | 0 ms |
| Median allocation for unchanged-state parse block | 4,468,064 B | 0 B |
| Median total native state-update time | 33.0 ms | 3.09 ms |
| Median total Java-thread allocation per state update | 4,473,832 B | 5,768 B |

The count differs by one because the audio run can deliver a different number of active-verse events;
the per-call comparison is the meaningful one. In the control APK, unchanged audio-related state
updates rebuilt 286 verses and 6,607 words. The isolate reused the already parsed native list and
its hash, avoiding about 30 ms and 4.47 MB of transient Java-thread allocation per eligible update.
This measures the Kotlin conversion, not React Native prop transfer, JS normalization, native heap
allocation or retained object size.

**Confirmed guard and behavior:** The isolate still created 286 verses and 6,607 words on first open.
A deep link to `startVerse=286` displayed `2:286`; reader content below the top 100 px status-bar
area was pixel-identical between one matched control/reuse screenshot pair. Verse actions, audio
playback with word highlight, three
audio-next taps, eight swipes, back navigation and home all completed. Switching night mode off and
back on caused two full parses in the reuse APK, then restored the saved setting. This is focused
coverage, not full mode, offline or accessibility acceptance.

**Supported, with measurement limits:** Median home-after RSS/PSS were 411.3/302.8 MiB in control
and 412.9/303.8 MiB in reuse. Reader and scroll snapshots varied substantially with GC and native
allocator state, including before audio, so no steady-state RAM reduction is established. Fixed-scroll
jank was 54/1,019 frames (5.30%) in control and 38/1,036 (3.67%) in reuse, with overlapping run-level
variation. Warm reader-content readiness, sampled by screen captures roughly 200–300 ms apart, had
median last-negative/first-positive bounds of 493–758 ms and 488–733 ms respectively. The bounds
overlap; neither a slowdown nor a precise percentage improvement is established. Allocation tracing
affects both builds, so these RAM readings should not be compared directly with the normal APK.

Artifacts: `.artifacts/performance/reader-sdk57/reuse-isolate/` contains both APKs, build logs,
per-run metrics, frame captures, UI dumps, raw parser logs, `summary.json`,
`readiness-summary.json`, `validation.json`, the settings guard and the exact diagnostic patch. Reproduce with
`python3 scripts/perf/android-reader-reuse-journey.py control --runs 3`, then the same command with
`reuse`, followed by `python3 scripts/perf/summarize-reader-reuse.py`. Both diagnostic APKs were
assembled with `./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a
-PperfReaderTrace=true -PperfReaderReuse=false --console=plain` for control and the same command
with `-PperfReaderReuse=true` for reuse, after applying the archived diagnostic patch to the same
dirty source state. The four temporary source edits were restored byte for byte from archived
originals after the isolate; the normal release APK was rebuilt and reinstalled without clearing
data. Its SHA-256 again matched `17da4075a56a7b4fd126ab843bb7937a3983ab0705d11afd64677d42f5248764`.
The restored APK opened Al-Baqarah and displayed `2:1`. Python syntax checks, `npm run type-check`
and `git diff --check` passed. This remains a diagnostic result, not a production reader change.

### Native model reuse implementation — 2026-09-23

**Confirmed implementation:** `NativeSurahReader` now assigns a revision to each immutable verse-array
snapshot at the native boundary, scoped across mounts/module reloads. A single `NativeVerseModelCache`
per Android reader reuses parsed verses and their hash only for the same revision, Surah, settings
and theme. Playback, inset and target changes still execute their existing update paths. New content
(including downloaded word meanings and Tajweed glyphs) receives a new revision; absent revisions
use the full parser. Legacy verse replacement invalidates the cache. The cached list is separate from
the adapter's mutable list, preventing target navigation from clearing its own reused input. This is
a CPU/allocation optimization; the full-Surah loading/rendering contract is unchanged.

Eight new native behavior tests cover reuse without invoking the parser, content/configuration
invalidation, Surah changes, legacy fallback/replacement, empty-to-loaded content and parse failures.
All eleven native reader tests, `npm run verify`, and the ARM64 release build passed.

**Confirmed matched release measurements:** three fresh-process reader/audio/eight-swipe/back
journeys per APK used the existing Bengali, dark, two-translation profile on API 36. Control SHA-256
was `17da4075a56a7b4fd126ab843bb7937a3983ab0705d11afd64677d42f5248764`; production reuse was
`a40bc8c6479cdfcfd3c84ca8ec2ee953ede2234d2caa00d0a74a11391e20f96a`. Neither APK contained the
earlier allocation instrumentation. The settled first-reader images were pixel-identical below the
status bar, and audio/word highlighting appeared in both builds. Fixed-scroll jank was 32/1,029 frames
(3.11%) versus 36/1,029 (3.50%). Median screenshot readiness bounds were 549–1,090 ms versus
496–977 ms; these coarse, overlapping bounds do not prove a percentage improvement or the ≤10%
acceptance criterion. Bounds use the last-negative capture start and first-positive capture end.
Median post-back RSS/PSS was 414.34/336.99 versus 408.46/295.68 MiB with substantial run variation.
**Supported conclusion:** no reliable scrolling or retained-RAM improvement is established here.
The earlier 29.1 ms/4.47 MB diagnostic remains the evidence for the avoided conversion work; it is
not a newly measured production timing or a per-frame saving.

**Separate ten-cycle/behavior profile:** after an external signing/universal-build change and emulator
restart, the installed APK had identical JS, DEX and ARM64 libraries to the reuse candidate, plus
other CPU architectures. Saved data had changed to English with one translation and no word pack;
this newer user state was preserved. Its ten-cycle run kept one PID, recorded 98/3,436 janky frames
(2.85%), and ended at 389.14 MiB reader RSS / 384.89 MiB home RSS, from 289.91 MiB cold home.
Post-back cycles 2–10 ranged 361.38–389.12 MiB with oscillation and an upward drift; this does not
establish a long-term plateau or fix post-reader retention. Do not compare these values directly with
the earlier two-translation profile. An aborted APK-mismatch attempt is explicitly excluded.

**Confirmed emulator behavior:** cold installed-translation reading without a word-language pack
worked offline at 2:1, 2:143 and 2:286. A temporary English word-pack download updated the mounted
reader; word-by-word display, word-sheet addressing and offline 2:143 worked. A temporary Tajweed
pack rendered colored glyphs, worked offline at 2:1/2:143, and opened word 2:1:1. Night mode round trips,
Mushaf-to-translation handoff, verse actions, and return from the empty Tafsir selection screen also
worked. This is not a downloaded-Tafsir-content or physical-device acceptance result.

Both temporary packs were removed through the app's download UI. The newer English/one-translation
settings were restored byte-for-byte, including removing only the theme preference created by the
test to restore the original system default. Installed translation rows remained 6,236; word-language
rows and Mushaf installs returned to zero. Wi-Fi/mobile-data state was restored. After later unrelated
worktree changes, `npm run verify` and the eleven native reader tests passed again; earlier A/B
measurements remain attached to their original APK hashes, not to the combined later worktree.

Artifacts, exact source backups, APKs, build/test logs, UI captures and JSON summaries are under
`.artifacts/performance/reader-sdk57/model-reuse-production/`. The journey runner now accepts
`--artifact-root` and computes the actual APK hash. Repeat matched runs only with compatible signing
and identical saved data; never uninstall/clear data to force a comparison. The installed newer build
and unrelated startup/signing/navigation changes were preserved. Phase 3 model reuse is implemented;
Phase 4 release acceptance and any retained-memory improvement remain open.

## Phase 4 — Release performance and hardening

### Objective

Turn the corrected reader into a measurable Android release candidate.

### Required work

1. Add a release-like profileable Macrobenchmark setup.
2. Benchmark cold/warm/hot startup and fixed Surah scrolling with repeated iterations and saved traces.
3. Evaluate a Baseline Profile for startup and core reader journeys.
4. Enable and validate R8/code shrinking and resource shrinking for the production configuration.
5. Build an AAB and inspect delivered size with bundle/APK analysis.
6. Decide whether the large word-study database must ship initially or can be downloaded on demand; verify it is not duplicated in installed storage.
7. Test low-memory process death, state restoration, offline mode, downloads, audio background behavior, insufficient storage, and corrupt-pack recovery.
8. Test at least one physical low-end 2–3 GB device and one physical mid-range device.
9. Run `npm run verify` and document internal-track/Play Console monitoring for crashes, ANRs, startup, slow rendering, memory, and wake locks.
10. Confirm the permanent application ID, versioning, production signing, and symbol/mapping-file retention before publishing.

### Deliverables

- Macrobenchmark results and Perfetto traces under `.artifacts/performance/release/`
- Before/after AAB and delivered-size report
- Physical-device results
- Release performance summary, remaining risks, and monitoring checklist

### Phase 4 results

Acceptance remains incomplete. The cold-home owner was attributed, the SDK 57 update produced
a measured idle-memory reduction, and the ten-cycle SDK 57 reader baseline is recorded above.
The earlier reader word-window implementation remains reverted. Native model reuse is now implemented
with the emulator checks recorded above, following the measured repeated-parse isolate. It does not
establish a retained-RAM saving. Matched precise readiness, physical-device frame times, low-memory
behavior and the remaining release checks are still required before claiming release acceptance.

**Startup work — 2026-09-23 (supported, not a release acceptance result).** The root layout now
waits only for one batched preferences read and the fonts needed for the active reader selection.
It opens Home before checking/installing the bundled translation and configuring audio. Widget
sync and resource prefetch begin shortly after Home paints. The Home verse fallback now validates
the requested canonical row on access instead of constructing another 6,236-row map at import.
The Arabic font picker loads a newly selected font before applying it, so fonts omitted from the
startup set still render correctly. The existing full-coverage verse tests, `npm run verify`,
release APK build, Home launch, and a cold Al-Baqarah deep link passed. No application data or
reader setting was cleared.

Matched API 36 emulator builds used the same dirty checkout and saved app data. The control APK
temporarily restored only the five startup source files to `HEAD`; the exact current source bytes
were restored after its build. `scripts/perf/android-startup.py` force-stops without clearing data,
records Android `TotalTime`, and measures from the activity start log to removal of the Android
starting view. Five-run median starting-view times were **1,106 and 1,085 ms** for control runs,
and **1,027, 1,064, and 1,064 ms** for the optimized runs before the font-picker follow-up.
The final APK measured **1,088 ms**. The control and final results overlap and activity `TotalTime`
shifted between APK installs too; these numbers do not establish a reliable content-readiness
improvement or the requested comparison on physical phones. An inline-requires
isolate had a 1,031 ms median and a five-row Home window had inconsistent runs; neither was kept.
A no-Home diagnostic reached 980 ms, suggesting the first Home render is part of the remaining
cost, but it is not a product option. JSON, APKs, and isolate logs are under
`.artifacts/performance/startup-20260923/` and `.artifacts/performance/idle-memory/builds/`.

Phase 4 remains open. The next startup step is a frame-level cold/warm/hot Macrobenchmark with
content readiness on the user's low-end phone and a mid-range phone, followed by a Baseline Profile
experiment if native startup is the dominant interval. Preserve full Home content while testing.

**Physical USB setup smoke — 2026-10-08 (confirmed setup, not acceptance evidence).** A Samsung
`SM-M145F` running Android 14 / API 34 is now authorized over USB. It reports 5.46 GiB usable RAM,
1080 x 2400 physical pixels, and 450 dpi with a 510 dpi override, so it does not satisfy the required
2–3 GB low-memory lane. The release app and a `.dev` development client coexist; Metro uses
`adb reverse` and does not require Wi-Fi. `npm run device:android`, `npm run android:device`,
`npm run dev:android:device`, and `npm run perf:android:device` select a physical phone without
starting an emulator. The ADB observation helper can now save an app-scoped screenshot, UI tree,
logcat, memory, frame, and activity snapshot.

Wireless ADB was subsequently paired and verified end to end on the same phone: app launch,
`adb reverse`, screenshot/UI/log/memory/frame capture, and shell access all worked with USB power
disconnected. At that setup check the battery reported 32.0 C and Android thermal status 0. This
only validates the transport and instrumentation; it is not a controlled performance run.

The current dirty release source at commit `62c51398c25698f5f946d439855ebc2e8d9bb882` built and
installed over the existing release app without clearing its saved Bengali profile. The ARM64 APK
was 58 MB with SHA-256 `b46e8eaacd59d72be8d0a0a22ad6e511b22ea73e18da1eb79b98c0a51bc49065`.
One setup journey opened Al-Baqarah, waited for `2:1`, performed eight fixed swipes, and returned Home:

| Setup snapshot | RSS | PSS | Native allocated | Views |
|---|---:|---:|---:|---:|
| Cold Home | 272.4 MiB | 210.9 MiB | 59.9 MiB | 537 |
| Reader after fixed swipes | 332.1 MiB | 268.8 MiB | 89.9 MiB | 826 |
| Home after back | 324.6 MiB | 256.7 MiB | 77.6 MiB | 817 |

The fixed-scroll window recorded 619 frames, 8 modern janky frames (1.29%), and P50/P90/P95/P99
of 18/23/25/34 ms. Exploratory activity `TotalTime` was 1,712 ms. No crash or ANR appeared in the
journey artifacts. These are one-run smoke values collected while USB powered, not a controlled
baseline, before/after comparison, thermal result, or release claim. Artifacts are under
`.artifacts/performance/physical-setup/20261007T203648Z-physical-setup-smoke-surah-2/`.
Repeat matched runs with battery/thermal state, app settings, APK hash, and actions controlled; add
a genuine 2–3 GB physical device before closing the physical-device gate.

### Exit gate

Phase 4 is complete when the release candidate has repeatable benchmark evidence, passes the repository verification command, has been exercised on physical devices, and has no unresolved high-severity memory, crash, ANR, data-integrity, or release-configuration issue.

## Decision log

| Date | Decision | Evidence |
|---|---|---|
| 2026-09-15 | Establish a controlled baseline before changing reader behavior. | Exploratory same-emulator measurements show a large, primarily native-memory difference and possible retention, but do not identify the owner. |
| 2026-09-15 | Treat the ten-cycle result as a plateau, while retaining post-reader memory as the Phase 2 target. | Cycles 2–10 oscillated within bounded reader/home RSS ranges with stable view counts; cycle 10 home remained 153.7 MB above cold-home RSS. |
| 2026-09-15 | Select bounded/on-demand word materialization as the first Phase 3 change; treat native teardown as secondary. | The no-eager-word isolate reduced reader RSS by 73.5 MB. Heap dumps confirmed one bounded detached reader with 6,402 words; clearing its model released reachability without materially lowering immediate native allocation. |
| 2026-09-16 | Accept the 400-word native window and advance to Phase 4. | Canonical reader/post-back RSS improved 93.8/87.2 MB on cycle 1, the ten-cycle run plateaued, jank and readiness did not regress, and required reader behavior checks passed. |
| 2026-09-16 | Revert the Phase 3 production word window and block Phase 4. | Real use exposed missing-pack loading, transition jumping, unchanged word-by-word memory, and incomplete download/transition coverage that the acceptance journey did not exercise. |
| 2026-09-16 | Stop mounting a hidden Mushaf WebView during translation reading. | The same-screen A/B removed the idle WebView and improved median PSS/RSS by 43.8/67.4 MB while the on-demand transition remained visually continuous and worked offline. |
| 2026-09-16 | Treat Greentech's small idle footprint as a reference, not proof of our heap owner. | Same-emulator main-process PSS/native-heap PSS were 76/18 MB for Greentech and 296/177 MB for our settled home; both had zero WebViews. Greentech used SQLite files; our exact native allocations still need profiling. |
| 2026-09-23 | Address the attributed Hermes/Worklets overhead through the supported SDK 57 runtime. | Expo 57.0.24 / RN 0.86.3 / Hermes 250829098.0.17 reduced five-launch median home RSS/PSS by 108.12/106.65 MiB; release build and verification passed. Reader/readiness acceptance is still open. |
| 2026-09-23 | Investigate reader data ownership and repeated processing next, preserving the current experience. | The user rejected RAM savings that degrade experience. Multiple model representations exist in source, but avoidable duplication and potential reader savings on SDK 57 remain unmeasured. Diagnose first; test one fix only after attribution. |
| 2026-09-23 | Keep native model reuse as a measured diagnostic, not a claimed memory fix. | Three matched journeys eliminated 21/21 eligible reparses versus 22/22 in control, saving about 29.1 ms of parsing and 4.47 MB of transient Java-thread allocation per call. Post-back RSS/PSS did not improve; focused content/audio/scroll/readiness checks passed, while full acceptance remains open. |
| 2026-09-23 | Implement native model reuse for the user's responsiveness goal. | Production revision/configuration guards and native tests prevent stale content; release A/B and offline/mode/navigation checks completed. CPU/allocation work is avoided, while a visible speedup and retained-RAM saving remain unproven. |

## Next action

**Native model reuse is implemented for the user's faster/smoother reading goal.** Do not repeat
its diagnostic or reinstate the reverted word-window implementation. The current evidence supports
avoiding redundant CPU/allocation work, not promising another RAM reduction or a visible speedup.

1. **Measure user-visible performance on physical devices.** Run matched frame-level reader/audio
   interaction and cold/warm/hot content-readiness benchmarks on a mid-range phone and a low-end
   phone. The SM-M145F USB lane is operational, but its single setup smoke and 5.46 GiB RAM do not
   satisfy either the repeated benchmark or 2–3 GB low-memory requirement. Preserve the tested modes,
   offline reading and target positioning. Use the startup work
   recorded in Phase 4 as the current source baseline; earlier APKs predate those later changes.
   Coarse emulator screenshots and small jank differences do not establish the ≤10% readiness gate.
2. **Investigate repeated JS normalization next if another reader optimization is requested.**
   Isolate the duplicate warm-route normalization identified above and measure its CPU/allocation
   cost before implementing anything. If retained RAM is the target, quantify the JS/offline graphs
   or native reader lifetime separately; distinguish useful caches from redundant copies and
   allocator high-water memory. Preserve the full-Surah experience and installed-pack behavior.
3. **Finish release hardening.** Physical low-memory/process-restoration tests, precise startup and
   frame benchmarks, downloaded Tafsir content, broader accessibility/widget checks and the other
   Phase 4 gates remain open. A major memory claim still requires a repeatable measured reduction
   without loading/scroll regressions. Do not combine savings from different builds or profiles.

Save future reader runs under `.artifacts/performance/reader-sdk57/`, with source/APK hashes,
settings metadata, raw measurements and limitations. The latest implementation evidence is in
`model-reuse-production/`; its matched two-translation A/B, later one-translation ten-cycle run,
and subsequent startup/signing/navigation changes must remain distinct.
