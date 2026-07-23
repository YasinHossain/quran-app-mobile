# Verse Spotlight and Android Widget Implementation Plan

## Purpose

Replace the demo verse on the mobile home screen with an offline Verse Spotlight and add a native Android home-screen widget using the same content rules.

This document is intended for phase-by-phase AI implementation. Complete and verify one phase before starting the next. Do not silently expand a phase into later work.

## Final Product Contract

### Shared behavior

- The home card and Android widget use the same canonical verse-key index, curated random-anchor pool, navigation rules, translation resolver, and persistence schema.
- A random action selects a different eligible anchor verse when more than one candidate exists.
- Previous and next always navigate in canonical Quran order, including across surah boundaries.
- Random anchors come from a reviewed pool of short-to-medium verses that are suitable to display independently. Do not copy a reference app's proprietary curated list.
- Sequential navigation may leave the curated pool. Long sequential verses must be presented safely with a visible truncation/open-full affordance where space is constrained.
- Tapping the displayed verse opens that exact verse in the translation reader.
- All Quran text, verse references, and translation attribution are correctness-critical.

### Offline translation policy

- Neither surface fetches verse text from the network.
- If the user's selected translation is fully installed, both surfaces use it.
- Otherwise, both surfaces silently fall back to a bundled Sahih International English translation.
- No warning, prompt, download request, placeholder, or error is shown for this fallback.
- Track the effective translation ID internally so cached content from different translations is never mixed.
- A translation becomes eligible only when its download-index state is `installed`; partial or failed imports must not be used.
- When the selected translation later becomes installed, both surfaces should use it on their next normal refresh.

### Surface-specific behavior

- Home automatic rotation: approximately every five minutes while the Home tab is active. On focus/resume, rotate immediately if the stored deadline has passed. Do not run a permanent background timer.
- Android widget automatic rotation: approximately every four hours by default, using battery-respectful Android scheduling.
- Widget interval presets may be added as `30 minutes`, `1 hour`, `4 hours`, `12 hours`, `daily`, and `manual only`, but a settings UI is not required unless explicitly requested during implementation.
- Manual shuffle is immediate on both surfaces.
- Home swipes and visible previous/next controls navigate sequentially. Shuffle is the only random navigation action.
- Widget controls are previous, shuffle, and next. Do not depend on widget swipe gestures.
- Home and widget keep independent current-verse state because their automatic schedules differ. They share rules and translation selection, not necessarily the same displayed verse.
- The Android widget has deliberate visual independence. Its design may be fresh and distinct from the in-app design system; it does not need to reproduce the Home card or strictly reuse project styling.

## Architecture and Boundaries

Keep mobile-only orchestration outside `src/core/domain` and `src/core/application`, because those folders are synchronized from the sibling web app. Suggested locations may be adjusted to match repository conventions discovered during implementation:

- `lib/verse-spotlight/`: TypeScript contracts, pure selection/navigation functions, storage, offline translation resolution, and home controller helpers.
- `components/home/HomeVerseSpotlight.tsx`: Home presentation.
- `assets/verse-spotlight/`: Canonical generated verse index, curated pool, and bundled Sahih fallback asset.
- `scripts/verse-spotlight/`: Reproducible generation and validation scripts for bundled assets.
- `android/app/src/main/java/com/anonymous/quranappmobile/versespotlight/`: Native widget provider, renderer, actions, scheduler, and storage/SQLite adapter.
- `plugins/` or the repository's chosen config-plugin location: reproducible Android manifest/resource integration if prebuild regeneration would otherwise remove native registration.

The TypeScript and Kotlin runtimes cannot directly execute the same selection code. Prevent drift with:

- One generated canonical verse index and curated-pool asset.
- One versioned persisted-state schema.
- Documented action semantics.
- Shared fixture vectors covering boundaries and known keys.
- Equivalent TypeScript and Kotlin tests for contract-critical behavior.

Do not make the native widget start the React Native runtime to render or respond to a button.

## State Contract

Use a versioned state shape conceptually equivalent to:

```ts
type VerseSpotlightState = {
  schemaVersion: 1;
  surface: 'home' | 'android-widget';
  verseKey: string;
  selectedAt: number;
  nextRandomAt: number | null;
  requestedTranslationId: number;
  effectiveTranslationId: number;
  poolVersion: string;
};
```

