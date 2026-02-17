# Mobile Audio Player (Web-Parity) — Streaming + Offline Downloads + Lock Screen

> **Last updated:** 2026-02-14  
> **Scope:** Expo (React Native) app in `quran-app-mobile`  
> **Goal:** Match the web app’s verse-based audio player UX while adding native streaming + offline downloads + lock-screen controls.

## Summary
Implement the **same verse-based audio player UX as the web app** (bottom player, verse-segment playback, reciter selection, next/prev, progress slider), with **two modes**:

- **Stream** (default when nothing is downloaded)
- **Download for offline** (and **auto local-first playback** when available)

This is intentionally broken into **small, AI-sized chunks** so you can hand each chunk to an AI agent safely.

---

## Web Source-of-Truth (mirror these)
Use these web files as the behavioral/UI reference (copy structure + labels/order/actions, then adapt to RN/Expo):

- `../quran-app/app/shared/player/AppAudioPlayer.tsx` — builds verse-segment “track” from QDC timings
- `../quran-app/app/shared/player/QuranAudioPlayer.tsx` — player UI shell + error UI + options modal
- `../quran-app/app/shared/player/context/AudioContext.tsx` — global playback state model
- `../quran-app/app/shared/player/types.ts` — `Reciter` / `Track` / `RepeatOptions`
- `../quran-app/app/shared/player/hooks/useQdcAudioFile.ts` — fetch QDC audio file + timings
- `../quran-app/lib/audio/qdcAudio.ts` — QDC audio endpoints + normalization
- `../quran-app/app/shared/player/hooks/useReciters.ts` — reciters list + default reciter
- `../quran-app/app/shared/player/hooks/usePersistedAudioSettings.ts` — reciter/volume/speed persistence
- `../quran-app/app/shared/player/hooks/useTrackTiming.ts` + `useSegmentCompletion.ts` — segment timing + “end of verse” detection
- `../quran-app/app/shared/player/components/Timeline.tsx` + `TransportControls.tsx` — seek + transport UX
- `../quran-app/app/shared/reader/ReaderLayouts.tsx` — how the player is mounted globally

---

## Constraints / Defaults (locked decisions)
- **Player scope:** Global (persists across navigation)
- **Offline behavior:** Auto local-first
- **Lock-screen controls:** Required
- **Audio engine:** Use **`expo-audio`** (Expo SDK 54)
- **Audio source:** Use the **same QDC endpoint as web**: `/audio/reciters/{reciterId}/audio_files?chapter={surahId}&segments=true`
- **Download granularity:** Per **(reciterId, surahId)** surah audio file (matches current mobile `DownloadIndexItem` union)
- **Default reciter:** Match web default (id **173**, Mishari Rashid al-`Afasy`)

### Guardrails (repo-specific)
- Do **not** modify `src/core/domain` or `src/core/application` directly for mobile-only changes (they are overwritten by `npm run sync:web-core`).
- Put mobile-only implementations in:
  - `src/core/infrastructure/...`
  - `providers/...`
  - `hooks/...`
  - `components/...`

---

## Chunked Implementation Plan (AI-doable tasks)

### ✅ Chunk 1 — Audio data layer (no UI)
**Goal:** Mobile can fetch (1) reciters and (2) a surah audio file with verse timings, same as web.

**Add (mobile-only, not in synced core folders):**
- `src/core/infrastructure/audio/qdcAudio.ts`  
  Port from `../quran-app/lib/audio/qdcAudio.ts`, but use mobile `src/core/infrastructure/api/apiFetch.ts`.
- `hooks/audio/useReciters.ts`  
  Port behavior from web `useReciters.ts`, but with simple in-memory caching (no SWR).
- `hooks/audio/useQdcAudioFile.ts`  
  Port behavior from web `useQdcAudioFile.ts`.

**Done when:**
- Reciters load and map into `{ id, name, locale? }`.
- Audio file loads for `(reciterId, surahId)` and includes `audioUrl` + `verseTimings[]`.

**AI prompt:**
> Port the web QDC audio fetch layer (`../quran-app/lib/audio/qdcAudio.ts`, `useReciters.ts`, `useQdcAudioFile.ts`) into mobile using `apiFetch`. Keep it out of `src/core/domain`/`src/core/application`. Add minimal caching. Run `npm run verify`.

---

