# Mushaf Offline Roadmap (Mobile)

> **Last updated:** 2026-04-19
> **Status:** Chunks 0-10 implemented. Chunk 11 is next.

This document is the step-by-step guide for building the mobile mushaf page reader with:

- one bundled offline-safe default mushaf
- optional downloadable exact mushaf packs
- web-parity layout behavior for exact modes
- no PDF dependency for the main mushaf experience

---

## Read first

- `AGENTS.md`
- `docs/ui-parity.md`
- `docs/components.md`
- `docs/offline-mode-roadmap.md`
- `../quran-app/app/(features)/surah/components/surah-view/*`
- `../quran-app/app/(features)/surah/hooks/*mushaf*`

---

## Locked decisions

- Ship one bundled default pack: `unicode-uthmani-v1`.
- First downloadable exact pack: `qcf-madani-v1`.
- The bundled default mushaf uses native React Native text rendering.
- Exact downloadable mushaf packs use a local WebView renderer.
- Exact layout stays exact only when it fits; otherwise switch to centered RTL reflow before lines break.
- Use stepped mushaf size presets from the web, not free zoom.
- Do not use PDF as the main mushaf solution.
- Keep pack versions separate on disk and in metadata.

---

## Final architecture

### 1. Bundled default mushaf

- Pack ID: `unicode-uthmani-v1`
- Availability: bundled in the app, always offline
- Renderer: native React Native text
- Purpose: fast, safe default mode that works on first launch with no download

### 2. Optional exact mushaf packs

- First pack: `qcf-madani-v1`
- Future packs: `qcf-madani-v2`, `qcf-tajweed-v4`, optional IndoPak/QPC packs if needed
- Availability: downloadable hosted file packs
- Renderer: local WebView
- Purpose: exact page layout, exact glyph positioning, web-parity reflow behavior

### 3. Shared offline rule

- If required content is installed locally, read locally
- Else fetch or download it
- If offline and not installed, show a clear install/download-needed state

This matches the translation architecture direction, but the mushaf storage shape is different:

- translations write into app SQLite tables
- mushaf uses versioned local pack files plus install metadata

---

## Web source of truth

- `../quran-app/app/(features)/surah/components/surah-view/MushafMain.tsx`
- `../quran-app/app/(features)/surah/components/surah-view/MushafPageList.tsx`
- `../quran-app/app/(features)/surah/components/surah-view/MushafPage.tsx`
- `../quran-app/app/(features)/surah/components/surah-view/MushafLines.tsx`
- `../quran-app/app/(features)/surah/components/surah-view/MushafLine.tsx`
- `../quran-app/app/(features)/surah/components/surah-view/MushafReflowContent.tsx`
- `../quran-app/app/(features)/surah/components/surah-view/MushafWordText.tsx`
- `../quran-app/app/(features)/surah/hooks/useMushafReadingView.ts`
- `../quran-app/app/(features)/surah/hooks/qcfScalePresets.ts`
- `../quran-app/app/(features)/surah/hooks/mushafFontScale.ts`
- `../quran-app/src/infrastructure/quran/readingViewClient.ts`
- `../quran-app/src/infrastructure/quran/pagesLookupClient.ts`

---

## AI working rules

- Implement exactly one chunk per session.
- Start every chunk by reading the listed web files and current mobile targets.
- Reuse existing mobile settings, audio, bookmarks, verse actions, and download index patterns.
- Keep Expo/RN code in `src/core/infrastructure` or UI layers; do not put Expo APIs in `src/core/domain` or `src/core/application`.
- Finish every chunk with `npm run verify`.
- Update `docs/ui-parity.md` and `docs/components.md` when a chunk changes parity or adds reusable UI.

---

## Pack contract

Hosted mushaf packs must use a stable contract from the beginning.

### Hosted catalog

The app fetches a hosted catalog or manifest that includes:

- `packId`
- `version`
- `renderer`
- `script`
- `lines`
- `downloadUrl`
- `checksum`
- `sizeBytes`
- optional compatibility fields

### Local install path

Downloaded packs are stored under:

- `documentDirectory/mushaf-packs/{packId}/{version}/`

Each installed pack can contain:

- `manifest.json`
- `pack.sqlite` or another locked local data file format
- optional renderer assets
- optional fonts

