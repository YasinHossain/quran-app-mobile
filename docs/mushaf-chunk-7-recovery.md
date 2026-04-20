# Mushaf Chunk 7 Recovery Guide (Mobile)

> **Last updated:** 2026-04-20
> **Status:** Recovery plan for the failed first Chunk 7 attempt

This document is the next instruction file for the exact downloadable mushaf optimization work after the first Chunk 7 attempt produced unstable behavior.

Use this file when asking an AI to continue the shared exact-reader work.

---

## Purpose

The first Chunk 7 attempt tried to move toward a shared exact reader, but it introduced bad behavior:

- page shaking
- only the first page rendering
- other pages staying on skeleton loading forever

The next AI should **not** continue from that design blindly.

This file explains:

- what likely went wrong
- what to keep from the recent work
- what to avoid
- how to re-approach Chunk 7 in smaller safe steps

---

## Read first

- `AGENTS.md`
- `docs/mushaf-qcf-optimization-roadmap.md`
- `app/page/[pageNumber].tsx`
- `components/mushaf/SharedExactMushafReader.tsx`
- `components/mushaf/MushafWebViewPage.tsx`
- `components/mushaf/webview/buildMushafWebViewDocument.ts`
- `hooks/useMushafPageData.ts`
- `src/core/infrastructure/mushaf/LocalMushafPageRepository.ts`
- `src/core/infrastructure/mushaf/MushafPackInstaller.ts`

---

## Current repo facts

At the time of writing:

- the route still uses the older vertical `FlashList` path in `app/page/[pageNumber].tsx`
- `components/mushaf/SharedExactMushafReader.tsx` exists, but should be treated as an unfinished experiment
- the page-addressable exact-pack format work is useful and should be kept
- the reusable shell plus payload-injection work inside `MushafWebViewPage` is useful and should be kept
- the failure appears to come from the attempted shared-reader architecture, not from the storage refactor

---

## Root cause of the failed attempt

The first shared-reader attempt likely failed because it still tied the live `WebView` to a list row.

That design causes a bad feedback loop:

1. The list starts from estimated row heights.
2. The active row mounts the real `WebView`.
3. The real page height differs from the estimate.
4. Row positions shift.
5. The active-page calculation changes.
6. The `WebView` jumps to a different row or never stabilizes.
7. Other rows remain skeleton placeholders.

This is why the user saw:

- shaking
- unstable rendering
- first page works, later pages stall

---

## Locked decisions for the recovery

- Keep the exact downloadable mushaf in a vertical feed for now.
- Do **not** switch to a horizontal pager in this recovery session.
- Keep the Unicode/native mushaf path untouched.
- Keep the page-addressable local pack format.
- Keep the split shell/payload WebView rendering model.
- Do **not** mount the real `WebView` as a normal child of whichever `FlashList` row is currently active.
- Do **not** use row-center math plus estimated heights as the primary source of truth for which row owns the live `WebView`.
- Do **not** merge all recovery work into one huge session.

---

## What to keep

These parts are worth preserving unless there is a concrete bug:

- page-addressable exact-pack storage in `MushafPackInstaller`
- page lookup and page cache work in `LocalMushafPageRepository`
- warm cache and nearby prefetch behavior in `useMushafPageData`
- reusable shell document plus injected render payload in `MushafWebViewPage`
- dev logs for `WebView` mount, first height, and page load timing

---

## What to throw away or rewrite

These ideas should not be reused as the final shared-reader design:

- a design where the real `WebView` belongs to the active list row
- a design where the active page is derived mainly from unstable estimated heights
- a design where placeholder rows are expected to “turn into” the real page renderer in place
- a design where a new `WebView` is effectively mounted every time the active page changes

If needed, the next AI may heavily rewrite or even replace `components/mushaf/SharedExactMushafReader.tsx`.

---

## Target architecture for the redo

The recovery target is:

- one long-lived exact `WebView`
- mounted once for the screen
- managed outside the row tree
- list rows used only as scroll structure and height anchors

That means:

- the vertical `FlashList` still provides scrolling
- the exact rows become placeholders or anchors
- a separate host layer owns the single live `WebView`
- when the active page changes, the existing `WebView` receives new payload
- the screen should never need multiple live exact `WebView`s during steady-state scroll

---

## Chunk 7A — Shared host scaffold