### ✅ Chunk 2 — Add `expo-audio` + background + lock-screen wiring
**Goal:** Audio can play and be controlled from lock screen / background.

**Steps:**
- Install: `npx expo install expo-audio`
- Update `app.json` (iOS background audio):
  - `expo.ios.infoPlist.UIBackgroundModes = ["audio"]`
- Add a small setup module, e.g. `src/core/infrastructure/audio/audioMode.ts`:
  - Call audio mode config (silent-mode + background + interruption policy)
- Enable lock-screen support:
  - `setActiveForLockScreen(true, { showSeekBackward: true, showSeekForward: true })`
  - `updateLockScreenMetadata({ title, artist, artworkUrl })`

**Done when:**
- Streaming audio plays on device.
- Playback continues when app is backgrounded.
- Lock screen shows metadata and play/pause works.

**AI prompt:**
> Install `expo-audio`, enable iOS background audio in `app.json`, and add a small helper to set audio mode + lock-screen activation. Run `npm run verify`.

---

### ✅ Chunk 3 — Global audio state model (provider) + verse-segment playback (core behavior)
**Goal:** Replace “Audio coming soon” with real verse-based playback, matching web’s segment model.

**Add:** `providers/AudioPlayerContext.tsx`
- Owns global state:
  - `isVisible`, `isPlaying`, `activeVerseKey`, `reciter`, `playbackRate`, `volume`
  - `queueVerseKeys`, `queueIndex`
  - `segmentStartSec`, `segmentEndSec`
  - `error`, `isLoading`
- Uses:
  - Expo audio player + status polling (e.g. 250ms)
  - `container.getChapterVerseKeysRepository()` to build full-surah queue (Next/Prev works across pagination)
  - `hooks/audio/useQdcAudioFile` to get timings
- Implements:
  - `playVerse(verseKey)` → loads timings, sets segment, seeks to segment start, plays, shows player
  - Segment end detection: when `currentTime >= segmentEndSec - 0.15`, call `nextVerse()` (repeat logic later)
  - `prevVerse()`, `nextVerse()`, `togglePlay()`, `seekRelative(sec)`, `closePlayer()` (stop + clear state)
- Persists settings in AsyncStorage:
  - `reciterId`, `reciterMeta`, `volume`, `playbackRate`

**Wire global provider:**
- Update `app/_layout.tsx` to wrap app with `AudioPlayerProvider`.

**Done when:**
- Start from any verse → plays **only that verse segment**.
- Next/Prev moves verse-by-verse through the surah.
- Progress is relative to the verse segment (not whole file).
- Close stops and clears active verse.

**AI prompt:**
> Create `AudioPlayerContext` that uses expo-audio to play verse segments from QDC timings (same logic as web `AppAudioPlayer.tsx`). Add next/prev via `QuranComChapterVerseKeysRepository`. Wrap in `app/_layout.tsx`. Run `npm run verify`.

---

### ✅ Chunk 4 — Player UI (bottom bar overlay) + safe layout
**Goal:** Show a web-like bottom player UI across the app without covering content.

**Add:** `components/audio/AudioPlayerBar.tsx`
- Track title (Surah + verse key), reciter name
- Prev / Play-Pause / Next
- Slider (use `@react-native-community/slider`)
- Elapsed/Total
- Close button
- “Options” button (opens modal; can be stub initially)

**Mount globally:**
- Mount `AudioPlayerBar` globally (in `app/_layout.tsx`) so it appears everywhere.

**Avoid tab bar overlap:**
- Add a reporter in `app/(tabs)/_layout.tsx` using `@react-navigation/bottom-tabs` `useBottomTabBarHeight()`.
- Store the value in a small context (e.g. `providers/LayoutMetricsContext.tsx`) consumed by `AudioPlayerBar` to position itself above tabs.

**Pad scrollable content where needed (at least):**
- `app/surah/[surahId].tsx` list paddingBottom += player height when visible
- `app/(tabs)/bookmarks.tsx` list paddingBottom += player height when visible

**Done when:**
- Player bar shows/hides correctly.
- Doesn’t cover the tab bar.
- Doesn’t cover the last verses/items in lists.

**AI prompt:**
> Add `AudioPlayerBar` (bottom overlay) wired to AudioPlayerContext state/actions. Add tab-bar height reporting so it sits above tabs. Update Surah/Bookmarks lists to add bottom padding when player visible. Run `npm run verify`.

