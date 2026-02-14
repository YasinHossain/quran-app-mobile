# Offline Mode Roadmap (Mobile)

> **Last updated:** 2026-02-11
> **Status:** Chunks 0–8 complete. Next up: Chunk 9A (tafsir download via `by_chapter`), then Chunk 9B (full tafsir pack).

This document is the step-by-step guide for offline support in `quran-app-mobile`.
It covers translations, tafsir, audio, word-by-word, and optional offline search.

---

## Table of Contents

- [What "offline" means](#what-offline-means-in-this-app)
- [Architecture overview](#architecture-overview)
- [Storage plan](#storage-plan)
- [How to use this roadmap](#how-to-use-this-roadmap)
- [Phase A — Completed (Chunks 0–8)](#phase-a--completed-chunks-08)
- [Phase B — Feature Buildout (Chunks 9–18)](#phase-b--feature-buildout-chunks-918)
- [Phase C — Production Migration](#phase-c--production-migration-hosted-pack-files)

---

## What "offline" means in this app

Offline is not one feature. It's a **data boundary**:

- **If content is installed locally → read from local store**
- **Else → fetch from network**
- **If there's no network + not installed → show a clear "Download to use offline" state**

---

## Architecture overview

### Current Phase (A) — API-Bulk Downloads at Runtime

During development, packs are built at runtime by calling the quran.com v4 API:
- Translation pack: ~114 requests (one per surah) when `per_page=300` (max ayahs/surah is 286), stored in SQLite
- Tafsir pack (target): ~114 requests (one per surah) using `tafsirs/{id}/by_chapter/{surahId}?per_page=300&page=1`, stored in SQLite
- Tafsir pack (current): per-verse (`by_ayah`) caching + bounded surah download (fine for small scope, too chatty for full packs)

### Production Phase (C) — Self-Hosted Pack Files

Before production launch, the download source will change to **self-hosted file packs**:
- A build script (runs on your machine) calls the API, generates one `.sqlite` or `.json.gz` file per translation/tafsir
- Files are hosted on a CDN (Cloudflare R2 free tier, AWS S3, or GitHub Releases)
- A `manifest.json` stores metadata including file sizes (this is how apps like Green Tech and IRD show "1.2 MB" before download)
- The app downloads one file per pack instead of 114+ API calls
- **Everything else (SQLite schema, Download Index, offline-first hooks) stays the same**

The migration from Phase A → Phase C only changes the download function, not the storage or reading layer.

**Pack contract (keep stable):** both Phase A and Phase C must populate the same SQLite tables (`offline_verses`, `offline_translations`, `offline_tafsir`) so that readers/search only ever talk to one local source of truth.

---

## Offline downloads are "packs"

| Pack type | What it contains | Scope |
|---|---|---|
| Translation pack | All 6,236 verses for one `translationId` | Whole Quran |
| Tafsir pack | All tafsir entries for one `tafsirId` | Per surah or whole Quran |
| Audio pack | Audio files for one `reciterId` | Per surah |
| Word-by-word pack | Word data for one surah | Per surah |

---

## Storage plan

| Store | What goes there | Tech |
|---|---|---|
| **AsyncStorage** | Settings, bookmarks, last-read, planner, **Download Index metadata** | `@react-native-async-storage/async-storage` via `lib/storage/appStorage.ts` |
| **SQLite** | Translation text, tafsir text, word-by-word data, offline search indexes (FTS) | `expo-sqlite` via `src/core/infrastructure/db/` |
| **Filesystem** | Audio files and other large binary assets (paths stored in SQLite/AsyncStorage) | `expo-file-system` (to be added) |

---

## How to use this roadmap

- Implement **one chunk at a time** (don't combine chunks).
- After each chunk: run `npm run verify` (`tsc --noEmit && check:core`).
- Keep `src/core/domain` + `src/core/application` platform-agnostic — no Expo/React Native imports.
- Put Expo/React Native APIs (SQLite, filesystem, permissions, audio) in `src/core/infrastructure`.
- Each chunk is sized to be "healthy" for an AI: big enough to finish something real, small enough to review safely.

---

## Codebase context (for AI agents)

This section summarizes what already exists so new chunks can be implemented without re-reading the whole codebase.

### Key files and modules

| Area | Key files | Purpose |
|---|---|---|
| **Domain entities** | `src/core/domain/entities/DownloadIndexItem.ts` | `DownloadableContent` union type (translation, tafsir, audio, words), `DownloadStatus`, `DownloadProgress`, `DownloadKey`, type guards |
| **Domain repos** | `src/core/domain/repositories/IDownloadIndexRepository.ts` | Interface: `get()`, `upsert()`, `remove()`, `listAll()` |
| | `src/core/domain/repositories/ITranslationOfflineStore.ts` | Interface: `upsertVersesAndTranslations()`, `getSurahVersesWithTranslations()`, `deleteTranslation()` |
| | `src/core/domain/repositories/ITafsirRepository.ts` | Interface: `getTafsirByVerse()`, `getAllResources()`, `getResourcesByLanguage()`, `cacheResources()`, `getCachedResources()` |
| | `src/core/domain/repositories/ITranslationDownloadRepository.ts` | Interface: `getChapterVersesPage()` |
| | `src/core/domain/repositories/IChapterVerseKeysRepository.ts` | Interface: `getChapterVerseKeys()` |
| **Infra — DB** | `src/core/infrastructure/db/appDb.ts` | Opens + caches the SQLite database |
| | `src/core/infrastructure/db/migrations.ts` | Schema versions 1–3: `app_meta`, `offline_verses`, `offline_translations`, `offline_tafsir` |
| **Infra — Offline** | `src/core/infrastructure/offline/TranslationOfflineStore.ts` | SQLite implementation of `ITranslationOfflineStore` |
| **Infra — Repos** | `src/core/infrastructure/repositories/DownloadIndexRepository.ts` | AsyncStorage implementation of `IDownloadIndexRepository` |
| | `src/core/infrastructure/repositories/TafsirRepository.ts` | Offline-first `getTafsirByVerse()`: reads SQLite first, falls back to API, then caches result in SQLite |
| | `src/core/infrastructure/repositories/QuranComTranslationDownloadRepository.ts` | Fetches verse pages from quran.com v4 API |
| | `src/core/infrastructure/repositories/QuranComChapterVerseKeysRepository.ts` | Fetches verse keys for a chapter from quran.com v4 API |
| **Infra — DI** | `src/core/infrastructure/di/container.ts` | Service locator for repository instances |
| **Use cases** | `src/core/application/use-cases/DownloadTranslation.ts` | Downloads one translation (114 surahs → SQLite), updates Download Index |
| | `src/core/application/use-cases/DeleteTranslation.ts` | Deletes a translation from SQLite + Download Index |
| | `src/core/application/use-cases/DownloadTafsirSurah.ts` | Downloads tafsir for one surah + selected tafsir IDs, verse by verse |
| | `src/core/application/use-cases/GetTafsirContent.ts` | Gets tafsir content for a verse (local-first) |
| | `src/core/application/use-cases/ListDownloadIndexItems.ts` | Lists all download index entries |
| | `src/core/application/use-cases/SetDownloadIndexItemState.ts` | Updates status of a download |
| | `src/core/application/use-cases/RemoveDownloadIndexItem.ts` | Removes a download entry |
| | `src/core/application/use-cases/ClearDownloadIndexErrors.ts` | Clears error state from failed downloads |
| **Hooks** | `hooks/useChapters.ts` | Cached-first chapter list (AsyncStorage cache + API refresh) |
| | `hooks/useSurahVerses.ts` | Offline-first verse reader: checks if translations are installed → reads SQLite, else API. Shows `offlineNotInstalled` state |
| | `hooks/useDownloadIndexItems.ts` | Polls download index for status/progress updates |
| | `hooks/useTranslationResources.ts` | Fetches available translation resources |
| | `hooks/useTafsirResources.ts` | Fetches available tafsir resources |
| **Screens** | `app/downloads/index.tsx` | Downloads management: list translations, download/delete, show progress |
| | `app/surah/[surahId].tsx` | Surah reader. Audio stub: `Alert.alert('Audio coming soon')` |
| | `app/page/[pageNumber].tsx` | Mushaf page reader — placeholder only ("Page reader screen is coming next") |
| | `app/(tabs)/index.tsx` | Home/Surah list — uses `useChapters()` |

### SQLite schema (current: version 3)

```sql
-- v1
CREATE TABLE app_meta(key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);

-- v2
CREATE TABLE offline_verses(
  verse_key TEXT PRIMARY KEY NOT NULL, surah INTEGER NOT NULL,
  ayah INTEGER NOT NULL, arabic_uthmani TEXT NOT NULL
);
CREATE TABLE offline_translations(
  translation_id INTEGER NOT NULL, verse_key TEXT NOT NULL, text TEXT NOT NULL,
  PRIMARY KEY(translation_id, verse_key),
  FOREIGN KEY(verse_key) REFERENCES offline_verses(verse_key) ON DELETE CASCADE
);
CREATE INDEX idx_offline_verses_surah_ayah ON offline_verses(surah, ayah);
CREATE INDEX idx_offline_translations_verse_key ON offline_translations(verse_key);

-- v3
CREATE TABLE offline_tafsir(
  tafsir_id INTEGER NOT NULL, verse_key TEXT NOT NULL, html TEXT NOT NULL,
  PRIMARY KEY(tafsir_id, verse_key)
);
```

### DownloadableContent union (already supports future kinds)

```typescript
type DownloadableContent =
  | { kind: 'translation'; translationId: number }
  | { kind: 'tafsir'; tafsirId: number }
  | { kind: 'tafsir'; scope: 'surah'; surahId: number; tafsirId: number }
  | { kind: 'audio'; reciterId: number; scope: 'surah'; surahId: number }
  | { kind: 'words'; scope: 'surah'; surahId: number };
```

---

# Phase A — Completed (Chunks 0–8)

All chunks below are **done**. They are listed here for reference and context.

## ✅ Chunk 0 — Make "Read" survive offline (chapters cache)

**Status: DONE**

**What was built:**
- `hooks/useChapters.ts` — cached-first hook that loads from AsyncStorage, then refreshes from API.
- `lib/storage/chaptersStorage.ts` — AsyncStorage chapter list cache.
- `app/(tabs)/index.tsx` uses `useChapters()` instead of direct fetch.

**Result:** Airplane mode still shows previously loaded Surah list.

---

## ✅ Chunk 1 — Download Index (offline metadata contract)

**Status: DONE**

**What was built:**
- `src/core/domain/entities/DownloadIndexItem.ts` — domain types for `DownloadableContent`, `DownloadStatus`, `DownloadProgress`, `DownloadKey`, type guards.
- `src/core/domain/repositories/IDownloadIndexRepository.ts` — platform-agnostic interface.
- `src/core/infrastructure/repositories/DownloadIndexRepository.ts` — AsyncStorage implementation.
- Use cases: `ListDownloadIndexItems`, `SetDownloadIndexItemState`, `RemoveDownloadIndexItem`, `ClearDownloadIndexErrors`.

**Result:** Can mark "translation 20 installed" and read it back after app restart.

---

## ✅ Chunk 2 — SQLite foundation + migrations scaffold

**Status: DONE**

**What was built:**
- `expo-sqlite` added to dependencies.
- `src/core/infrastructure/db/appDb.ts` — DB wrapper (open + cache).
- `src/core/infrastructure/db/migrations.ts` — migration runner with schema versioning (PRAGMA user_version).
- Schema v1: `app_meta` table.

**Result:** App can open DB and run migrations without crashing.

---

## ✅ Chunk 3 — Translation Offline Store (read/write API)

**Status: DONE**

**What was built:**
- Schema v2: `offline_verses` + `offline_translations` tables with indexes.
- `src/core/domain/repositories/ITranslationOfflineStore.ts` — interface.
- `src/core/infrastructure/offline/TranslationOfflineStore.ts` — SQLite implementation with `upsertVersesAndTranslations()`, `getSurahVersesWithTranslations()`, `deleteTranslation()`.

**Result:** Can insert and read back sample translation data by surah.

---

## ✅ Chunk 4 — DownloadTranslation use-case (end-to-end, no UI)

**Status: DONE**

**What was built:**
- `src/core/application/use-cases/DownloadTranslation.ts` — downloads one translation (114 surahs, paginated per surah), strips HTML, stores in SQLite, updates Download Index (queued → downloading with progress → installed/failed).
- `src/core/domain/repositories/ITranslationDownloadRepository.ts` — interface.
- `src/core/infrastructure/repositories/QuranComTranslationDownloadRepository.ts` — fetches from quran.com v4 API.

**Efficiency note:** ensure the downloader uses `per_page=300` so each surah is 1 request (114 total). If `per_page` is smaller (e.g., 50), some surahs will need multiple pages and the total request count increases.

**Result:** Calling the use-case installs a translation persistently.

---

## ✅ Chunk 5 — Downloads UI (translations only)

**Status: DONE**

**What was built:**
- `app/downloads/index.tsx` — Downloads screen with translation list, download/delete actions, progress display ("X/114 surahs").
- `hooks/useDownloadIndexItems.ts` — polls download index for live status updates.
- `src/core/application/use-cases/DeleteTranslation.ts` — deletes translation data from SQLite + Download Index.

**Result:** Download works, persists, and delete clears installed state.

---

## ✅ Chunk 6 — Surah reader offline-first (translations)

**Status: DONE**

**What was built:**
- `hooks/useSurahVerses.ts` — offline-first logic: checks if requested `translationIds` are installed → reads from SQLite, else falls back to API. Exposes `offlineNotInstalled` boolean for UI.
- `areTranslationsInstalled()` helper function.

**Result:** Airplane mode + installed translation still renders Surah text.

---

## ✅ Chunk 7 — Tafsir on-demand cache (per verse)

**Status: DONE**

**What was built:**
- Schema v3: `offline_tafsir` table.
- `src/core/infrastructure/repositories/TafsirRepository.ts` — `getTafsirByVerse()` reads SQLite first, falls back to API fetch, then caches result in SQLite.
- `src/core/application/use-cases/GetTafsirContent.ts` — use case for tafsir retrieval.

**Result:** Open tafsir online, then airplane mode: same verse loads cached tafsir.

---

## ✅ Chunk 8 — "Download tafsir for this Surah" (bounded bulk)

**Status: DONE**

**What was built:**
- `src/core/application/use-cases/DownloadTafsirSurah.ts` — downloads tafsir for a single surah + selected tafsir IDs, verse by verse. Updates Download Index with progress.
- `src/core/domain/repositories/IChapterVerseKeysRepository.ts` — interface.
- `src/core/infrastructure/repositories/QuranComChapterVerseKeysRepository.ts` — fetches verse keys from API.

**Result:** Can download tafsir for a surah with progress tracking. Download persists and can be tracked via Download Index.

**Note (efficiency):** this implementation uses per-verse requests (`by_ayah`). Keep it for on-demand caching, but upgrade the “download this surah” flow to use the bulk `by_chapter` endpoint in Chunk 9A before attempting full-Quran tafsir packs.

---

# Phase B — Feature Buildout (Chunks 9–18)

These are the remaining chunks to build out all offline features.

---

## Chunk 9 — Tafsir Packs (efficient + future-proof)

This chunk is split into two “healthy” sub-chunks. The key efficiency rule:

- **Full tafsir pack should be ~114 requests total (1 per surah)**, not thousands (per-ayah loops).

### Chunk 9A — Upgrade “Download tafsir for this Surah” to `by_chapter` (1 request per surah)

**Goal:** Make “download this surah’s tafsir” use the bulk endpoint so it’s one request per surah per tafsir ID.

**Why:** Once this is bulk, the “full pack” becomes a simple 1..114 loop and stays within sane API usage.

**API endpoint (per surah):**
```
GET /tafsirs/{tafsirId}/by_chapter/{surahId}?per_page=300&page=1
```

**What to build (recommended shape):**
- Add `src/core/domain/repositories/ITafsirDownloadRepository.ts` (download contract, separate from `ITafsirRepository`).
- Add `src/core/infrastructure/repositories/QuranComTafsirDownloadRepository.ts` (calls the endpoint above).
- Add `src/core/domain/repositories/ITafsirOfflineStore.ts` + `src/core/infrastructure/offline/TafsirOfflineStore.ts` to bulk upsert into the existing `offline_tafsir` table.
- Refactor `src/core/application/use-cases/DownloadTafsirSurah.ts` to fetch once via `ITafsirDownloadRepository`, then insert all rows via `ITafsirOfflineStore`.
- Keep Download Index progress (either verse-count or simple “done”; avoid per-verse network calls).

**AI prompt:**
> Refactor tafsir surah downloads to use the bulk `by_chapter` endpoint (1 request per surah per tafsir). Add `ITafsirDownloadRepository` + `QuranComTafsirDownloadRepository` and `ITafsirOfflineStore` + `TafsirOfflineStore` to bulk insert into `offline_tafsir`. Update `DownloadTafsirSurahUseCase` to stop calling `getTafsirByVerse` in a loop. Keep `src/core/domain` + `src/core/application` platform-agnostic. Run `npm run verify`.

**Done when:**
- Downloading tafsir for a surah performs ~1 network request per tafsirId.
- Tafsir for the whole surah reads offline after download (airplane mode).

---

### Chunk 9B — Full Tafsir Pack (114-surah loop)

**Goal:** Download all tafsir for the entire Quran (one tafsir ID at a time).

**Prerequisites:** Chunk 9A.

**What to build:**
- Add `DownloadFullTafsirUseCase` in `src/core/application/use-cases/DownloadFullTafsir.ts`.
- Strategy: loop `surahId = 1..114`, for each call the (now-bulk) `DownloadTafsirSurahUseCase.execute()`.
- Track overall progress: `completed = number of surahs done`, `total = 114`.
- Use `DownloadableContent = { kind: 'tafsir', tafsirId: X }` (no `scope`/`surahId`) for the full-Quran entry.
- Best-effort: log surah failures and continue. Mark the full pack as `failed` only if more than N surahs fail.
- Add throttle between surah downloads: 200ms delay (and keep concurrency low).
- Add a "Download Full Tafsir" option to the Downloads screen (`app/downloads/index.tsx`).

**AI prompt:**
> Create `DownloadFullTafsirUseCase` in `src/core/application/use-cases/DownloadFullTafsir.ts`. It should loop surahs 1–114, calling the bulk `DownloadTafsirSurahUseCase`. Track progress as items (completed surahs / 114). Use `{ kind: 'tafsir', tafsirId }` for the Download Index key (whole-Quran scope). Add 200ms throttle between surahs. Update the Downloads screen to show a "Download Full Tafsir" option alongside translations. Run `npm run verify`.

**Done when:**
- Can download a full tafsir from the Downloads screen.
- Progress shows "X/114 surahs".
- After completion, all tafsir content for that ID is available offline.
- Downloading a full tafsir marks the entry as `installed` in the Download Index.

---

## Chunk 10 — Audio Domain & Data Layer (no UI)

**Goal:** Establish the domain model and data layer for audio before building any UI.

**Prerequisites:** None (independent of Chunks 7–9).

**What to build:**

1. **Domain entities** — add `src/core/domain/entities/Audio.ts`:
   ```typescript
   // Reciter (loaded from API like translations/tafsirs)
   interface Reciter {
     id: number;
     name: string;
     arabicName?: string;
     style?: string; // e.g. "Murattel", "Mujawwad"
     translatedName?: string;
   }

   // Audio file metadata for a single surah
   interface SurahAudioFile {
     surahId: number;
     reciterId: number;
     audioUrl: string; // streaming URL from API
     fileSize?: number; // bytes, if known
     format: string; // "mp3"
     duration?: number; // seconds, if known
   }
   ```

2. **Domain repository interface** — add `src/core/domain/repositories/IAudioRepository.ts`:
   ```typescript
   interface IAudioRepository {
     getReciters(): Promise<Reciter[]>;
     getRecitersByLanguage(language: string): Promise<Reciter[]>;
     getSurahAudioFile(reciterId: number, surahId: number): Promise<SurahAudioFile>;
     cacheReciters(reciters: Reciter[]): Promise<void>;
     getCachedReciters(): Promise<Reciter[]>;
   }
   ```

3. **Infrastructure implementation** — add `src/core/infrastructure/repositories/AudioRepository.ts`:
   - `getReciters()` → `GET https://api.quran.com/api/v4/resources/recitations?language=en`
   - `getSurahAudioFile()` → `GET https://api.quran.com/api/v4/chapter_recitations/{reciterId}/{surahId}`
   - Cache reciters in AsyncStorage (similar to how tafsir resources are cached).

4. **Register in DI container** — update `src/core/infrastructure/di/container.ts`.

**AI prompt:**
> Create the audio domain: `Audio.ts` entities (Reciter, SurahAudioFile), `IAudioRepository.ts` interface, and `AudioRepository.ts` infrastructure implementation that fetches from quran.com v4 API. Cache reciters in AsyncStorage. Register in DI container. Keep domain + application layer platform-agnostic. Run `npm run verify`.

**Done when:**
- Can fetch a list of reciters from the API.
- Can fetch the audio URL for a specific surah + reciter.
- Types, interface, and implementation pass type-check.

---

## Chunk 11 — Audio Streaming Playback (UI + controls)

**Goal:** Replace the "Audio coming soon" stub with real audio streaming playback using `expo-av`.

**Prerequisites:** Chunk 10 (audio domain layer).

**What to build:**

1. **Install `expo-av`** — `npx expo install expo-av`.

2. **Audio player service** — add `src/core/infrastructure/audio/AudioPlayerService.ts`:
   - Wraps `expo-av` `Audio.Sound`.
   - Methods: `loadAndPlay(url)`, `pause()`, `resume()`, `stop()`, `seekTo(positionMs)`, `getStatus()`.
   - Exposes playback state: `idle | loading | playing | paused | error`.
   - Exposes progress: `{ positionMs, durationMs }`.
   - Handles audio focus / interruptions.

3. **Audio context/provider** — add `providers/AudioPlayerContext.tsx`:
   - Global audio state (currently playing surah, reciter, playback state, position).
   - Provides `play(surahId, reciterId)`, `pause()`, `resume()`, `stop()`, `seekTo()`.
   - Fetches the streaming URL from `IAudioRepository.getSurahAudioFile()`.

4. **Audio player UI component** — add `components/audio/AudioPlayerBar.tsx`:
   - Appears at the bottom of the Surah reader when audio is active.
   - Play/Pause button, progress slider, surah name, reciter name.
   - Stop/close button.

5. **Update Surah screen** — update `app/surah/[surahId].tsx`:
   - Replace the `Alert.alert('Audio coming soon')` stub.
   - Add a "Play" button in the header or controls area.
   - Show the `AudioPlayerBar` at the bottom when audio is playing.
   - Add a reciter selector (simple dropdown or modal).

6. **Update bookmarks screen** — update `app/(tabs)/bookmarks.tsx`:
   - Replace the `Alert.alert('Audio coming soon')` stub similarly (or remove it if it's not a primary action there).

**AI prompt:**
> Install `expo-av`. Create `AudioPlayerService.ts` (wraps expo-av Sound), `AudioPlayerContext.tsx` (global audio state + controls), and `AudioPlayerBar.tsx` (bottom bar with play/pause, progress, reciter). Replace the "Audio coming soon" stub in `app/surah/[surahId].tsx` with real streaming playback. Add a reciter selector. Run `npm run verify`.

**Done when:**
- Tapping play on a Surah streams audio from the API.
- Play/pause/seek controls work.
- Progress bar updates in real-time.
- Can switch between reciters.
- Audio continues when scrolling the surah content.

---

## Chunk 12 — Offline Audio Downloads

**Goal:** Users can download surah audio for offline playback.

**Prerequisites:** Chunk 11 (audio streaming works).

**What to build:**

1. **Install `expo-file-system`** — `npx expo install expo-file-system`.

2. **Audio file storage** — add `src/core/infrastructure/audio/AudioFileStore.ts`:
   - Downloads audio file to `FileSystem.documentDirectory + 'audio/{reciterId}/{surahId}.mp3'`.
   - Methods: `downloadAudio(url, reciterId, surahId, onProgress)`, `getLocalPath(reciterId, surahId)`, `deleteAudio(reciterId, surahId)`, `isDownloaded(reciterId, surahId)`.
   - Uses `FileSystem.createDownloadResumable()` for resumable downloads.
   - Reports progress via callback (percent-based).

3. **Download audio use case** — add `src/core/application/use-cases/DownloadAudio.ts`:
   - Gets streaming URL from `IAudioRepository`.
   - Downloads via `AudioFileStore`.
   - Updates Download Index with `{ kind: 'audio', reciterId, scope: 'surah', surahId }`.

4. **Update AudioPlayerService** — offline-first playback:
   - Before streaming: check if `AudioFileStore.isDownloaded(reciterId, surahId)`.
   - If yes → load from local file path.
   - If no → stream from URL (current behavior).

5. **Add download option to UI** — update the audio controls or Downloads screen:
   - Show a download icon next to surah audio.
   - Show "Downloaded" badge if already available offline.

**AI prompt:**
> Install `expo-file-system`. Create `AudioFileStore.ts` for saving/reading/deleting audio files. Create `DownloadAudio.ts` use case that downloads audio and tracks in Download Index. Update `AudioPlayerService` to play local files when available. Add audio download UI. Run `npm run verify`.

**Done when:**
- Can download a surah's audio from the UI.
- Downloaded audio plays offline (airplane mode).
- Delete removes the downloaded file.
- Player prefers local file when available.

---

## Chunk 13 — Mushaf Page Viewer (online, no offline)

**Goal:** Replace the placeholder `app/page/[pageNumber].tsx` with a real mushaf page viewer.

**Prerequisites:** None (independent).

**Context:** The mushaf/page route already exists at `app/page/[pageNumber].tsx` but only shows a placeholder text. The settings system already has mushaf-related types in `types/mushaf.ts` and `data/mushaf/options.ts`.

**What to build:**

1. **Research the quran.com page images API:**
   - Page images are available at: `https://api.quran.com/api/v4/quran/images/{pageNumber}` or hosted directly as images.
   - Alternative: use the verses-by-page endpoint: `GET https://api.quran.com/api/v4/verses/by_page/{pageNumber}?words=true&fields=text_uthmani`.

2. **Page data hook** — add `hooks/usePageVerses.ts`:
   - Fetches verses for a given page number.
   - Returns verse data grouped by page.

3. **Update page screen** — rewrite `app/page/[pageNumber].tsx`:
   - Render verses for the page in a mushaf-style layout.
   - Show page number, surah name(s) on the page, and juz info.
   - Support swipe left/right to navigate pages.
   - Arabic text rendering in mushaf style (right-aligned, traditional layout).

4. **Navigation integration:**
   - Link from surah reader to page view.
   - Link from page view back to surah/verse.

**AI prompt:**
> Rewrite `app/page/[pageNumber].tsx` as a real mushaf page viewer. Fetch verses by page from `https://api.quran.com/api/v4/verses/by_page/{pageNumber}`. Create `hooks/usePageVerses.ts`. Render verses in a mushaf-style layout with page navigation (swipe or buttons). Show surah name and juz info. Run `npm run verify`.

**Done when:**
- Can navigate to any page and see the Quranic text.
- Can swipe between pages.
- Shows surah name and juz info for the current page.

---

## Chunk 14 — Mushaf Page Offline Cache

**Goal:** Cache mushaf page data so pages that have been viewed are available offline.

**Prerequisites:** Chunk 13 (mushaf viewer works online).

**What to build:**

1. **Add SQLite table** — schema v4:
   ```sql
   CREATE TABLE offline_pages(
     page_number INTEGER NOT NULL,
     verse_key TEXT NOT NULL,
     text_uthmani TEXT NOT NULL,
     surah INTEGER NOT NULL,
     ayah INTEGER NOT NULL,
     PRIMARY KEY(page_number, verse_key)
   );
   ```

2. **Update `hooks/usePageVerses.ts`** — offline-first:
   - Read from SQLite first.
   - Fall back to API.
   - Cache API response in SQLite.

3. **Optional: bulk download** — "Download all pages" option (604 pages × ~1 request each, or pre-bundled in a pack file).

**AI prompt:**
> Add schema v4 with `offline_pages` table. Update `hooks/usePageVerses.ts` to be offline-first (read SQLite, fall back to API, cache result). Add migration. Run `npm run verify`.

**Done when:**
- Visit a page online, then airplane mode: same page loads from cache.

---

## Chunk 15 — Word-by-Word Online

**Goal:** Replace any word-by-word placeholder with real word-by-word rendering.

**Prerequisites:** None (independent).

**What to build:**

1. **Word-by-word data** — use the quran.com API:
   - Endpoint: `GET https://api.quran.com/api/v4/verses/by_chapter/{surahId}?language=en&words=true&word_fields=text_uthmani,translation&per_page=50&page=1`
   - Each verse response includes `words[]` with `{ text_uthmani, translation { text, language_name } }`.

2. **Update verse rendering** — update `components/surah/VerseCard.tsx` or create a dedicated `WordByWordVerse.tsx` component:
   - Render each Arabic word aligned above its translation.
   - Support toggling word-by-word mode on/off in settings.

3. **Settings integration** — add a "Word by Word" toggle in reader settings.

**AI prompt:**
> Add word-by-word rendering to the surah reader. Fetch words from the quran.com v4 API (`words=true&word_fields=text_uthmani,translation`). Create a `WordByWordVerse.tsx` component that shows each Arabic word above its translation. Add a toggle in reader settings. Run `npm run verify`.

**Done when:**
- Can toggle word-by-word mode in the surah reader.
- Each Arabic word is shown above its translation.

---

## Chunk 16 — Offline Word-by-Word

**Goal:** Download and store word-by-word data for offline use.

**Prerequisites:** Chunk 15 (word-by-word works online).

**What to build:**

1. **Add SQLite table** — next schema version:
   ```sql
   CREATE TABLE offline_words(
     verse_key TEXT NOT NULL,
     word_position INTEGER NOT NULL,
     text_uthmani TEXT NOT NULL,
     translation_text TEXT,
     translation_language TEXT,
     PRIMARY KEY(verse_key, word_position)
   );
   ```

2. **Word offline store** — add `src/core/infrastructure/offline/WordOfflineStore.ts`.

3. **Download words use case** — add `src/core/application/use-cases/DownloadWords.ts`:
   - Downloads word data for one surah at a time.
   - Uses `{ kind: 'words', scope: 'surah', surahId }` in Download Index.

4. **Update word-by-word rendering** — offline-first read from SQLite.

5. **Add download option** — per-surah word download in Downloads screen or reader settings.

**AI prompt:**
> Add `offline_words` table, `WordOfflineStore.ts`, and `DownloadWords.ts` use case. Update word-by-word rendering to be offline-first. Add per-surah word download option. Run `npm run verify`.

**Done when:**
- Can download word-by-word data for a surah.
- Works offline after download.

---

## Chunk 17 — Downloads UI Overhaul (all content types)

**Goal:** Unify the Downloads screen to manage all downloadable content types.

**Prerequisites:** Chunks 9, 12, 16 (all download types exist).

**What to build:**

1. **Tabbed/sectioned Downloads screen** — update `app/downloads/index.tsx`:
   - Sections or tabs: Translations | Tafsir | Audio | Words
   - Each section lists available content with:
     - Name, language, author
     - Status (not downloaded / downloading X% / installed / failed)
     - File size estimate (where known)
     - Download/Delete/Retry actions

2. **Storage usage summary** — show total storage used by offline content.

3. **Batch operations** — "Download all" / "Delete all" for a category.

**AI prompt:**
> Overhaul `app/downloads/index.tsx` to support all content types (translations, tafsir, audio, words) with sections/tabs. Show status, progress, sizes, and download/delete actions for each. Add storage usage summary. Run `npm run verify`.

**Done when:**
- All downloadable content types are visible and manageable from one screen.
- Storage usage is displayed.

---

## Chunk 18 — Offline Search (FTS)

**Goal:** Search downloaded translations offline using SQLite full-text search.

**Prerequisites:** Chunks 3–6 done (translation text stored in SQLite).

**What to build:**

1. **Add FTS table** — next schema version:
   ```sql
   CREATE VIRTUAL TABLE translations_fts USING fts5(
     verse_key,
     text,
     content=offline_translations,
     content_rowid=rowid
   );

   -- Triggers to keep FTS in sync
   CREATE TRIGGER translations_fts_insert AFTER INSERT ON offline_translations
   BEGIN
     INSERT INTO translations_fts(rowid, verse_key, text) VALUES (new.rowid, new.verse_key, new.text);
   END;

   CREATE TRIGGER translations_fts_delete AFTER DELETE ON offline_translations
   BEGIN
     INSERT INTO translations_fts(translations_fts, rowid, verse_key, text)
       VALUES('delete', old.rowid, old.verse_key, old.text);
   END;

   CREATE TRIGGER translations_fts_update AFTER UPDATE ON offline_translations
   BEGIN
     INSERT INTO translations_fts(translations_fts, rowid, verse_key, text)
       VALUES('delete', old.rowid, old.verse_key, old.text);
     INSERT INTO translations_fts(rowid, verse_key, text) VALUES (new.rowid, new.verse_key, new.text);
   END;
   ```

2. **Offline search use case** — add `src/core/application/use-cases/SearchOffline.ts`:
   - Query: `SELECT verse_key, text FROM translations_fts WHERE text MATCH ?`
   - Return matched verses with highlights.

3. **Update search UI** — when offline (or when user toggles "Offline search"), use the FTS query instead of the API.

4. **Keep "Go To" navigation working** — from cached chapters + static `src/data/juz.json`.

**AI prompt:**
> Add a SQLite FTS5 table for offline translation search. Create `SearchOffline.ts` use case. Update the search screen to use offline search when no network is available or the user enables "Offline search only". Run `npm run verify`.

**Done when:**
- Can search downloaded translations offline.
- Search results show verse references and matched text.

---

# Phase C — Production Migration (Hosted Pack Files)

Do this **before launching to production**. The app's offline pipeline (SQLite storage, Download Index, offline-first hooks) does NOT change — only the download source changes.

---

## Chunk 19 — Build Script: Generate Pack Files

**Goal:** Create a Node.js script that pre-generates pack files for each translation/tafsir.

**What to build:**

1. **Script** — add `scripts/generate-packs.ts` (or `.js`):
   - For each translation you want to support:
     - Call `quran.com v4` API for all 114 surahs (or use `quranenc.com` API which offers SQLite downloads)
     - Output a single `.json.gz` or `.sqlite` file per translation
   - For each tafsir:
     - Call the tafsir API for all 114 surahs
     - Output a single file per tafsir
   - Generate a `manifest.json`:
     ```json
     {
       "version": 1,
       "translations": [
         {
           "id": 20,
           "name": "Sahih International",
           "language": "en",
           "author": "Saheeh International",
           "file_url": "https://cdn.yourapp.com/packs/translations/20.json.gz",
           "file_size_bytes": 1248576,
           "version": 1,
           "last_updated": "2026-01-15"
         }
       ],
       "tafsirs": [ ... ],
       "reciters": [ ... ]
     }
     ```

2. **Rate limiting** — 200ms delay between API calls, max 2 concurrent requests.

3. **Idempotent** — skip files that already exist (re-run safely).

**Done when:**
- Running the script generates pack files + manifest locally.
- Files can be uploaded to any static file host.

---

## Chunk 20 — Host Pack Files on CDN

**Goal:** Upload generated pack files and make them publicly accessible.

**Options (pick one):**
- **Cloudflare R2** (recommended, free tier: 10 GB storage, 10M reads/month)
- **AWS S3** + CloudFront
- **GitHub Releases** (free, easy, but less professional)
- **Vercel Blob** or **Supabase Storage**

**What to do:**
1. Upload pack files + `manifest.json` to chosen CDN.
2. Set appropriate cache headers (immutable for versioned files).
3. Test download URLs work from a mobile device.

---

## Chunk 21 — App: Switch Download Source to Hosted Packs

**Goal:** Replace the 114-request API download with a single file download from CDN.

**What to change:**

1. **Add manifest fetching** — fetch `manifest.json` from CDN on app startup (cache it locally).
2. **File sizes in UI** — read from manifest, show in Downloads screen.
3. **Replace `DownloadTranslationUseCase`'s API loop** with:
   - Download the single `.json.gz` file from `file_url`.
   - Decompress.
   - Import into SQLite using existing `TranslationOfflineStore.upsertVersesAndTranslations()`.
4. **Same for tafsir** — download single file, import into SQLite.
5. **Keep the Download Index, SQLite schema, and all hooks exactly the same.**

**Done when:**
- Downloads use hosted pack files instead of 114+ API calls.
- Download is faster and more reliable.
- File sizes are shown in the UI before download.
- All offline reading still works identically.

---

# Quick Reference: What to do next

| Priority | Chunk | What | Dependencies |
|---|---|---|---|
| 🔴 High | **9A–9B** | Tafsir packs (bulk `by_chapter`, then full pack) | 7–8 ✅ |
| 🔴 High | **10** | Audio domain + data layer | None |
| 🔴 High | **11** | Audio streaming playback (UI) | 10 |
| 🟡 Medium | **12** | Offline audio downloads | 11 |
| 🟡 Medium | **13** | Mushaf page viewer (online) | None |
| 🟡 Medium | **14** | Mushaf page offline cache | 13 |
| 🟡 Medium | **15** | Word-by-word online | None |
| 🟠 Lower | **16** | Offline word-by-word | 15 |
| 🟠 Lower | **17** | Downloads UI overhaul | 9, 12, 16 |
| 🟠 Lower | **18** | Offline search (FTS) | 3–6 ✅ |
| 🔵 Pre-prod | **19** | Build script: generate pack files | Any |
| 🔵 Pre-prod | **20** | Host pack files on CDN | 19 |
| 🔵 Pre-prod | **21** | App: switch to hosted packs | 20 |

**Recommended order:** 9A → 9B → 10 → 11 → 13 → 12 → 15 → 14 → 16 → 17 → 18 → 19 → 20 → 21

> **Note:** Chunks 10–11 (audio) and Chunk 13 (mushaf) can be done in parallel since they have no dependencies on each other.
