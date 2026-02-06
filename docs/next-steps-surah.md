# Next Steps: Finish Surah Page (Mobile)

Use this doc as a step-by-step checklist for implementing the Surah reader screen with web-like parity.

**Target screen:** `app/surah/[surahId].tsx`  
**Parity goal:** ~90% with `../quran-app/app/(features)/surah`  
**Rule:** Keep shared core (`src/core/domain`, `src/core/application`) platform-agnostic. Put mobile-only adapters in `src/core/infrastructure`.

---

## Step 0 — Pre-flight

- Run `npm run verify` (should pass).
- Open the Surah screen and confirm the settings drawer opens from the top-right menu.
- Decide a “reference Surah” for visual parity checks (e.g. Al-Baqarah).

---

## Step 1 — Lock the UI structure (component extraction)

Goal: Make the Surah page easy to iterate on by extracting stable UI pieces.

- Extract **header** UI into `components/surah/SurahHeaderCard.tsx`:
  - Surah name (English)
  - Arabic name
  - Translated name
  - Verse count + revelation place
- Extract **verse** UI into `components/surah/VerseCard.tsx`:
  - Verse number badge
  - Arabic text block (right-aligned)
  - Translation text block
  - Spacing, borders, surface colors (match web feel)
- Keep `app/surah/[surahId].tsx` focused on screen layout + wiring only.

Acceptance:
- No visual change expected; same output, just cleaner structure.
- `npm run type-check` passes.

---

## Step 2 — Move data fetching into a hook

Goal: Keep network/state logic out of the screen component.

- Create `hooks/useSurahVerses.ts` (or `src/hooks/useSurahVerses.ts`) that owns:
  - Fetching chapter metadata
  - Fetching verses with pagination
  - `isLoading`, `errorMessage`, `isLoadingMore`
  - `refresh()` (for pull-to-refresh)
  - Safe `loadMore()` (protect against multiple triggers)
- Screen should call the hook and pass data into `SurahHeaderCard` + `VerseCard`.

Acceptance:
- Same UI as before.
- Pull-to-refresh works.
- Pagination does not duplicate pages.

---

## Step 3 — Match web verse-card parity

Goal: Make the verse cards feel like the web app.

- **Web reference (source of truth):**
  - Intro/header: `../quran-app/app/(features)/surah/components/surah-view/SurahCalligraphyIntro.tsx`
  - Verse rendering layout: `../quran-app/app/shared/reader/VerseCard.tsx` (default `variant="separated"`)
  - Verse wrapper in Surah: `../quran-app/app/(features)/surah/components/VerseCard.tsx` + `../quran-app/app/(features)/surah/components/Verse.tsx`
  - Verse key + ellipsis trigger: `../quran-app/app/shared/verse-actions/components/VerseActionTrigger.tsx`
  - Mobile actions sheet pattern: `../quran-app/app/shared/verse-actions/MobileBottomSheet.tsx` + `BottomSheetContent.tsx` + `BottomSheetHeader.tsx`

- Align typography scale:
  - Arabic uses `settings.arabicFontSize`
  - Translation uses `settings.translationFontSize`
- Match the **web verse header row**:
  - Show verse key like `2:3` (use API `verse_key`, not just `verse_number`)
  - Show per-verse **3-dot (ellipsis)** button on the right
  - Tapping ellipsis opens a **bottom sheet** menu (UI parity first; actions can be stubbed initially)
- Match spacing/radius/borders/surfaces:
  - Prefer **separated verses** (border-bottom + vertical padding), not big rounded cards
  - Number badge style, section separation, subtle highlight for “playing” (later)
- Ensure long Arabic + translation wrap correctly and remain readable.

Acceptance:
- Visual parity is “close enough” on both small and large phones.
- Verse key displays as `surah:ayah` (ex: `2:3`) and each verse shows the ellipsis trigger.
- Scrolling performance is still smooth.

---

## Step 4 — Make settings affect data and rendering

Goal: Settings drawer actually controls the reader.

- `settings.translationIds`:
  - Use it to control which translation IDs you request from the API.
  - Phase 1: support first translation only.
  - Phase 2: support multiple translations rendering (stack translations).
- `settings.showByWords`:
  - Phase 1: toggles placeholder UI state only (no WBW data).
  - Phase 2: implement WBW fetching and rendering.
- `settings.tajweed` / `settings.mushafId`:
  - Phase 1: UI-ready only (no mushaf pages).
  - Phase 2: implement mushaf mode and tajweed rendering.

Acceptance:
- Changing Translation in settings triggers refetch and updates verse cards.
- Font size sliders instantly update text size without refetch.

---

## Step 5 — Reader behaviors (polish)

Goal: Make the reader feel native and robust.

- Add/verify:
  - Pull-to-refresh UX
  - Better loading skeleton / spinners
  - Error state with retry button
  - Empty state messaging
- Navigation polish:
  - Header title uses fetched chapter name
  - Back behavior works reliably

Acceptance:
- No crashes on slow/no network.
- “Retry” recovers.

---

## Step 6 — After Surah is solid (next features unlocked)

Once Steps 1–5 are stable, implement:

- Bookmarks (tap on verse → bookmark) + persistence via `src/core/infrastructure`
- Last-read tracking per surah
- Search results → navigate to verse/surah with scroll-to-ayah

---

## Smoke checks (run after each step)

- `npm run verify`
- Open Surah → open settings drawer → toggle Night Mode
- Change Arabic/translation font size → verify it updates
- Scroll down → load more → no duplicates
- Pull-to-refresh → does not break state