---

### ✅ Chunk 5 — Wire VerseActionsSheet play/pause (remove stubs)
**Goal:** The existing “Play audio” action actually plays.

**Update:**
- `app/surah/[surahId].tsx` `handlePlayPause` → call audio context (play selected verse or toggle)
- `app/(tabs)/bookmarks.tsx` same

**Pass correct `isPlaying` into `VerseActionsSheet`:**
- `isPlaying = audio.isPlaying && audio.activeVerseKey === activeVerse.verseKey`

**Done when:** no more “Audio coming soon” alerts; play/pause works from verse actions.

---

### ✅ Chunk 6 — Playback options modal + Speed popover (web-parity UI)
**Goal:** Mirror web’s playback options modal + speed popover in RN.

**Add:** `components/audio/PlaybackOptionsModal.tsx`
- Pop-up modal (centered dialog) with explicit numeric `minHeight/maxHeight`
- Tabs: **Reciter** | **Verse Repeat**
  - Verse Repeat must be fully implemented (single/range/full surah)
- Reciter tab: list reciters + Apply button (offline audio actions are OK as mobile-only additions)

**Speed control (web-parity):**
- Anchored popover opened from the speed button in `AudioPlayerBar`
  - 0.75×, 1×, 1.25×, 1.5×, 2×

**Wire it:**
- `AudioPlayerBar` Speed button opens the speed popover.
- `AudioPlayerBar` Options button opens the playback options modal.

**Done when:** switching reciter, speed, and Verse Repeat works and persists.

---

### ✅ Chunk 7 — Offline audio downloads (Download + Delete) + local-first playback
**Goal:** Users can download surah audio and it plays offline automatically.

**Steps:**
- Install: `npx expo install expo-file-system`
- Add `src/core/infrastructure/audio/AudioFileStore.ts`
  - Path: `FileSystem.documentDirectory + 'audio/{reciterId}/{surahId}.mp3'`
  - `isDownloaded()`, `getLocalUri()`, `download(url,onProgress)`, `delete()`
- Add `src/core/infrastructure/audio/AudioDownloadManager.ts`
  - Uses `DownloadIndexRepository` to set states: queued → downloading (percent) → installed / failed
  - Uses content key: `{ kind: 'audio', reciterId, scope: 'surah', surahId }`
- Update `AudioPlayerContext` resolve source:
  - If local exists → play local
  - Else → stream
- Add UI in `PlaybackOptionsModal`:
  - “Download this surah” / “Delete download”
  - Show status + progress from Download Index

**Done when:**
- Download works with progress.
- Airplane mode playback works.
- Player auto-uses local file when present.
- Delete removes the downloaded file.

---

### Chunk 8 — Downloads screen (optional but recommended)
**Goal:** Manage audio downloads centrally.

**Extend:** `app/downloads/index.tsx`
- Add an **Audio** section/tab
- List audio download index items (at minimum: for current reciter)
- Delete / Retry actions

**Done when:** user can manage audio downloads without hunting inside the player.

---

## Public APIs / New Modules (expected additions)
- `providers/AudioPlayerContext.tsx` — `useAudioPlayer()` hook + provider
- `components/audio/AudioPlayerBar.tsx`
- `components/audio/PlaybackOptionsModal.tsx`
- `src/core/infrastructure/audio/qdcAudio.ts`
- `hooks/audio/useReciters.ts`
- `hooks/audio/useQdcAudioFile.ts`
- Later (offline):
  - `src/core/infrastructure/audio/AudioFileStore.ts`
  - `src/core/infrastructure/audio/AudioDownloadManager.ts`

---

## Test & Acceptance Checklist (manual)
Run `npm run verify` after every chunk. On a real device:
1. Play a verse → correct verse segment plays (not whole surah).
2. Next/Prev moves verse-by-verse (including beyond initially loaded page).
3. Scrub slider seeks within the verse segment.
4. Background playback continues; lock screen shows metadata; play/pause works.
5. Change reciter → same verse plays with new reciter.
6. Download current surah → progress shown; airplane mode playback works; delete removes file.

---

## Notes / Assumptions
- Mobile will match web labels/order where applicable; missing behaviors (e.g., full repeat-range logic) should ship as **visible stubs** first, then be implemented.
- Avoid introducing new libraries unless required for parity; prefer Expo-first solutions (`expo-audio`, `expo-file-system`).