- Difficulty: `High`
- Codex mode: `high`
- Goal: create a real host-level shared exact reader without yet solving every visual detail.
- Target files:
- `app/page/[pageNumber].tsx`
- `components/mushaf/SharedExactMushafReader.tsx`
- `components/mushaf/MushafWebViewPage.tsx`
- Tasks:
- Replace the current per-row exact `WebView` path with a screen-level shared exact-reader entry point for exact packs only.
- Keep the old Unicode/native route behavior unchanged.
- Make the shared reader mount exactly one `MushafWebViewPage`.
- For now, rows may remain placeholders while the live page is rendered in a dedicated host container above or outside the list.
- Use `onViewableItemsChanged` as the first source of truth for visible range; avoid row-center math until the host is stable.
- Done when:
- exact mode uses one mounted `WebView`
- the route is actually wired to the shared reader
- initial exact page renders through the shared host

---

## Chunk 7B — Stable active-page selection

- Difficulty: `High`
- Codex mode: `high`
- Goal: make active-page switching stable without shaking.
- Target files:
- `components/mushaf/SharedExactMushafReader.tsx`
- `app/page/[pageNumber].tsx`
- Tasks:
- Choose a stable rule for the active page based on visible items, not unstable row-height guesses.
- Add hysteresis so tiny scroll changes do not swap the active page too early.
- Keep the currently rendered page until the next page is clearly the dominant visible page.
- Do not switch active page during transient layout correction if the next page data is not ready yet.
- Done when:
- scrolling no longer causes rapid active-page flipping
- the shared `WebView` stays visually stable during normal scroll

---

## Chunk 7C — Host positioning and row integration

- Difficulty: `Very High`
- Codex mode: `extra high`
- Goal: visually place the shared exact page in the scroll flow without reintroducing the old bug.
- Target files:
- `components/mushaf/SharedExactMushafReader.tsx`
- `app/page/[pageNumber].tsx`
- Tasks:
- Make the list rows act as fixed-height anchors using cached page heights.
- Position the shared `WebView` host relative to the active row anchor instead of making the row own the `WebView`.
- Ensure the active row placeholder does not visually clash with the shared live page.
- Keep page footer and spacing behavior coherent.
- Done when:
- the exact page appears in the correct scroll position
- the user can scroll through pages without seeing the old shaking loop
- only one exact `WebView` remains mounted

---

## Chunk 7D — Hardening and fallback behavior

- Difficulty: `High`
- Codex mode: `high`
- Goal: make the shared exact reader robust enough for daily use.
- Target files:
- `components/mushaf/SharedExactMushafReader.tsx`
- `components/mushaf/MushafWebViewPage.tsx`
- `hooks/useMushafPageData.ts`
- Tasks:
- Handle the case where the next active page data is still loading.
- Keep the current page rendered until replacement data is ready.
- Reset or ignore stale selection state when the active page changes.
- Confirm verse press, selection, and copy work against the currently displayed page only.
- Keep the dev logs that prove only one exact `WebView` is mounted.
- Done when:
- there is no permanent skeleton state
- page switches are resilient
- interactions still work from the shared exact renderer

---

## Explicit anti-goals

The next AI must **not** do these:

- do not rewrite the Unicode/native mushaf renderer
- do not remove the current page-addressable storage work
- do not introduce a pager mode in this recovery session
- do not mount multiple exact `WebView`s “temporarily” as a shortcut
- do not silently keep the old route path while claiming Chunk 7 is finished

---

## Acceptance checks

The recovery is only complete when all of these are true:

- exact mode is wired to the new shared-reader path
- only one exact `WebView` is mounted during steady-state scroll
- initial page renders correctly
- scrolling to later pages no longer leaves permanent skeletons
- no visible page shaking loop remains
- verse press, selection, and copy still work
- `npm run verify` passes

---

## Useful dev logs to check

The next AI should use the existing dev logs to prove the architecture is correct.

Most useful logs:

- `[mushaf-qcf][MushafWebViewPage] mount`
- `[mushaf-qcf][MushafWebViewPage] unmount`
- `[mushaf-qcf][MushafWebViewPage] first-content-height`
- `[mushaf-qcf][useMushafPageData] page-load-success`

Expected sign after Chunk 7 recovery:

- exact mode should show one mounted `WebView`, not several
- page loads should continue for later pages
- active page changes should not trigger a mount storm

---

## Safe handoff prompt for the next AI

Use this as the high-level task framing:

> Read `docs/mushaf-chunk-7-recovery.md` first. Recover Chunk 7 of the exact downloadable mushaf optimization work. Keep the page-addressable storage and shell/payload WebView split, but replace the failed shared-reader attempt with a real host-level single-WebView architecture. Do not mount the live WebView inside a FlashList row. Implement only one recovery chunk in this session and finish with `npm run verify`.
