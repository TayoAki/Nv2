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

## The Nyoni capsule

The Shop catalog is the real Nyoni capsule: 39 pieces making up 31 products, from `shared/catalog/nyoni-capsule.json` (also kept as `.csv`). The app and the server build the catalog with the same code, `shared/catalog/capsule.ts`.

- **Pieces and products.** Each row is one wearable piece. A suit's jacket, trousers and waistcoat are separate rows that share `sold_as`, and the app groups them into one product with its pieces listed. Only the suit carries a price (`sold_as_price_usd`), so it's counted once.
- **Photos.** All 39 house photos are in `assets/collection/`, named `<key>.webp`. A transparent cut-out saved as `<key>.png` takes priority; after adding either, run `npm run collection`. A suit's parts share the photo of the whole suit until the cut-out pass separates them.
- **Colour.** `hex_measured` holds up to three colours measured from each photo, most dominant first. The first is the piece's colour; all of them are kept as `swatches` for matching.
- **Sizes and stock.** Sizes come from `sizes_available` and stock from `in_stock`. Where no sizes are listed (the Ivoire blazer, the trousers and the waistcoats), the product gets made-up sizes, flagged on the product page until they're edited in the admin panel.
- **Suits stay whole.** The photos show each suit as a complete look, so a suit is one item with one photo for shopping, try-on and outfits. Its pieces are listed on the product page.

## Store admin

Staff edit sizes, stock and prices at `/admin`. The admin runs **on the web only**: the iOS and Android apps don't show the link, and the `/admin` pages redirect to the shop there. On the web, open `/admin` directly or use **Store admin** in the account menu.

- **Sign-in:** every admin page and every admin API call needs a staff session. After 5 wrong passwords, sign-in pauses for 30 seconds, and a session lasts 12 hours. The demo staff account (`staff@nyonicouture.com` / `nyoni-admin`) exists only in the demo backend; the live admin will sign in against the store's server, and no staff credential ships in the app.

- **Products list:** search, and filters for made-up sizes, edited products, and low or sold-out stock.
- **Product editor:** set the price and each size's label and stock. Add or remove sizes, or reset to the store export. A stock of 2 or fewer shows shoppers "low stock"; 0 shows "sold out".
- **Where edits apply:** everywhere at once. A price change makes the bag ask the shopper to review it, and a removed size stays in the bag as unavailable instead of disappearing.
- **Storage:** edits are store data, kept separately from shopper demo data, so "Restore demo data" doesn't undo them.
- **WooCommerce:** the sync button is disabled until the store is connected. The API methods (`adminListProducts`, `updateInventory`, `resetInventory` in `src/api/client.ts`) are what the app server implements against the WooCommerce REST API.
- **Still derived:** occasions come from formality and the product copy.

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

## Server (Railway)

`server/` is the Nyoni API: Node 22, Hono and Postgres, deployed on Railway from `server/Dockerfile`. So far it serves the catalog and the store admin; the other shopper features still run on the in-app demo backend.

- `GET /v1/catalog`: the capsule with staff edits applied (built with the same `shared/catalog` code as the app).
- `POST /v1/admin/sessions`, `GET` / `DELETE /v1/admin/session`: staff sign-in with scrypt-hashed passwords. Session tokens are stored only as hashes and last 12 hours. Sign-in pauses after 5 failures per email or 20 per client.
- `GET /v1/admin/products`, `PUT` / `DELETE /v1/admin/products/:id/inventory`: sizes, stock and price edits, validated and logged in `inventory_audit`.

The app points at the live server through `EXPO_PUBLIC_API_URL` in `.env` (`https://api-production-b54e.up.railway.app`). After changing it, restart with `npx expo start --clear`, because the value is baked into the bundle. Delete the line to run on the demo backend only. The app then syncs the catalog from the server (at most every 30 seconds, and right after a staff edit), and the store admin signs in against the server.

Server variables in Railway:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Railway Postgres connection (a reference to the Postgres service) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | The first staff account, created or updated on deploy. The password must be 12+ characters; changing it signs that account out everywhere. |
| `CORS_ORIGINS` | Web origins allowed to call the API (comma-separated), or `*` |
| `OPENROUTER_API_KEY` | For the AI features in the next steps |

Run it locally with `cd server && npm install && DATABASE_URL=… npm run dev`. Tests (`npm test`) need a Postgres database in `DATABASE_URL`.

## Feature status

Status as of this build. "Working" means it works end to end against the demo backend in the app; "needs backend" means the screen and flow are done but need a real service.

| Area | Status |
| --- | --- |
| All 18 screens and their alternative states | Working |
| Shop catalog: 31 real products, photos, measured colours, sizes, stock | Working; served by the Railway server with staff edits (live WooCommerce sync not connected) |
| Product page, size picker, size guide, add to bag | Working |
| Bag: quantities, price and stock changes, review before checkout | Working |
| Checkout handoff and order status | Working with a demo checkout; the real WooCommerce checkout needs backend |
| Try-on photo flow: consent, upload, job progress, cancel, time-out, failure, limit, save, expiry | Working; the preview image is a placeholder until the render model (`gpt-image-2`) is connected |
| Closet: add, import review, edit, archive, delete, duplicates | Working; photo recognition and cut-outs are simulated until the ingest pipeline is connected |
| Stylist: outfits from your closet, follow-ups, Nyoni suggestions, saved outfits | Working with a rule-based demo stylist; Gemini (text and Live voice) needs backend |
| Account: email sign-in link, recovery, guest migration, sign out | Working with a demo link; real email sending needs backend |
| Style preferences, privacy controls, photo deletion | Working; deletion from real storage needs backend |
| Store admin (web): staff sign-in, sizes, stock, prices | Working on the Railway server (real staff accounts, shared edits); WooCommerce sync not connected |
| Demo scenarios for failures and empty states | Working |
| Tested on real iOS and Android devices | Not yet (Expo Go on iPhone loads the app) |
| Automated tests in the repository | Not yet |

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
| F01 | Confirm store and prepare pilot assets       | Capsule of 31 real products with photos, measured colours, sizes and stock.      |
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
- **Photography.** The Shop hero photo comes from the plan's cover. Replace it with licensed campaign photography. Capsule products use the house photos; suit parts still need cut-outs.
- **Fonts.** Headings use Georgia (serif on Android) until the brand typefaces are confirmed.
- **Testing.** The app has been verified in the web build with scripted browser flows, not yet on physical devices. There are no automated tests in the repository yet.
