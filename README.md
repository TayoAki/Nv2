# Nyoni Couture app

The front end for the Nyoni Couture mobile app. Shoppers can browse the collection, preview a piece on their own photo, keep a digital closet, get outfits from an AI stylist, and check out through the store. It is built from the Nyoni Couture App Plan v2 and its 18-screen design handoff.

Every screen works end to end against a built-in demo API. You can click through all 18 screens and their alternative states before any backend exists. Connecting the real services later only touches `src/api`.

Stack: Expo SDK 57, React Native 0.86, Expo Router (typed routes), TypeScript, TanStack Query and zustand.

## Run it

```bash
npm install
npm start          # Expo dev server: press i (iOS), a (Android) or w (web), or scan the QR code
npm run web        # browser preview, shown at phone width
```

All the native modules the app uses ship with Expo Go, so it should open there as well as in a development build. So far it has been tested in the web build; test it on real iOS and Android devices before release.

Checks to run before committing:

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # expo lint
npx expo-doctor
```

## Screens

The app has four tabs: Shop, Closet, Stylist and Bag. Each tab has its own stack. Focused steps (photo, closet import, privacy) and modals (checkout, account) sit above the tabs, with no tab bar.

| #   | Screen                     | Route               | File (under `src/app`)                    |
| --- | -------------------------- | ------------------- | ----------------------------------------- |
| 01  | Shop                       | `/shop`             | `(tabs)/(shop)/shop.tsx`                  |
| 02  | Product detail             | `/product/:id`      | `(tabs)/(shop)/product/[id].tsx`          |
| 03  | Choose a piece             | `/try-on`           | `(tabs)/(shop)/try-on.tsx`                |
| 04  | Your photo                 | `/photo`            | `photo.tsx`                               |
| 05  | Preview processing         | `/jobs/:id`         | `(tabs)/(shop)/jobs/[id].tsx`             |
| 06  | AI preview                 | `/preview/:id`      | `(tabs)/(shop)/preview/[id].tsx`          |
| 07  | My closet                  | `/closet`           | `(tabs)/(closet)/closet/index.tsx`        |
| 08  | Review imported clothes    | `/closet/import`    | `closet/import.tsx`                       |
| 09  | Closet item detail         | `/closet/items/:id` | `(tabs)/(closet)/closet/items/[id].tsx`   |
| 10  | AI stylist                 | `/stylist`          | `(tabs)/(stylist)/stylist.tsx`            |
| 11  | Outfit recommendation      | `/outfits/:id`      | `(tabs)/(stylist)/outfits/[id].tsx`       |
| 12  | Saved outfits and previews | `/closet/saved`     | `(tabs)/(closet)/closet/saved.tsx`        |
| 13  | Shopping bag               | `/bag`              | `(tabs)/(bag)/bag.tsx`                    |
| 14  | Store checkout handoff     | `/checkout`         | `checkout.tsx`                            |
| 15  | Order status               | `/order/:receipt`   | `(tabs)/(bag)/order/[receipt].tsx`        |
| 16  | Account and recovery       | `/account`          | `account.tsx`                             |
| 17  | Style preferences          | `/style-profile`    | `(tabs)/(stylist)/style-profile.tsx`      |
| 18  | Photos and privacy         | `/privacy`          | `privacy.tsx`                             |

Each screen also has the alternative states listed in the screen index, such as loading, empty, offline, expired and failed. The demo menu below triggers the states that depend on a failure.

## Demo mode

Open the account menu: the person icon on Shop or the gear icon on Closet. The **Demo mode** section has these scenarios:

| Scenario              | What you'll see                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Normal                | Everything succeeds. A preview takes about 6 seconds.                                                                  |
| Slow AI               | "Still creating your preview" after 10 seconds, then the preview is ready at about 34 seconds.                         |
| Preview times out     | "Still creating your preview", then "This is taking too long" at about 20 seconds.                                     |
| AI failures           | The preview fails its quality check, the stylist is unavailable, one photo in a closet import can't be read, and photo cleanup shows as retrying on the privacy screen. |
| Preview limit reached | New previews stop with the fair-use message.                                                                           |
| Payment fails         | The store returns a failed payment. Nothing is ordered and the bag is kept.                                            |
| Offline               | Every request fails like a lost connection, so offline states appear throughout.                                       |

The menu also has these actions:

- **Simulate a price change in your bag** shows the bag's review-before-checkout state.
- **Restore demo data** resets everything to the sample data.
- **Start as a new shopper** empties the closet, bag, saved looks and stylist conversation, so you can see first-run states.

To see the account migration conflict, sign in with an email that contains the word `existing`.

Demo data is saved on the device (AsyncStorage, or localStorage on web). The chosen scenario resets to Normal when the app reloads. Timed states follow the plan's rules:

- Try-on photos and unsaved previews expire after 24 hours.
- Saved previews expire after 30 days.
- Sign-in links and checkout sessions expire after 15 minutes.

## Project structure

```
src/
  app/          Routes (Expo Router). Every file is a screen; _layout.tsx files define navigators.
  api/          NyoniApi interface (client.ts), domain types, errors
    mock/       The demo backend: fixtures, in-memory database, stylist engine
  data/         TanStack Query hooks per feature (shop, tryOn, closet, stylist, account)
  state/        zustand stores: demo scenario, try-on session, toasts, header menu
  components/
    ui/         Design system: Button, Chip, Sheet, TextField, Feedback states…
    layout/     Screen, AppHeader, TabBar, header menu, toasts
    media/      GarmentImage and OutfitCollage
    icons/      Icon component and generated Lucide glyphs
    shop/ closet/ stylist/ brand/
  theme/        Design tokens: colors, type scale, spacing, radii
  lib/          Formatting, links, photo picking, confirm dialogs, analytics, navigation
