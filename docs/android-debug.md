# Android Debugging

This repo includes a small ADB wrapper so agents can inspect and drive the Android app without a browser debugger.

## Prerequisites

- Android Studio or Android platform-tools
- An Android emulator or USB device visible to `adb devices`

Install **Android SDK Platform-Tools** through Android Studio on Windows or
macOS. On macOS, it can alternatively be installed with:

```bash
brew install android-platform-tools
```

If `adb` is installed somewhere custom, pass it with `ADB`:

```bash
ADB=/path/to/adb npm run debug:android -- devices
```

## Common Workflow

Start an emulator or connect a device, then confirm it is visible:

```bash
npm run emulator
npm run debug:android:devices
```

Run the app:

```bash
npm run android
```

Stream React Native, Expo, and crash logs:

```bash
npm run debug:android:logs
```

Capture the current screen:

```bash
npm run debug:android:screenshot
```

Dump the current Android UI tree:

```bash
npm run debug:android:ui
```

Screenshots and UI dumps are written to `scratch/android-debug/` by default.

## Navigation Commands

Use the generic command when an agent needs to interact with the device:

```bash
npm run debug:android -- tap 500 1200
npm run debug:android -- text "al fatiha"
npm run debug:android -- back
npm run debug:android -- swipe 500 1600 500 400 300
npm run debug:android -- launch
```

For multiple connected devices, select one with either `ANDROID_SERIAL` or `--device`:

```bash
ANDROID_SERIAL=emulator-5554 npm run debug:android:screenshot
npm run debug:android -- --device emulator-5554 tap 500 1200
```
