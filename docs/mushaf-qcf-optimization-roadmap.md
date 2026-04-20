# Mushaf QCF Optimization Roadmap (Mobile)

> **Last updated:** 2026-04-20
> **Status:** Planning only. No chunks implemented from this roadmap yet.

This document breaks the current QCF exact-mode performance work into small chunks that an AI agent can complete one by one.

The goal is to reduce:

- the first exact-page load cost
- small scroll hiccups in the vertical Mushaf feed
- unnecessary WebView mount and re-measure churn

This roadmap is only for the exact QCF/WebView path. It is not for the default bundled Unicode/native path.

---

## Read first

- `AGENTS.md`
- `docs/mushaf-offline-roadmap.md`
- `app/page/[pageNumber].tsx`
- `components/mushaf/MushafWebViewPage.tsx`
- `components/mushaf/webview/buildMushafWebViewDocument.ts`
- `hooks/useMushafPageData.ts`
- `src/core/infrastructure/mushaf/LocalMushafPageRepository.ts`
- `src/core/infrastructure/mushaf/MushafPackInstaller.ts`
- `src/core/infrastructure/mushaf/MushafPackFileStore.ts`

### Web reference files

These are useful for comparing the current mobile exact path with the lighter web path:

- `../quran-app/app/(features)/surah/components/surah-view/MushafMain.tsx`
- `../quran-app/app/(features)/surah/components/surah-view/MushafPageList.tsx`
- `../quran-app/app/(features)/surah/components/surah-view/MushafPage.tsx`

---

## Current bottlenecks

Based on the current mobile implementation:

- The vertical feed uses `FlashList`, but every visible exact page mounts a separate `WebView`.
- Every visible QCF page can load its own page font file such as `fonts/p1.woff2`, `fonts/p2.woff2`, and so on.
- Exact page height is discovered after WebView render, which causes extra measurement and item height correction.
- Installed exact packs currently read and parse a large payload JSON before page-level rendering work can start.
- Page-line mapping work can be repeated when pages are revisited.

This means the issue is not only raw FPS. It is also:

- WebView mount cost
- per-page font load cost
- height correction cost
- first-read data parse cost

---

## Locked decisions

- Do not switch to a horizontal pager as the first optimization.
- Keep the current vertical feed first, then measure again.
- Optimize the QCF exact path separately from the Unicode/native path.
- Preserve current verse tap, selection, copy, and native action-sheet behavior.
- Implement one chunk per session.
- Re-run verification after every chunk.
- Only attempt a shared WebView or pager architecture after the smaller wins are done and measured.

---

## Success checks

- Opening a QCF exact page feels noticeably faster than today.
- Only a small number of exact `WebView`s stay mounted around the viewport.
- Revisiting nearby pages does not cause obvious height jump or reflow jump.
- Fast scroll no longer shows the current small hiccup pattern as often.
- Verse press, selection, copy, bookmarks, and settings still work.
- `npm run verify` passes after every chunk.

---

## Chunk 0 — Baseline instrumentation

- Difficulty: `Low`
- Codex mode: `medium`
- Goal: measure the current problem before changing behavior.
- Target files: `app/page/[pageNumber].tsx`, `components/mushaf/MushafWebViewPage.tsx`, `hooks/useMushafPageData.ts`
- Tasks:
- Add lightweight dev-only timing logs for exact page load, WebView mount, and height report.
- Count how many exact `WebView`s are mounted at once.
- Measure how long first page data load takes for `qcf-madani-v1`.
- Keep logs behind a dev flag or a small local constant so they are easy to remove or disable.
- Done when: there is a repeatable baseline for initial load, mounted WebViews, and first height report timing.

## Chunk 1 — Active exact-page render window

- Difficulty: `High`
- Codex mode: `high`
- Goal: keep the vertical feed, but only mount real exact `WebView`s near the visible page.
- Target files: `app/page/[pageNumber].tsx`, `components/mushaf/MushafWebViewPage.tsx`
- Tasks:
- Track the visible or focused page range from `FlashList`.
- For exact packs only, render the real `MushafWebViewPage` only for a small window around the viewport such as current page `±1` or `±2`.
- Outside that active window, render a lightweight placeholder shell instead of a live `WebView`.
- Keep the Unicode/native path unchanged.
- Tune the active window so fast scroll does not show too many blank gaps.
- Done when: only a few exact `WebView`s can be alive at once and scroll feels steadier than before.

## Chunk 2 — Exact page height cache

- Difficulty: `Medium`
- Codex mode: `medium`
- Goal: stop exact pages from being re-measured from scratch every time they remount.
- Target files: `app/page/[pageNumber].tsx`, `components/mushaf/MushafWebViewPage.tsx`
- Tasks:
- Cache measured height by a stable key such as pack, version, page number, scale step, and viewport signature.
- Feed cached heights back into placeholders and item estimates before remount.
- Avoid unnecessary height state updates when the measured height is effectively unchanged.
- Reuse cached height when a page leaves and re-enters the active render window.
- Done when: revisiting a nearby exact page does not cause a visible jump from estimated height to final height.

## Chunk 3 — Page data cache and nearby prefetch