scripts/generate-icons.mjs   Regenerates icon data from Lucide
```

## Updating the UI from new designs

1. **Tokens first.** Colors, type scale, spacing and radii live in `src/theme/tokens.ts`. Most visual changes start there.
2. **Shared components.** Buttons, chips, sheets, fields and empty/error states are in `src/components/ui`.
3. **Screens.** Each route file opens with a comment naming its screen number, for example `/** 13 · Shopping bag — /bag */`.
4. **Imagery.** `GarmentImage` shows a real photo whenever a product or closet item has an `image`. Otherwise it draws a tinted garment illustration as a placeholder. Adding real product media removes the illustrations.
5. **Icons.** Add a name to `scripts/generate-icons.mjs` and run `npm run icons`.

Design rules from the plan that the code enforces:

- Gold buttons always use ink text.
- The supplied logo is used unchanged.
- Size is always an explicit choice.
- AI previews are labelled, and progress is shown without fake percentages.
- An order shows as confirmed only after the store verifies it.

## Connecting the real backend

- Implement `NyoniApi` (`src/api/client.ts`) over HTTP, then return that client from `src/api/index.ts` and set `apiMode` to `'live'`. The screens and hooks stay the same.
- In live mode, checkout opens the store's hosted checkout with `WebBrowser.openAuthSessionAsync` and returns to `/order/:receipt`. That screen polls until the store confirms the order.
- Confirm the booking and contact URLs in `src/lib/links.ts`. Each is marked `TODO(F01)`.
- Never put store admin keys or AI provider keys in the app. They belong on the server.

## Plan coverage

The plan's build sequence (F01–F14) lists backend and operational work as well as screens. This repository covers the app side.

| ID  | Outcome                                      | Front end status                                                                  |
| --- | -------------------------------------------- | --------------------------------------------------------------------------------- |
| F01 | Confirm store and prepare pilot assets       | Needs store data. Fixtures use the plan's sample products and prices.             |
| F02 | Browse real catalog and exact variants       | UI done: sizes, sold out, low stock, price changes.                               |
| F03 | Upload and delete private photo              | UI done: consent, permissions, photo checks, deletion.                            |
| F04 | Generate one resumable AI preview            | UI done: job polling, resume, cancel, timeout, failure, limit.                    |
| F05 | Compare and save a preview                   | UI done: original/preview toggle, AI label, save, expiry, delete, report.         |
| F06 | Exact bag and checkout handoff               | UI done: size required, price/stock review, hosted checkout handoff.              |
| F07 | Complete and reconcile an order              | UI done: pending, confirmed, failed and missing receipt. Needs store events.      |
| F08 | Operate a private pilot                      | Not started: device QA, accessibility audit, benchmarks.                          |
| F09 | Recoverable account and wardrobe ownership   | UI done: email link sign-in, recovery, guest migration, sign out.                 |
| F10 | Import, review and organize garment photos   | UI done: batch review, duplicates, low confidence, partial failures.              |
| F11 | Get visual outfits from owned items          | UI done with a rule-based demo stylist. Needs the real model.                     |
| F12 | Optional Nyoni complements                   | UI done: "owned only" respected, budget, stale suggestions.                       |
| F13 | Try a supported outfit item and save the look | UI done: supported items only, one garment per preview.                          |
| F14 | Pilot the complete Closet and stylist journey | Not started.                                                                     |

## Known gaps

- **Design files.** The design handoff (plan PDF, screen index, manifest and gallery) is not in this repository because the repository is public. The 18 concept images were shared in chat and never saved as files.
- **Copy.** Headlines such as "Your next entrance." come from the concept briefs. The screen index says concept copy is not yet approved, so it needs brand sign-off.
- **Photography.** The Shop hero photo comes from the plan's cover. Replace it with licensed campaign photography. Product and closet images are illustrations until real media is connected.
- **Fonts.** Headings use Georgia (serif on Android) until the brand typefaces are confirmed.
- **Testing.** The app has been verified in the web build with scripted browser flows, not yet on physical devices. There are no automated tests in the repository yet.
