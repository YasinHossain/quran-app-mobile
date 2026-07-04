# Quran App Mobile

Expo (React Native) app targeting Android + iOS from a single codebase.

## Prerequisites

- Node.js 20
- Android Studio + Android SDK (for `npm run android`)
- Expo account (for EAS builds)

## Local Android environment

The npm scripts are platform-independent. Configure the Android SDK and Java once
on each computer instead of committing machine-specific paths to `package.json`.

### Windows (PowerShell)

Android Studio normally installs the SDK and bundled Java runtime at the paths
below. Add these user environment variables in Windows **Environment Variables**:

```text
JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
```

Add these entries to the user `Path`:

```text
%JAVA_HOME%\bin
%ANDROID_HOME%\platform-tools
%ANDROID_HOME%\emulator
%ANDROID_HOME%\cmdline-tools\latest\bin
```

Close and reopen PowerShell after changing the variables. Verify with:

```powershell
java -version
adb version
emulator -list-avds
```

### macOS (zsh)

Add this to `~/.zshrc`:

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
```

Then open a new terminal, or run `source ~/.zshrc`, and verify with:

```bash
java -version
adb version
emulator -list-avds
```

If Android Studio or the SDK is installed elsewhere, use its actual path. The
Android Studio SDK path is shown under **Settings > Languages & Frameworks >
Android SDK**.

## Run locally

```bash
npm install
npm start
```

To build and launch the native Android app:

```bash
npm run android
```

To start the first installed Android emulator:

```bash
npm run emulator
```

To select a specific AVD, pass its name or set `ANDROID_AVD` locally:

```bash
npm run emulator -- Pixel_9_Pro_Fold
```

## Verify (recommended)

```bash
npm run verify
```

## Android debugging

Use the repo-local ADB helper to list devices, stream logs, capture screenshots, dump the UI tree, and send taps/keyboard events:

```bash
npm run emulator
npm run debug:android:devices
npm run debug:android:logs
npm run debug:android:screenshot
npm run debug:android:ui
```

See `docs/android-debug.md` for the full workflow.

## Type-check

```bash
npm run type-check
```

## Sync shared core from the web app

This repo expects the web app to be cloned next to it at `../quran-app` (default used by `npm run sync:web-core`).

```bash
npm run sync:web-core
```

To sync from a different path, pass it as an argument:

```bash
npm run sync:web-core -- ..\\somewhere\\quran-app
```

## EAS (builds)

One-time setup:

```bash
eas login
eas init
```

Build Android (internal/dev):

```bash
eas build -p android --profile development
```

Build Android (Play Store):

```bash
eas build -p android --profile production
```

## Shared core code

Reusable business logic copied from the web app lives in:

- `src/core/domain`
- `src/core/application`

## Styling

This repo uses NativeWind (Tailwind-style `className` on React Native components).

## AI docs

Start here:

- `docs/ai-prompt-template.md`
- `docs/ai-workflow.md`
- `docs/ui-parity.md`
- `docs/ui-mapping.md`
