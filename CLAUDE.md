@AGENTS.md

# Nyoni Couture conventions

See README.md for the screen map, demo scenarios and plan coverage.

## Navigation

- App code never imports `@react-navigation/*`. Use `expo-router`, or `expo-router/react-navigation` for lower-level APIs such as `usePreventRemove` and `CommonActions`. Tab bar types come from `expo-router/js-tabs`.
- Routes live in `src/app`. Keep components, hooks and helpers outside it.
- The tabs are the JS `Tabs` with the custom `TabBar`. Each tab group has its own Stack with `unstable_settings.anchor`, so deep links keep a back target.
- `router.dismissTo` can't switch tabs because tab routers ignore its POP_TO action. Use it within a stack, or from a root-stack screen (photo, checkout) back into the tabs. For a full reset, use `resetToShop` in `src/lib/navigation.ts`.

## Data

- Screens read and write data only through the hooks in `src/data` (TanStack Query). Those hooks call the `NyoniApi` interface in `src/api/client.ts`, which is the demo API (`src/api/mock`) until a backend exists.
- Keep money in integer minor units (`amountMinor`) and display it with `formatMoney`.
- A new failure or edge state must also be reachable from demo mode: add it to `DEMO_SCENARIOS` (`src/state/devSettings.ts`) and to the mock API.

## UI

- Take colors, type, spacing and radii from `@/theme`. Render text with `AppText` variants and icons with `Icon`; add icons with `npm run icons`.
- Gold buttons use ink text (the `Button` component handles this). Use the supplied logo unchanged, through `BrandLockup`.
- Text-style buttons keep the `button` role. Pass `accessibilityRole="link"` only when the press opens a web page.
- React Compiler is on, so don't read refs during render; create `Animated.Value`s with lazy `useState`. On web, set `useNativeDriver` to false (`Platform.OS !== 'web'`).

## Product rules from the plan

- Never show success before the API confirms it. Orders are confirmed only by the store.
- Label AI output. Show AI progress by steps, not percentages.
- The size is always chosen by the shopper, never pre-selected.
- Keep the permission to reuse a try-on photo separate from stylist personalization.
- `track()` drops photo, URL, text and email fields. Never log photos, chat text or signed URLs.

## Checks

Run `npm run typecheck`, `npm run lint` and `npx expo-doctor` before finishing. Typed routes are generated into `.expo/types` when `npx expo start` runs.
