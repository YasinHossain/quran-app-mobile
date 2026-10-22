# Navigation rules

This app uses Expo Router’s file-based routing with React Navigation under the hood. The following conventions keep navigation consistent across the codebase.

## File-based routes

- **Route root**: All route files live under `app/`.
- **Screen files** map to paths:
  - `app/(tabs)/index.tsx` → `/` (Read tab).
  - `app/(tabs)/search.tsx` → `/search` (hidden from the bottom tabs; opened from in-reader search / Go To).
  - `app/(tabs)/bookmarks.tsx` → `/bookmarks`.
  - `app/(tabs)/planner.tsx` → `/planner`.
  - `app/(tabs)/settings.tsx` → `/settings`.
  - `app/juz/[juzNumber].tsx` → `/juz/:juzNumber` (dynamic segment).
  - `app/surah/[surahId].tsx` → `/surah/:surahId` (dynamic segment).
  - `app/modal.tsx` → `/modal`.
  - `app/+not-found.tsx` → fallback for unknown routes.

### Naming conventions

- Use **kebab-case** for multi-word files if ever needed (e.g., `app/user-profile.tsx`).
- Use **dynamic segments** in square brackets for params (`[id].tsx`, `[surahId].tsx`).
- Use **group folders** in parentheses for logical grouping without affecting the URL (`(tabs)`).

## Nested navigation

- `_layout.tsx` defines the navigator for its directory.
- The root layout (`app/_layout.tsx`) defines the app `Stack` and theme. It registers the tab group and modal screen at the stack level.
- The tabs layout (`app/(tabs)/_layout.tsx`) defines the `Tabs` navigator and provides per-tab configuration (title, icons, header actions).
- To add a new tab:
  1. Create `app/(tabs)/<name>.tsx`.
  2. Add a corresponding `<Tabs.Screen name="<name>" ... />` in `app/(tabs)/_layout.tsx`.
- To keep a route under `app/(tabs)/` but remove it from the bottom tab bar, set `href: null` (and optionally `tabBarButton: () => null`) in `app/(tabs)/_layout.tsx`.
- To add a new stack screen at the root:
  1. Create `app/<route>.tsx` (or nested folders as needed).
  2. Register it in `app/_layout.tsx` if you need to customize its presentation options.

## Modal routing

- The modal route is defined at the root stack level so it can be presented above tabs.
- `app/modal.tsx` is registered with `presentation: 'modal'` in `app/_layout.tsx`.
- Open the modal using a link or router push to `/modal` (e.g., `Link href="/modal"`).
- Keep modal screens focused and dismissible; they should not become navigation hubs.
- If you need additional modals:
  1. Add a new route file in `app/` (e.g., `app/feedback-modal.tsx`).
  2. Register it in `app/_layout.tsx` with `presentation: 'modal'`.

## Navigation utilities

- Prefer `Link` from `expo-router` for declarative navigation.
- Use route params through `useLocalSearchParams` inside dynamic routes.
- Keep screen options (titles, icons, headers) colocated in the nearest `_layout.tsx`.