The exact storage technology can differ by surface, but migration and invalid-state recovery must be deterministic. An absent, corrupt, obsolete, or invalid verse key should resolve to a valid random anchor without crashing.

## Phase 1 — Offline Data and Shared Verse Engine

### Goal

Deliver the complete offline data foundation and tested TypeScript behavior without changing the visible home screen or adding the widget.

### Work

1. Define the canonical ordering/index for all 6,236 verses.
   - Generate it from trusted repository data rather than manually duplicating chapter counts.
   - Include enough metadata for verse-key validation, previous/next resolution, surah display names, and deep linking.
   - Validate the first verse, final verse, every surah boundary, uniqueness, and total count.

2. Create the curated random-anchor pool.
   - Start with a practical reviewed pool, targeting roughly 500–1,000 verses.
   - Apply documented length limits as an initial candidate filter, then maintain an explicit reviewed list of verse keys.
   - Record pool version, source, generation method, and validation results.
   - Exclude verses whose isolated presentation is incomplete, easily misleading, or inappropriate for a standalone spotlight.

3. Bundle Sahih International as the guaranteed fallback.
   - Use a verified source already compatible with the project's Quran/translation data pipeline.
   - Store translation ID, translator name, source/version, checksum, verse count, and license/rights metadata.
   - Prefer a compact generated asset or seed database containing only the fields needed by this feature.
   - Validate exactly 6,236 unique verse keys and reject generation on missing/duplicate keys.

4. Implement the offline resolver.
   - Given the requested translation ID and verse key, use the installed translation only if the download index reports it as fully installed and the row exists.
   - Otherwise return bundled Sahih International.
   - Return both requested and effective translation IDs internally.
   - Never perform a network request.

5. Implement pure spotlight behavior.
   - Random anchor selection with immediate-repeat prevention.
   - Canonical previous/next behavior.
   - Explicit first/final boundary behavior. Prefer clamping and disabling the unavailable direction rather than wrapping the Quran unless the user later requests wrapping.
   - State normalization and expiration calculation.
   - Separate state keys for Home and Android widget.

6. Add focused tests.
   - `1:1` has no previous verse.
   - Next from `1:7` is `2:1`; previous from `2:1` is `1:7`.
   - The final verse has no next verse.
   - Every curated key exists in the canonical index and bundled fallback.
   - Random never produces an invalid key or an immediate duplicate when alternatives exist.
   - Missing, uninstalled, partial, or corrupt selected-translation data resolves to Sahih.
   - Installed translation rows win over Sahih without mixing sources.
   - Expired and non-expired state behave deterministically.

### Deliverables

- Generated/validated verse assets with provenance.
- Shared TypeScript contracts and feature engine.
- Offline-only translation resolver.
- Persistence helpers for Home state.
- Tests and generation documentation.

### Acceptance criteria

- No visible UI behavior has changed.
- The engine works without network access.
- Every possible previous/next result is valid.
- Sahih fallback covers all verses.
- The selected translation is used only when fully installed.
- Relevant focused tests, `npm run type-check`, and `npm run check:core` pass.

### Stop point

Commit/report Phase 1 independently. Do not replace `HomeVersePlaceholder` or add Android widget files in this phase.

## Phase 2 — Home Verse Spotlight

### Goal

Replace the demo home verse with a polished, accessible, fully offline interactive card.

### Work

1. Create `HomeVerseSpotlight` and replace `HomeVersePlaceholder` in the Home intro.

2. Connect the Phase 1 engine.
   - Hydrate persisted Home state.
   - Resolve the selected installed translation or silent Sahih fallback.
   - Rotate after approximately five minutes while Home is active.
   - Re-evaluate expiration on tab focus and app resume.
   - Persist manual and automatic changes.
   - Avoid network calls in every state.

3. Implement interaction semantics.
   - Previous button and right swipe: previous canonical verse.
   - Next button and left swipe: next canonical verse.
   - Shuffle button: new random anchor.
   - Disable the unavailable direction at Quran boundaries.
   - Tap the verse body/reference to open the exact verse in Translation mode.
   - Prevent a swipe from also triggering the tap action.

