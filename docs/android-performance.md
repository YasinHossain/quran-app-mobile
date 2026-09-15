# Android Performance Program

## Purpose

This is the living handoff for Android performance work on Quran App Mobile. Every AI session must read this document and `AGENTS.md`, execute only the requested phase, save bulky output under `.artifacts/performance/`, and update this document before finishing.

The immediate problem is high and apparently retained memory around the Surah reader. The broader release goal also covers startup, rendering smoothness, app size, crashes/ANRs, battery, network, storage, and low-memory behavior.

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

### Hypotheses requiring Phase 2 evidence

1. The largest Surah increase comes from multiple simultaneous representations of full verse/word data across SQLite/offline rows, Hermes objects, React Native prop structures, and Kotlin models.
2. Full-Surah word loading and the requirement to finish all verses before mounting the native reader create an unnecessarily high peak.
3. Global bundled-Quran maps and caches explain a meaningful portion of cold-home and post-reader retention.
4. Native reader teardown leaves a view, adapter, callbacks, queued work, data, or recycled holders reachable after navigation.
5. Some post-navigation memory is allocator high-water memory rather than a reachable leak. Repeated allocation counts and heap reachability must distinguish these cases.

## Phase status

| Phase | Status | Exit gate |
|---|---|---|
| 1. Controlled baseline | Complete (2026-09-15) | Reusable harness and completed repeatable baseline artifacts |
| 2. Root-cause diagnosis | Complete (2026-09-15) | Evidence-ranked diagnosis with retained/allocation evidence |
| 3. Memory implementation | Complete (2026-09-16) | Bounded word window implemented; acceptance benchmark and behavior checks passed |
| 4. Release performance | Ready | Macrobenchmarks, size optimization, device validation, and release report |

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

Ready. Phase 3's memory exit gate is complete; do not repeat its implementation work unless a
Phase 4 regression identifies a specific need.

### Exit gate

Phase 4 is complete when the release candidate has repeatable benchmark evidence, passes the repository verification command, has been exercised on physical devices, and has no unresolved high-severity memory, crash, ANR, data-integrity, or release-configuration issue.

## Decision log

| Date | Decision | Evidence |
|---|---|---|
| 2026-09-15 | Establish a controlled baseline before changing reader behavior. | Exploratory same-emulator measurements show a large, primarily native-memory difference and possible retention, but do not identify the owner. |
| 2026-09-15 | Treat the ten-cycle result as a plateau, while retaining post-reader memory as the Phase 2 target. | Cycles 2–10 oscillated within bounded reader/home RSS ranges with stable view counts; cycle 10 home remained 153.7 MB above cold-home RSS. |
| 2026-09-15 | Select bounded/on-demand word materialization as the first Phase 3 change; treat native teardown as secondary. | The no-eager-word isolate reduced reader RSS by 73.5 MB. Heap dumps confirmed one bounded detached reader with 6,402 words; clearing its model released reachability without materially lowering immediate native allocation. |
| 2026-09-16 | Accept the 400-word native window and advance to Phase 4. | Canonical reader/post-back RSS improved 93.8/87.2 MB on cycle 1, the ten-cycle run plateaued, jank and readiness did not regress, and required reader behavior checks passed. |

## Next action

Execute Phase 4 only: add release benchmarks and hardening, beginning with the profileable
Macrobenchmark setup and preserving the Phase 3 canonical run as the reader-memory comparison.
