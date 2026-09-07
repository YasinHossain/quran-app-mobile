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

### Serenity design

The Android picker also offers **Verse Spotlight · Serenity**, a separate 4 × 3
home-screen widget with a matching Samsung cover-screen provider. It uses a flat
surface, teal reference header, serif translation text, and a separate navigation
row with 48 dp touch targets and a central shuffle pill. Long verses scroll in the
same native collection. Arabic retains the existing RTL text layout.

### Material design (Pixel / Material You)

The third widget option is **Verse Spotlight · Material**, styled after the latest
Google Pixel and Android 14+/15+ Material You (Material 3) design language:
- **Tonal surface and M3 corner radii**: high squircle corner radius (28 dp, mapping
  to `@android:dimen/system_app_widget_background_radius` on API 31+).
- **Header reference chip**: stadium pill chip with an M3 sparkle emblem and Surah • Ayah
  metadata in `sans-serif-medium`.
- **Modern typography**: high-readability sans-serif font, generous 5 dp line spacing,
  and crisp contrast.
- **Fluid pill action dock**: circular 48 dp Previous and Next icon buttons flanking
  a prominent 72 × 48 dp stadium pill Shuffle button.
- **Dynamic Monet theming**: on Android 12+ (API 31+), colors are extracted directly from
  the user's system wallpaper (`system_accent1`, `system_accent2`, `system_neutral1`,
  `system_neutral2`), with a curated Google Pixel Sage / Mint palette for pre-v31 and dark mode.

All three designs inherit the same provider base, content resolver, state manager, collection
service, and actions. The renderer resolves the design from the widget ID's
registered provider, including when an action arrives through the shared receiver.
App content refreshes update all six providers; each placed instance still has
independent verse state.

Adding the new picker choices requires an Android prebuild and native rebuild;
a Metro reload cannot register providers. Samsung discovery requires device QA.

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

### Samsung Galaxy Z Flip cover-screen discovery

The home-screen receiver is supplemented by `VerseSpotlightCoverWidgetProvider`,
which inherits the same native renderer and actions. Its separate provider XML
uses Samsung's documented full-panel dimensions (352 × 339 dp), `keyguard`
category, and horizontal/vertical resizing. Its receiver also declares
`com.samsung.android.appwidget.provider`, pointing to a
`samsung-appwidget-provider` resource with `display="sub_screen"`.
The home widget keeps its existing 4 × 2 size and `home_screen` category.
Widget IDs keep each instance's state separate, and app-triggered content refreshes
update instances of all six receivers. Button broadcasts share the home receiver,
which handles either host's widget ID.

References: [Samsung Flex Window guide](https://developer.samsung.com/galaxy-z/flex_window.html)
and [Samsung widget codelab](https://developer.samsung.com/codelab/galaxy-z/widget-flex-window.html).
These published developer examples target Flip5; they do not establish verified
compatibility with every Flip6/7/8 firmware or One UI 8+ release. Validate discovery,
scrolling, controls, camera clearance, and opening the reader on each target device.

This is a native registration change: rebuild and install the Android app;
a Metro reload or JavaScript OTA update cannot add the receiver. For Expo builds:

```bash
npx expo prebuild --platform android --no-install
npm run android
```

On the phone, open Settings → Cover screen → Widgets and look for Verse Spotlight.
If it is absent after installing the updated build, record the device model and
One UI version and inspect `adb shell dumpsys appwidget` for all six provider names
and `adb shell dumpsys package com.anonymous.quranappmobile` for registration.
Discovery on a Samsung cover host must be checked on Samsung hardware; an ordinary
Android emulator cannot verify that picker.

### Generated files

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