- Difficulty: `Medium`
- Codex mode: `medium`
- Goal: reduce repeated page work when the user scrolls around the same local range.
- Target files: `hooks/useMushafPageData.ts`, `src/core/infrastructure/mushaf/LocalMushafPageRepository.ts`
- Tasks:
- Add an in-memory page cache keyed by pack, version, and page number for resolved exact page data.
- Reuse cached `pageLines` instead of recomputing them on every revisit.
- Prefetch nearby pages such as previous and next page after the current exact page resolves.
- Clear or invalidate cache correctly when the selected mushaf pack or active version changes.
- Done when: scrolling back to recently visited pages avoids most repeated page reconstruction work.

## Chunk 4 — Install-time page-addressable exact pack format

- Difficulty: `High`
- Codex mode: `high`
- Goal: stop treating the exact pack as one large runtime payload for first-read performance.
- Target files: `src/core/infrastructure/mushaf/MushafPackInstaller.ts`, `src/core/infrastructure/mushaf/MushafPackFileStore.ts`, relevant types under `types/`
- Tasks:
- Introduce a page-addressable local format for exact downloadable packs.
- Preferred approach: write one page payload per page at install time, or write an equivalent page-addressable SQLite structure.
- Store whatever lookup metadata is needed so runtime reads can fetch only one page.
- Keep the hosted contract stable if possible; do the format conversion locally during install.
- Keep bundled Unicode pack behavior unchanged.
- Done when: a newly installed exact pack can be read page-by-page without requiring one large payload read first.

## Chunk 5 — Runtime repository switch to page-addressable reads

- Difficulty: `High`
- Codex mode: `high`
- Goal: make runtime exact-page loads use the new page-addressable format.
- Target files: `src/core/infrastructure/mushaf/LocalMushafPageRepository.ts`, `hooks/useMushafPageData.ts`
- Tasks:
- Update the repository to load only the requested page from the installed exact pack.
- Keep backward-compatible fallback support if older exact installs still exist locally.
- Preserve bundled Unicode pack reads and current repository interface shape unless a narrow change is clearly better.
- Cache page-level results after first read.
- Done when: opening the first QCF exact page no longer depends on parsing a large whole-pack payload at runtime.

## Chunk 6 — Shared exact renderer shell

- Difficulty: `High`
- Codex mode: `high`
- Goal: reduce per-page document boot work inside exact `WebView`s.
- Target files: `components/mushaf/MushafWebViewPage.tsx`, `components/mushaf/webview/buildMushafWebViewDocument.ts`, new local renderer asset files if needed
- Tasks:
- Replace the fully rebuilt per-page HTML string with a reusable renderer shell where practical.
- Move stable CSS and JS boot code into a shared shell asset or a stable document builder path.
- Pass page payload and layout data separately instead of rebuilding the entire renderer document every time.
- Preserve the current native bridge messages for selection and word press.
- Done when: exact page changes mostly swap data, not the whole renderer boot document.

## Chunk 7 — Single shared WebView exact reader

- Difficulty: `Very High`
- Codex mode: `extra high`
- Goal: remove the multi-WebView architecture from exact mode entirely.
- Target files: `app/page/[pageNumber].tsx`, `components/mushaf/MushafWebViewPage.tsx`, new shared exact reader components
- Tasks:
- Replace per-row exact `WebView`s with one long-lived shared exact renderer.
- Keep current native header, settings, and action-sheet flows.
- Load the current page into the shared renderer and update it in place instead of mounting a new browser surface for each page.
- Keep at least current, previous, and next page data easy to swap so transitions stay responsive.
- Preserve native verse actions, selection, copy, and word press behavior.
- Done when: exact mode uses one persistent `WebView` instead of several isolated `WebView`s in the feed.

## Chunk 8 — Optional pager or page-by-page reading mode

- Difficulty: `Very High`
- Codex mode: `extra high`
- Goal: only if product direction wants a page-by-page Mushaf experience after the earlier chunks are done.
- Target files: `app/page/[pageNumber].tsx`, new exact reader navigation components
- Tasks:
- Decide whether this is a new mode or a full replacement for the vertical feed.
- Implement previous/next page transitions on top of the shared exact renderer.
- Support RTL-aware swiping only if it is explicitly desired as a UX decision, not only as a performance hack.
- Preserve direct navigation to a requested page number.
- Done when: exact mode can operate as a true page reader with one page on screen at a time.

---

## Recommended execution order

1. `Chunk 0`
2. `Chunk 1`
3. `Chunk 2`
4. `Chunk 3`
5. `Chunk 4`
6. `Chunk 5`
7. `Chunk 6`
8. `Chunk 7`
9. `Chunk 8` only if the product direction wants a pager or single-page reading UX

---

## Recommended stop points

Measure after these points before continuing:

- After `Chunk 2`: decide whether active window plus height caching already removes most hiccups.
- After `Chunk 5`: decide whether page-addressable storage already makes first exact-page load good enough.
- After `Chunk 7`: only continue to pager mode if the team actually wants page-by-page reading.

---

## Notes for future AI sessions

- Keep changes scoped to exact QCF performance work only.
- Do not rewrite the Unicode/native Mushaf path unless a shared helper naturally benefits both paths.
- Do not mix storage-format work and shared-WebView architecture work in the same session.
- Favor measurable improvements over large refactors.
- Finish each chunk with `npm run verify`.
