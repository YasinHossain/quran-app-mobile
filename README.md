# Quran App Mobile

Expo (React Native) app targeting Android + iOS from a single codebase.

## Prerequisites

- Node.js 20
- Android Studio + Android SDK (for `npm run android`)
- Expo account (for EAS builds)

## Run locally

```bash
npm install
npm run android
```

## Verify (recommended)

```bash
npm run verify
```

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

- `docs/ai-workflow.md`
- `docs/ui-parity.md`
- `docs/ui-mapping.md`
