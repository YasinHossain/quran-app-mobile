# Implementation Roadmap (Mobile)

This document is the “what should I build next?” guide for `quran-app-mobile`. It’s optimized to avoid the common trap of **building UI first and then rewriting everything** when offline storage, audio, and persistence arrive.

## The short answer (do this next)

1) **Finish the core reading loop end-to-end (not just UI)**  
   Surah → verse actions → tafsir, with real persistence for **Pin/Bookmark + Last Read** (even if Planner stays stubbed).

2) **Implement Search (online first) + navigation to a verse**  
   This unlocks the everyday “find and jump” flow and forces the routing/data model to be correct.

3) **Lay the Offline foundation (downloads + storage), then apply it to ONE content type first**  
   Start with **Translations** (because they affect most screens), then extend to Tafsir, then Audio.

4) **Add Audio playback (streaming first), then offline audio downloads**  
   Don’t block everything on offline audio. Get a correct player state model first.

5) **Only then expand into Mushaf mode + advanced features**  
   Mushaf, tajweed rendering, word-by-word, word-sync highlighting are “after the spine is stable”.

## Working rules (avoid “implement then fix”)

- **Work in vertical slices**: ship one feature end-to-end (UI + data boundary + persistence) before starting 5 more screens.
- **Never fetch directly in screens long-term**: screens should consume hooks/services; repositories decide online vs offline.
- **Web is the UI/UX source of truth** (labels/order/actions). If mobile must diverge (offline downloads, native audio), document it.
- Keep `src/core/domain` + `src/core/application` **platform-agnostic**. Put storage, filesystem, audio, permissions in `src/core/infrastructure`.
- If a web feature isn’t ready on mobile yet, keep the UI and make the action a **stub/disabled** state (don’t remove it).

Related docs to follow while implementing:

- `docs/ai-workflow.md` (web → mobile conversion checklist)
- `docs/ui-parity.md` (roadmap + parity targets)
- `docs/ui-mapping.md` (HTML → RN mapping cheatsheet)
- `docs/components.md` (reuse before creating new UI)

## Recommended build order (phases)

### Phase 0 — Lock the “spine” contracts (foundation)

Do the minimum architecture decisions that prevent rewrites later:

- **Repository boundaries**: verses, bookmarks/pins/last-read, tafsir, audio, downloads.
- **Storage split**:
  - Small metadata/settings → key-value storage (already used for settings).
  - Large content (translations/tafsir/audio) → a dedicated content store (SQLite or file-based packs).
- **Download manager model**: queued/downloading/installed/failed + progress + delete/update.
- **Navigation truth**: define canonical “go to verse” params (verseKey vs surahId/ayahId) and use it everywhere.

### Phase 1 — Reader MVP (online) + real persistence

Goal: daily-usable reading experience even before offline.

- Surah reader parity (already started): settings affect rendering; verse actions sheet labels/order match web.
- Tafsir parity (already started): stable verse navigation + multiple tafsir tabs.
- Implement **Pin/Bookmark + Last Read** persistence because it unlocks:
  - Bookmarks tab
  - Verse actions (“Pin/Bookmark”)
  - Planner later (uses saved verses/positions)
- Implement Search results + “tap result → open Surah and scroll to ayah”.

### Phase 2 — Offline text (downloads) in a controlled way

Goal: make offline a feature you can extend, not a one-off hack.

- Add a **Downloads** area (mobile-only if web doesn’t have it): pick translations/tafsirs to download, show storage usage.
- Implement offline for **one** content type first:
  - Start with **Translation text** (selected translation IDs).
  - Then **Tafsir resources list**, then **Tafsir verse content**.
- Once text offline works, make Surah + Tafsir screens read from “offline first, online fallback”.

### Phase 3 — Audio (streaming → offline)

Goal: correct playback state before heavy offline downloads.

- Streaming audio: play/pause, current verse, next/prev, background controls (native affordances allowed).
- Then add offline audio downloads per reciter (and usually by surah/juz) using the same download manager.

### Phase 4 — Mushaf + advanced reader

Goal: add complexity only after the basics are stable.

- Mushaf mode/page view + mushaf font handling.
- Tajweed rendering mode.
- Word-by-word data + word highlighting.
- Word-sync highlighting with audio (optional; expensive).

### Phase 5 — Polish + release readiness

- Performance: list virtualization, memory limits for caches, fast startup.
- Reliability: offline/slow-network handling, retry flows, corruption recovery for downloads.
- Accessibility: touch targets, screen reader labels, focus order.
- Store prep: EAS builds, icons/splash, crash reporting if you use it.

## Web source-of-truth map (what to mirror)

Use these web areas as your starting point for parity (copy + order + behaviors):

- **Surah reader**: `../quran-app/app/(features)/surah` and dependencies listed in its `README.md` + `AGENTS.md`
- **Tafsir**: `../quran-app/app/(features)/tafsir`
- **Search**: `../quran-app/app/(features)/search`
- **Bookmarks / Pin / Last Read / Planner**: `../quran-app/app/(features)/bookmarks` (includes `pinned/`, `last-read/`, `planner/`)
- **Verse actions UI**: `../quran-app/app/shared/verse-actions`
- **Reader settings UI**: `../quran-app/app/shared/reader/settings`
- **Settings provider patterns**: `../quran-app/app/providers/SettingsContext.tsx` and `../quran-app/app/providers/bookmarks/*`
- **Mushaf/page view**: `../quran-app/app/(features)/page` and mushaf hooks under `../quran-app/app/(features)/surah/hooks`

## Offline-first strategy (how to do downloads without a rewrite)

### Decide early (one-time choices)

- **What is “offline by default”?**
  - Option A (recommended): ship a small “base text” (Arabic + verse keys + surah metadata) so the app still works offline without downloads.
  - Option B: require a first-time download, and show clear “Download to use offline” states.
- **Content store choice**:
  - If you want offline search and fast lookups → prefer a queryable store (e.g., SQLite).
  - If you only need offline reading by verseKey/surah → file-based packs can work (simpler, less query power).

### Build it once, then reuse everywhere

- Keep a single **Download Index** that answers: “Is translation 20 installed?”, “Which tafsir IDs are installed?”, “What’s the size?”, “When updated?”, “What failed?”.
- Make repositories/services read through the same rule:
  - “If installed locally → use local”
  - “Else → use network”
  - “Optionally: allow ‘download on demand’ when user enables it”

### Implement offline in this order (lowest rework)

1) Translation text packs (selected translation IDs)
2) Tafsir resources list (IDs + metadata)
3) Tafsir verse content packs (selected tafsir IDs)
4) Audio streaming playback
5) Audio offline packs (by reciter → by surah/juz)
6) Mushaf fonts/pages (only after mushaf mode exists)

### Where offline UI should live

- **Settings tab**: global Downloads management (translations, tafsir, audio, mushaf assets).
- **In-context**: show lightweight “Download translation” / “Download tafsir” prompts where the user hits the limitation (Surah/Tafsir screens), but keep the real controls centralized.