4. Design the card using semantic tokens.
   - Match the established mobile visual language rather than either reference app exactly.
   - Keep controls comfortably tappable and visually secondary to the verse.
   - Support light/dark mode, RTL UI, RTL/LTR translation text, large font sizes, and reduced motion.
   - Avoid a rigid fixed height that clips localized translations.
   - For exceptionally long sequential verses, provide an explicit `Read full verse` affordance rather than silently cutting religious text.

5. Handle operational states.
   - Use a stable lightweight loading skeleton while settings/storage hydrate.
   - Recover corrupt state by choosing a valid anchor.
   - Sahih fallback is visually silent as requested.
   - Ensure rapid taps/swipes cannot apply stale asynchronous translation results.

6. Update durable documentation.
   - Replace the placeholder entry in `docs/components.md` with the real component behavior.
   - Document any new reusable tokens in `docs/design-tokens.md`.

### Tests and verification

- Component/controller tests for hydration, expiration, shuffle, arrows, swipe direction, boundaries, and stale-result protection.
- Manual airplane-mode verification with and without the selected translation installed.
- Verify fallback switches to an installed selected translation on the next refresh.
- Verify deep linking to exact verses.
- Verify dark mode, RTL, large font, reduced motion, and screen-reader labels.
- Run `npm run verify` before handoff.

### Acceptance criteria

- The demo text is gone.
- Home never fetches verse text from the network.
- Automatic rotation occurs only while appropriate and catches up on focus/resume.
- Shuffle is random; arrows and swipes are sequential.
- The card remains usable for long translations and accessibility font sizes.
- No Android widget is required yet.

### Stop point

Deliver a complete Home experience and stop. Do not begin native widget work until this phase is accepted.

## Phase 3 — Native Android Widget Baseline

### Goal

Deliver an installable, offline, interactive Android widget with a modern medium layout and immediate manual controls. Scheduled rotation and optional size variants are completed in Phase 4.

### Work

1. Add a native Android widget implementation.
   - Register an `AppWidgetProvider` and provider metadata.
   - Use native `RemoteViews`; do not render through React Native.
   - Add reproducible config-plugin/native integration so Expo prebuild does not silently remove the widget.
   - Use unique, immutable/update-current `PendingIntent` identities so multiple widget instances and buttons do not collide.

2. Add the native data adapter.
   - Read the same canonical index, curated-pool version, and bundled Sahih data created in Phase 1.
   - Read the selected translation setting and installed translation rows from a stable, documented app-private storage contract.
   - Use the same `installed -> selected translation; otherwise -> Sahih` rule.
   - If direct concurrent access to the Expo SQLite database is not demonstrably safe, add a small native-readable spotlight cache synchronized by the app instead of relying on fragile paths or locks.
   - Never make widget rendering or button actions depend on network access.

3. Implement independent widget state.
   - Persist state per widget ID so multiple placed widgets behave correctly.
   - Shuffle chooses a different curated random anchor.
   - Previous/next navigate canonically from the currently displayed verse.
   - Restore state after launcher/process recreation.
   - Recover missing/corrupt/obsolete state safely.

4. Build the medium responsive layout.
   - Target a clean `4 x 2` style with verse text, surah/reference, and previous/shuffle/next controls.
   - Treat the widget as an independent design surface. The implementer has freedom to introduce a fresh composition, widget-specific palette, typography, spacing, shapes, and icon treatment instead of strictly following the app's cards or tokens.
   - Do not copy either reference application's layout. Aim for a distinctive, calm, modern Quran widget that feels native on an Android launcher.
   - Support Android 12+ system widget corners and dynamic color where practical, with a consistent fallback palette.
   - Support light/dark launcher themes.
   - Preserve contrast, legibility, touch targets, RTL behavior, and accessibility regardless of the chosen visual direction.
   - Truncate constrained long verses with a visible continuation indication; tapping opens the full verse.
   - Branding is optional and should remain subordinate to the verse; avoid a large app-name header that reduces the reading area.

5. Add app integration.
   - Sync the requested translation ID when settings hydrate or change.
   - Notify widget instances when an offline translation finishes installing or is deleted.
   - Add exact-verse deep-link handling and confirm it works from a cold app start.
   - Expose only the smallest native bridge needed for refresh/synchronization.

### Tests and verification

- Kotlin tests for index boundaries, selection, fallback, state migration, and per-widget isolation.
- Install on the connected emulator/device and add at least two widget instances.
- Verify previous, shuffle, next, deep link, process death, reboot/rebind, dark mode, and offline operation.
- Verify selected installed translation and silent Sahih fallback.
- Verify button actions remain responsive when the React Native app is stopped.
- Run Android build checks and `npm run verify`.