### App DB metadata

The main app DB tracks install state and active version only. It does not store the full mushaf payload.

---

## Chunk 0 — Contracts and settings

- Difficulty: `Low`
- Codex mode: `medium`
- Status: `Done`
- Goal: add stable mushaf pack types and settings before any UI work.
- Target files: `types/mushaf.ts`, `types/settings.ts`, `data/mushaf/options.ts`, `providers/settingsStorage.ts`
- Tasks:
- Add pack/channel/version metadata to mushaf types.
- Add `mushafScaleStep`.
- Redefine mushaf options around pack IDs instead of generic font labels.
- Done when: settings can represent bundled base mode, exact pack channels, and stepped size without changing rendering yet.

## Chunk 1 — Download index and install registry

- Difficulty: `Medium`
- Codex mode: `high`
- Status: `Done`
- Goal: make mushaf packs first-class downloadable content.
- Target files: `src/core/domain/entities/DownloadIndexItem.ts`, DB migrations, new mushaf install registry store
- Tasks:
- Add `kind: 'mushaf-pack'`.
- Create install metadata table.
- Define installed-version lookup.
- Done when: the app can record queued/downloading/installed/failed state for a mushaf pack and resolve the active installed version.

## Chunk 2 — Bundled Unicode base pack

- Difficulty: `Medium`
- Codex mode: `high`
- Status: `Done`
- Goal: seed one offline-safe mushaf that always works without downloads.
- Target files: bundled pack asset path, app startup bootstrap, pack registration code, `app/_layout.tsx`
- Tasks:
- Add bundled `unicode-uthmani-v1` manifest and local payload.
- Register it on first launch as an installed bundled pack.
- Keep only the base bundled mushaf font required for the Unicode default mode.
- Remove non-default mushaf fonts from eager startup loading.
- Done when: airplane-mode first launch can open mushaf pages from the bundled pack and the app no longer preloads all optional mushaf fonts.

## Chunk 3 — Hosted pack catalog and file installer

- Difficulty: `High`
- Codex mode: `high`
- Status: `Done`
- Goal: support versioned downloadable packs from hosted files.
- Target files: new mushaf pack installer/store in `src/core/infrastructure`
- Tasks:
- Fetch hosted pack metadata from a catalog/manifest.
- Download pack files into `documentDirectory/mushaf-packs/{packId}/{version}/`.
- Verify checksum and manifest.
- Keep old versions separate.
- Support delete and active-version switching.
- Done when: install/delete/update flows work for hosted mushaf packs without touching the bundled Unicode pack.

## Chunk 4 — Local mushaf page data reader

- Difficulty: `High`
- Codex mode: `high`
- Status: `Done`
- Goal: read page, line, verse, and word metadata from installed packs through one code path.
- Target files: new mushaf page repository/store, `app/page/[pageNumber].tsx` data hook layer
- Tasks:
- Expose page lookup, page lines, verse ranges, and word metadata locally.
- Resolve the active installed version for a selected pack.
- Do not call network for bundled/offline pages.
- Done when: a page can be fully loaded from a local pack with no renderer logic mixed into the data layer.

## Chunk 5 — Native page screen shell

- Difficulty: `Medium`
- Codex mode: `high`
- Status: `Done`
- Goal: replace the placeholder page route with the real mushaf shell.
- Target files: `app/page/[pageNumber].tsx`, navigation helpers, settings entry points
- Tasks:
- Build header, page navigation, settings access, and loading/error/offline states.
- Hook the screen to the local mushaf page repository.
- Make the route the canonical mushaf screen.
- Done when: the page route is a real screen and no longer a placeholder.

## Chunk 6 — Native Unicode renderer

- Difficulty: `High`
- Codex mode: `high`
- Status: `Done`
- Goal: render the bundled default mushaf without WebView.
- Target files: new native Unicode mushaf components under `components/` or `app/`
- Tasks:
- Render page lines and words from the bundled local pack using React Native text.
- Use `mushafScaleStep` for stepped sizing.
- Keep selection, copy, and navigation compatible with later exact-mode behavior.
- Done when: `unicode-uthmani-v1` pages render offline as the default mushaf mode in the real page screen.

## ✅ Chunk 7 — Local WebView exact renderer foundation

