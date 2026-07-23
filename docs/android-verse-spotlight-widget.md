# Android Verse Spotlight Widget

## Phase 3 baseline

`VerseSpotlightWidgetProvider` is a native `RemoteViews` widget. Its previous,
shuffle, next, render, state-recovery, and deep-link paths do not execute
JavaScript. Scheduled rotation is intentionally deferred to Phase 4.

The receiver runs in the private `:verse_spotlight_widget` process.
`MainApplication` exits before React Native initialization in that process, so
launcher updates and button presses do not start the React Native runtime.

## Offline data contract

The config plugin copies these generated Phase 1 assets into the Android APK:

- `canonical-verse-index.json`
- `curated-anchor-pool.json`
- `bundled-sahih.json`
- `bundled-sahih-metadata.json`

The native loader validates schema versions, the 6,236 canonical keys, surah
boundaries, pool membership, fallback ordering, and non-empty verse content
before rendering.

The widget does not open the Expo SQLite database. When settings hydrate or the
download index changes, the app validates the requested translation's
`installed` status and all 6,236 rows, then sends one ordered payload through
the `VerseSpotlightWidget` native module. Android writes it atomically to:

```text
filesDir/verse_spotlight/widget_content_v1.json
```

The cache records whether the app currently has a translation selected, the
requested translation ID, and (when applicable) its complete translation rows.
The widget displays one content source at a time:

- a downloaded selected translation, without Arabic or translator attribution;
- bundled Sahih International when a selected translation is unavailable;
- Arabic only when the app has no translation selected.

A partial, mismatched, or corrupt selected-translation cache silently resolves
to bundled Sahih International. This keeps widget rendering independent of
database paths and locks and prevents mixed translation sources.

## Layout and scrolling

The verse is rendered as one continuous paragraph inside a borderless native
`RemoteViews` collection, making the middle of the widget vertically scrollable
without a visible divider or scrollbar. The footer keeps the surah name and
verse number on the left, with compact shuffle, previous, and next controls on
the right. A separate static preview layout keeps
the launcher picker representative before the collection service is bound.

## State and actions

Widget state uses the Phase 1 schema with `surface = android-widget` and
`nextRandomAt = null` during Phase 3. Each launcher widget ID has a distinct
SharedPreferences key. Missing, corrupt, obsolete-pool, or invalid-key state
recovers to a valid curated random anchor.

Each button has a unique immutable/update-current `PendingIntent` identity that
includes the widget ID and action. Previous and next clamp at Quran boundaries;
shuffle prevents an immediate repeat. The verse body opens:

```text
quranappmobile:///surah/{surahId}?startVerse={ayahId}&view=translations
```

This URI is handled by the existing Expo Router link flow, including cold app
starts.

## Reproducible native integration

`plugins/withVerseSpotlightWidget.js` registers the provider and its private
`RemoteViewsService`, copies native source/resources/tests and offline assets,
registers the minimal bridge, and adds the widget-process guard. The template under
`plugins/verse-spotlight-widget/android/` is the source of truth because Expo
prebuild output under `android/` is generated.

Useful checks:

```bash
npm run test:verse-spotlight-widget-plugin
npm run test:verse-spotlight-widget-android
cd android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell dumpsys package com.anonymous.quranappmobile
```

For device verification, add two widget instances and test both independently
with the app stopped and airplane mode enabled. Also verify first/final verse
button disabling, dark mode, an RTL translation, process death, launcher
rebind, and the cold-start deep link.