### Acceptance criteria

- The widget appears in the Android widget picker and can be placed/resized.
- Manual controls work immediately without starting the React Native runtime.
- It is fully functional in airplane mode.
- It uses the selected translation only when fully installed and otherwise silently uses Sahih.
- Multiple widget instances do not overwrite or misroute each other's actions.

### Stop point

Deliver the manually interactive widget baseline. Do not add aggressive sub-30-minute refresh mechanisms.

## Phase 4 — Widget Scheduling, Responsive Polish, and Release Hardening

### Goal

Finish battery-respectful automatic widget rotation, optional responsive variants, cross-surface invalidation, and release-quality verification.

### Work

1. Add automatic scheduling.
   - Use unique periodic WorkManager work for widget rotation.
   - Default to approximately four hours.
   - Treat execution time as inexact because Android Doze and OEM battery policies may defer it.
   - Recreate/cancel work correctly as the first widget is added or the final widget is removed.
   - Restore scheduling after reboot/app replacement where Android requires it.
   - Manual controls must remain immediate and independent of periodic scheduling.

2. Optionally expose interval configuration if requested.
   - Supported contract: 30 minutes, 1 hour, 4 hours, 12 hours, daily, manual only.
   - Do not claim or implement reliable 30-second/minute background rotation.
   - Avoid exact alarms and foreground services for this feature.

3. Add responsive presentation.
   - Adapt typography, line count, metadata, and controls based on widget dimensions.
   - Add a compact `2 x 2` variant only if previous/shuffle/next remain understandable; otherwise compact may expose shuffle plus open only.
   - Test common Pixel and Samsung-style grid sizes where available.
   - Ensure system font scaling cannot hide every action.

4. Harden translation synchronization.
   - Refresh widgets after translation install/delete and relevant settings changes.
   - Preserve requested versus effective translation IDs across fallback transitions.
   - Ensure old translation text cannot remain paired with a new translation ID.
   - Confirm the widget remains usable if the app database is migrating or temporarily unavailable.

5. Run the release matrix.
   - Offline from first render after app installation.
   - Selected translation absent, installed, deleted, and reinstalled.
   - Home and widget automatic deadlines.
   - Manual actions near an automatic deadline.
   - Multiple widgets with process death and reboot.
   - First/final Quran boundaries.
   - Long verses, RTL translations, dark mode, dynamic color, high font scale, and TalkBack.
   - Cold-start deep links.
   - Battery/job inspection to confirm there is no rapid repeating alarm or runaway work.

6. Final documentation.
   - Add the home component to `docs/components.md` if not already completed.
   - Document the Android widget architecture, persisted schema, bundled fallback provenance, scheduling limits, and debug commands.
   - Record the curated-pool version and regeneration/review process.

### Acceptance criteria

- Automatic widget rotation works approximately on schedule without aggressive polling.
- Widget actions and automatic updates remain offline.
- Translation changes cannot produce mixed or mislabeled cached text.
- The widget is visually usable across supported sizes and themes.
- `npm run verify` passes.
- A release Android build installs and the complete physical/emulator checklist passes.

### Stop point

The feature is complete only after the release matrix and documentation are finished.

## Explicit Non-Goals

- iOS widgets in this implementation.
- Network verse fetching for either surface.
- Audio playback directly inside the widget.
- Tafsir or word-by-word content in the widget.
- Exact 30-second or one-minute automatic widget refresh.
- Copying another application's curated verse list, artwork, layout, or proprietary implementation.
- Moving mobile-only feature orchestration into the web-synchronized core directories.

## AI Handoff Checklist for Every Phase

At the beginning of a phase:

1. Read this entire document and `AGENTS.md`.
2. Inspect the current worktree and preserve unrelated user changes.
3. Confirm all earlier-phase acceptance criteria still hold.
4. State which phase is being implemented and do not start later phases.

At the end of a phase:

1. Run the phase-specific tests and repository verification appropriate to the changed scope.
2. Report files changed, behavior delivered, tests run, and any remaining risk.
3. Update this document only when implementation reveals a durable architectural correction.
4. Stop and wait for approval before beginning the next phase.