- Difficulty: `Very High`
- Codex mode: `extra high`
- Goal: create the local exact-mode renderer used only by downloadable exact packs.
- Target files: new mushaf WebView component and local renderer assets
- Tasks:
- Port the web page/line/reflow rendering model into local HTML/CSS/JS.
- Pass page payload into WebView.
- Keep the RN shell native.
- Restrict this renderer to exact downloadable packs.
- Done when: the page screen can switch between native Unicode mode and WebView exact mode based on the selected pack.

## Chunk 8 — Stepped presets and auto-reflow for exact packs

- Difficulty: `Very High`
- Codex mode: `extra high`
- Status: `Done`
- Goal: bring over the web exact-mode sizing and overflow rules.
- Target files: WebView renderer sizing logic, mobile preset mapping
- Tasks:
- Port stepped scale presets from the web.
- Add fit detection.
- Switch to centered RTL reflow before exact lines break.
- Remove any free-zoom path for exact modes.
- Done when: phone and tablet behavior matches the web rule of exact-on-fit and reflow-on-overflow for exact packs.

## Chunk 9 — QCF V1 exact downloadable pack

- Difficulty: `Very High`
- Codex mode: `extra high`
- Status: `Done`
- Goal: make the first exact mushaf pack real and installable.
- Target files: pack manifest/catalog logic, QCF page-font loading inside WebView renderer, settings/download UI entry points
- Tasks:
- Support `qcf-madani-v1` as a downloadable exact pack with per-page fonts and versioned assets.
- Make the page screen use the exact WebView renderer for this pack.
- Done when: users can install QCF V1, select it, and render exact pages offline.

## Chunk 10 — Interaction bridge

- Difficulty: `Very High`
- Codex mode: `extra high`
- Status: `Done`
- Goal: keep mushaf interactions native while exact layout stays in WebView.
- Target files: WebView bridge layer, `VerseActionsSheet`, bookmarks/planner/audio integration
- Tasks:
- Emit `verseKey` and `wordPosition`.
- Open native verse actions from verse marker tap.
- Support word tap behavior.
- Preserve text copy and selection metadata.
- Done when: verse actions, bookmark/add-to-plan, word tap, and copy all work from mushaf mode.

## Chunk 11 — Offline audio timing and mushaf sync

- Difficulty: `Very High`
- Codex mode: `extra high`
- Goal: keep word highlight and seek working offline.
- Target files: audio download store, timing metadata persistence, mushaf highlight bridge
- Tasks:
- Save verse timing and segment metadata with downloaded audio.
- Map `verseKey + wordPosition` to timings.
- Highlight and seek locally.
- Done when: downloaded audio plus downloaded/installed mushaf pages support offline sync.

## Chunk 12 — Pack management UI and finish pass

- Difficulty: `Medium`
- Codex mode: `high`
- Goal: make mushaf packs manageable and documented.
- Target files: `components/reader/settings/SettingsSidebarContent.tsx`, downloads UI, `docs/ui-parity.md`, `docs/components.md`
- Tasks:
- Show bundled, downloaded, update, and delete states.
- Expose mushaf pack selection.
- Document parity and reusable components.
- Done when: the mushaf feature is discoverable, manageable, and documented.

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
9. `Chunk 8`
10. `Chunk 9`
11. `Chunk 10`
12. `Chunk 11`
13. `Chunk 12`

---

## Acceptance checks

- Fresh install in airplane mode opens mushaf via bundled `unicode-uthmani-v1`.
- Default mushaf mode works without any hosted download.
- Exact QCF V1 can be downloaded, selected, deleted, and updated by version.
- Page layout never enters a broken half-exact state on phone widths.
- Verse actions, copy, bookmarks, and word taps still work in mushaf mode.
- Offline audio sync works when the reciter audio and timing metadata are installed.
- `npm run verify` passes after every chunk.

---

## Assumptions

- `react-native-webview` is the only new library added for parity-critical exact layout reasons.
- The page route is the canonical mushaf screen in v1; the surah screen links into it instead of duplicating the renderer inline.
- Existing translation and tafsir offline stores remain separate and are reused by mushaf actions instead of being duplicated into mushaf packs.
- Hosted translation packs can later reuse the same hosted catalog, downloader, integrity checks, and install-management pattern, even though their local storage shape will remain different from mushaf packs.
