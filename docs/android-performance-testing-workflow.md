# Android Performance Testing Workflow

This is the short day-to-day workflow. The detailed investigation history and
release gates remain in `docs/android-performance.md`.

## Test devices

Use three lanes. They answer different questions:

1. `quran_api36` is the normal development emulator. Use it for fast iteration,
   layout, navigation, and functional checks.
2. `quran_budget_api34` is a repeatable regression screen: Android 14 / API 34,
   2 CPU cores, 2 GB RAM, 720 x 1600 at 320 dpi. It can expose memory pressure,
   large layouts, and obvious jank, but its CPU, GPU, storage, and thermals are
   still supplied by the host Mac. Do not treat its timings as budget-phone
   timings.
3. A physical low-end Android phone with 2-3 GB RAM, a 720p display, and slower
   storage is the release evidence. Add a physical mid-range phone so an
   optimization is not tuned only for the slowest device.

## Physical phone over USB or Wi-Fi

Enable Developer options and USB debugging, connect an unlocked phone with a
data-capable cable, and accept the computer's RSA prompt. Verify the selected
physical phone (emulators are deliberately ignored):

```sh
npm run device:android
```

The release app and development client use separate application IDs so they can
coexist without deleting saved release data. Install the development client
after native/config changes, then use the physical-device Metro command for
normal work:

```sh
npm run android:device
npm run dev:android:device
```

The second command creates `adb reverse tcp:8081 tcp:8081` through the selected
ADB transport. JavaScript, TypeScript, and style edits then use Fast Refresh.
Leave that terminal running.

Build and install current release bytes for a performance checkpoint without
clearing app data:

```sh
npm run perf:android:device
```

Android 11 and newer can deploy and debug over Wi-Fi. Enable **Wireless
debugging**, pair this laptop once with **Pair device with pairing code**, and
keep both devices on the same Wi-Fi network. If a paired phone is advertised but
does not connect automatically, discover its current endpoint and connect it:

```sh
adb mdns services
adb connect <ip-address:connect-port>
adb devices -l
```

The connect port shown by `adb mdns services` is not necessarily the temporary
pairing port shown on the phone. The endpoint can change when wireless debugging
or the network is restarted.

Each install targets only one ADB serial and each phone keeps its own app data.
When multiple phones are connected, select the intended one explicitly:

```sh
adb devices -l
ANDROID_SERIAL=<serial> npm run android:device
ANDROID_SERIAL=<serial> npm run perf:android:device
```

If one phone appears once by USB and once by Wi-Fi, the helper recognizes it as
one phone and prefers USB by default. Set `ANDROID_SERIAL` to its Wi-Fi
`ip-address:port` entry, or unplug USB, to force wireless transport. Two genuinely
different phones require an explicit serial so the project cannot install to the
wrong phone. The build is limited to the selected phone's primary ABI, so repeat
the install command for a second phone with a different ABI.

USB is convenient for builds and large transfers. Wi-Fi with the cable unplugged
is preferable when measuring battery drain or behavior without charging heat.
Selecting Wi-Fi while leaving the cable connected does not stop USB power. For
comparable runs, record charging state and battery/thermal state, let the phone
cool, and avoid screen recording or verbose profiling during the measured pass.

Codex can use the existing ADB helper to inspect and drive the connected phone:

```sh
npm run debug:android:devices
npm run debug:android -- observe
npm run debug:android -- logs
npm run debug:android -- tap 540 1800
npm run debug:android -- swipe 540 1900 540 650 350
```

Prefix these commands with `ANDROID_SERIAL=<serial>` whenever `adb devices -l`
shows multiple entries, including simultaneous USB and Wi-Fi entries for one
phone.

`observe` writes a timestamped screenshot, accessibility/UI tree, logcat,
memory report, frame report, and current activity under `scratch/android-debug/`.
For the side-by-side development client, prefix debug commands with
`ANDROID_PACKAGE=com.anonymous.quranappmobile.dev`.

Create the budget AVD once (the command is safe to repeat):

```sh
npm run setup:emulator:budget
```

Run only one emulator when collecting comparable numbers. Quit the normal
emulator before starting the budget AVD:

```sh
npm run emulator:budget
```

The budget AVD requests the host graphics path. Deliberately disabling its GPU
creates a different bottleneck; it does not accurately turn a fast host into a
cheap phone. If the emulator falls back to software rendering, treat frame
timings as diagnostic only and use the physical phone for acceptance.

## Which build to use

### While coding

Use the development client and Metro:

```sh
npm run dev:android
```

JavaScript, TypeScript, and style changes use Fast Refresh. Do not reinstall the
app after each save. Rebuild/install a development client only after native
changes such as Kotlin/Java edits, a new native dependency, an Expo config
plugin change, or relevant `app.json` changes:

```sh
npm run android
```

Development mode is useful for finding unnecessary React renders, but its
timings are not release-performance results.

### At a performance checkpoint

Build and install the non-debuggable release app on the selected device:

```sh
npm run perf:android
# or, with the normal emulator closed:
npm run perf:android:budget
```

Run this after the code whose performance is being judged changes. Gradle keeps
incremental build outputs, so a clean build is not normally needed. Use
`npm run perf:android:clean` only for a suspected stale build or build-cache
problem.

For repeated journeys on the same APK, do not rebuild or reinstall. Force-stop
and relaunch the installed build so all repetitions measure identical bytes.
The existing harness does this without clearing user data:

```sh
PERF_PROFILE=saved-settings PERF_SURAH_ID=2 PERF_CYCLES=10 \
  scripts/perf/android-reader-baseline.sh
```

Clearing app data is a separate first-install test. Do not mix it into warm or
saved-state comparisons.

## Check frequency

| When | Check |
|---|---|
| Every save | Fast Refresh and a quick interaction check in the development client |
| End of a feature-sized change | Release build on the budget AVD; repeat the exact affected journey 5-10 times |
| Before accepting an optimization | Same release APK journey before/after on the physical low-end phone; keep settings, data, network, thermals, and test actions matched |
| Before handoff | `npm run verify`, release APK/AAB, low-end and mid-range physical-device matrix |

## What to record

Record the Git commit and dirty state, APK SHA-256, device and Android version,
app settings, network state, scenario, and raw output. Save captures under
`.artifacts/performance/`.

For this app, prioritize:

- time until real Home or Quran content is visible, not only Android activity
  launch time;
- frame timing/jank for fixed reader scrolling, navigation, sheets, word study,
  and audio interactions;
- RSS/PSS before the journey, in the reader, after returning Home, and after ten
  cycles, looking for an eventual plateau;
- crashes, ANRs, frozen frames, low-memory process death/restoration, offline
  behavior, downloads, and background audio;
- battery and thermal behavior during a 15-30 minute reading/audio session.

Use Android Studio System Trace/Profiler or Perfetto to diagnose a failed
scenario. The in-app development performance monitor is a hint, not the final
measurement. Formal cold/warm/hot startup and Baseline Profile work belongs in
the Phase 4 Macrobenchmark setup described in `docs/android-performance.md`.
