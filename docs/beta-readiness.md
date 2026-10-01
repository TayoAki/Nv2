# Beta readiness audit

**Audited on:** 1 October 2026. **Updated** the same day: the Beta 1 checklist below shows what has been fixed since.
**Build:** the current `claude/bold-gauss-nclfml` branch, connected to the live Railway API, with real AI (OpenRouter) and no demo tools.

**Method:**
- A code review of every tab.
- A hands-on pass of each tab at phone size against the live API.
- Direct tests of the live server.

Every finding below was checked against the code.

**Beta** here means a small invited group of real shoppers on iPhone, Android and web.

## Summary

| Tab | Status | One-line verdict |
| --- | --- | --- |
| **Shop** | 🟡 Nearly ready | Real catalogue, real AI try-on. Placeholder sizes and stock, placeholder links, and preview reports that go nowhere. |
| **Closet** | 🔴 Not ready | Every new shopper starts with 16 sample pieces they can't clear. Deleting a piece leaves its cut-out on the server. |
| **Scan** | 🟡 Nearly ready | Works end to end. Needs error handling for offline or camera failure, and calibration. |
| **Stylist** | 🟡 Nearly ready | Real AI answers in 6–15 seconds. Styles the sample closet; follow-up chips lose context. |
| **Bag** | 🔴 Not ready | Checkout is simulated and says "Your order is confirmed". No order reaches the store. |
| **Account, privacy, platform** | 🔴 Not ready | Sign-in is simulated, the privacy policy is a draft, there's no crash reporting, and no iPhone or Android builds are set up. |

**What works today** (verified on the live server):
- the catalogue of 31 products and the store admin;
- AI try-on, for single pieces and whole outfits;
- closet photo import (detection, cut-outs, colours, duplicates);
- the AI stylist;
- body measurements and the guided scan;
- credits and spending limits.

**What doesn't exist yet:**
- real checkout;
- real accounts, including saving shopper data anywhere but the phone;
- the store link (the plugin plan);
- a privacy policy;
- crash and usage reporting;
- iPhone and Android builds.

---

## Shop

**Real:**
- The catalogue (31 products, prices, photos).
- AI try-on, single piece and whole outfit, with credits.
- Size selection, never pre-selected.
- The "For you" size from the shopper's scan.

**Blocking for beta**
1. **Sizes and stock are placeholders for products the store export didn't size.**
   - These pages say "Sample sizes and stock until the store connection is live."
   - Stock counts are made up, and "Only N left" is based on them.
   - **Fix:** enter real sizes in the admin panel, or wait for the WooCommerce plugin sync.
2. **"Book a fitting", "Contact Nyoni" and the privacy policy link all open the store homepage** (`src/lib/links.ts`, TODO(F01)).
   - **Fix:** Nyoni provides the real URLs.
3. **"Report a problem" on a preview only marks it on the phone.**
   - The app tells the shopper "The Nyoni team reviews reported previews", but nobody receives the report.
   - **Fix:** send reports to the server, or change the wording.
4. **A preview whose image is missing shows "Demo preview… once a try-on provider is connected".** Replace this with a plain error and a "Try again" button.

**Nice to have:** error messages when reporting or deleting a preview fails, and clearer wording for preview credits.

## Closet

**Real:**
- Photo import through the AI: detection, cut-outs, colours and duplicate flags.
- Adding, editing, archiving and deleting pieces.

**Blocking for beta**
1. **Every new install starts with demo data.**
   - The sample data is 16 Nyoni pieces marked "Owned" plus sample outfits, looks and a stylist chat (`src/api/mock/db.ts:188` seeds `'demo'`).
   - The only way to clear it is a demo tool that's hidden in beta builds.
   - **Fix:** start beta shoppers with an empty closet, filled later from their real Nyoni purchases once the store is connected.
2. **The banner promises something that doesn't exist.** "Sign in so your wardrobe is saved to your account, not just this phone." Everything is stored only on the phone.
3. **Deleting a piece doesn't delete its cut-out on the server.**
   - The dialog says "The piece and its photos are removed".
   - Cut-outs have no expiry (`deleteWardrobeItem` never calls the server). This is a privacy problem.
4. **Photo import can't be cancelled or resumed.**
   - It waits up to 5 minutes.
   - A network blip loses the job, and "Try again" uploads every photo again.

**Nice to have:**
- Copy picked photos into app storage; phone caches can clear them.
- A "Skip" button on the last item.
- Keep the measured colour when the shopper changes the colour name.
- Flag duplicates within the same batch of photos.

## Scan

**Real:**
- Guided camera scan: voice countdown, framing guide, and an automatic retake with "what to fix".
- Upload-two-photos route.
- Measurements and suggested sizes, with "between sizes" called out.
- Photos are deleted after measuring.

**Blocking for beta**
1. **Endless retries when the problem isn't the pose.**
   - Offline, the service being down or the hourly limit all go into the "fix your pose" loop.
   - It takes and uploads a photo and speaks the error every ~12 seconds, forever.
   - **Fix:** auto-retry only pose problems; show a "Try again" screen for everything else.
2. **A camera that fails to start shows "…" forever.** Causes include another app using it, no back camera on a laptop, or permission revoked. **Fix:** handle `onMountError` with a message and the upload route.
3. **The countdown keeps running when the app goes to the background.** Pause it when the app is backgrounded, and keep the screen awake during the scan.
4. **Accuracy isn't calibrated yet.**
   - The app says so ("Early version"), and sizes near a size boundary already show both options.
   - Calibrate with 10–20 real people before or early in the beta (`measure/calibrate.py`).
5. **Consent and measurements live only on the phone.**
   - The consent version isn't recorded on the server.
   - Measurements are lost on reinstall.
   - This is fine for a short beta if testers are told; it must be fixed before launch.

**Nice to have:**
- Cap retakes.
- Shrink photos before upload, which is faster on mobile data.
- Announce the countdown to VoiceOver on iPhone.
- Don't cut off the "All done" voice line.

## Stylist

**Real:**
- The AI stylist, Gemini through OpenRouter. It answers in 6–15 seconds against the live server, and every proposal is checked: real pieces, suits worn whole, budget and in-stock items.

**Blocking for beta**
1. **It styles the sample closet,** because of the demo seed (see Closet 1). Real shoppers would get outfits made of pieces they don't own.
2. **"More relaxed" and "Dress it up" lose context.**
   - With the AI stylist, the follow-up sends only the chat text, not the previous outfit's pieces or the piece being styled, so the AI has to guess.
   - **Fix:** send the previous outfit and the focus piece with every follow-up.
3. **Silent switch to the rule-based stylist.**
   - If the AI status check fails, replies quietly come from the old rule engine, and testers can't tell which answered.
   - **Fix:** show an error with "Try again" instead.
4. **Waiting time.**
   - Replies take 6–15 seconds (one test took 50). In one browser test the request failed with "Your stylist is unavailable"; it didn't reproduce against the server directly, so re-check on a real phone.
   - **Fix:** a clearer waiting state ("Looking through your closet…"), a 60-second timeout, and an automatic single retry.
5. **Two preferences are saved but ignored.**
   - "Use owned pieces first" and City are never sent to the stylist.
   - The budget is labelled "per new outfit", but it's applied per add-on.

**Nice to have:**
- Titles on error screens.
- Announce new replies to VoiceOver.
- 30-day chat retention.
- A note that chat text is processed by an AI provider.

## Bag and checkout

**Real:** the bag, price and stock change notices, and "review before checkout". All of it is on the phone only.

**Blocking for beta**
1. **Checkout is simulated.**
   - "Continue to payment" waits 2.6 seconds, then shows "Thank you. Your order is confirmed. A receipt will be sent to your email." with reference `DEMO-001`.
   - No order, payment or email reaches the store.
   - Labels like "Illustrative checkout layout" and "Demo checkout · no payment is taken" show to shoppers.
   - This breaks the plan's own rule: never show success before the store confirms.
   - **Fix:** the WooCommerce checkout links in `docs/woocommerce-plugin-plan.md`. As a quick interim, "Buy on nyonicouture.com" opens the product's store page with the size chosen.
2. **"Total paid" shows the subtotal,** without shipping or tax.

**Nice to have:**
- Error messages if removing a line fails.
- A bag saved on the server so it follows the shopper across devices.

## Account, privacy and platform

**Blocking for beta**
1. **Sign-in is simulated.**
   - The app says "We sent a link to …", but no email is sent, and any email "signs in".
   - Recovery promises to restore your closet; nothing is stored anywhere but the phone.
   - **Fix:** hide Account in the beta (everyone is a guest) until "Sign in with Nyoni" from the plugin plan.
2. **The privacy screen is a draft.**
   - It says "Proposed policy" and "Privacy settings concept".
   - "Delete my account" says "We'll confirm by email", but no email exists.
   - Real shoppers upload body and face photos, so a real privacy policy and terms are required. They must cover AI processing (OpenRouter and the model providers), 24-hour photo deletion, and measurements.
3. **All shopper data lives only on the phone.** Closet, looks, outfits, chat, bag and measurements are lost on reinstall. Tell testers, or add server accounts first.
4. **No iPhone or Android builds yet.**
   - `app.json` has no bundle identifier or package name, and there's no `eas.json`.
   - Nothing has been tested on real phones: camera, iPhone HEIC photos, permissions.
5. **No visibility into the beta.**
   - No crash or error reporting (no Sentry or error boundary).
   - Analytics is a no-op; usage events aren't sent anywhere.
6. **Spending controls.**
   - The server caps preview images at 300 a day (about $21).
   - But the per-network limit on new devices can be bypassed, and per-device limits reset on each deploy.
   - **Set a monthly limit on the OpenRouter key**, and rotate it, since it was shared in chat.

**Nice to have:**
- Remove the artificial delay (250–700 ms) the demo layer adds to every request, even live.
- Hide the "Store admin" menu link from shoppers on the web.
- Restrict allowed web origins (CORS) to the web app.

---

## What it takes to get to beta

### Recommended "Beta 1": guest-only, buy on the store
This is the fastest honest beta. It keeps everything that works and removes what's simulated.

**Done in this repo** (see `docs/store-submission.md` for the store forms):
- [x] New installs start as guests with an example closet, marked "Example", that the shopper can remove. No sample looks, chat, bag or orders.
- [x] Checkout opens each piece on nyonicouture.com. The in-app simulated checkout only exists in demo builds.
- [x] Sign-in hidden ("coming soon"). Sync promises and demo wording removed.
- [x] Scan: only pose problems retake on their own, at most 4 in a row. Offline, service and limit errors stop with "Try again". A camera that won't start offers the upload route. The countdown pauses in the background, the screen stays awake, and the last voice line isn't cut off.
- [x] Stylist: follow-ups send the last outfit and the piece being styled. No silent switch to the rule engine. Clearer waiting text, a 60-second timeout and one automatic retry. "Use owned pieces first" is sent. The budget label now says it applies to each suggested piece.
- [x] Deleting a piece, or discarding it from an import, deletes its cut-out on the server.
- [x] Preview reports reach the server, with a "Preview reports" view in the store admin.
- [x] AI consent before any photo or message leaves the phone, naming the providers (Apple 5.1.2(i)). It can be withdrawn under Privacy.
- [x] "Delete all my data" deletes the device and everything stored for it on the server.
- [x] Privacy policy and terms linked in the menu, on the privacy screen and on the consent sheet.
- [x] iPhone and Android build setup: `eas.json`, bundle ID and package `com.nyonicouture.app`, versions kept by EAS.
- [x] Crash screen instead of a blank app.
- [x] Artificial delay removed outside demo builds. Store admin hidden from shoppers.

**Still to do:**
- [ ] Crash reporting service (Sentry) and real analytics events: needs Nyoni's choice of provider.
- [ ] Tighten CORS to the web app's address.
- [ ] Test on real iPhones and Android phones once the first builds exist: camera, HEIC photos, permissions.

**Nyoni needs to provide:**
- [ ] The real booking and contact URLs.
- [x] Privacy policy and terms URLs (linked in the app). **Check that the policy covers the app**: the list is in `docs/store-submission.md`.
- [ ] Real sizes and stock for every product: in the admin panel now, or through the plugin later.
- [ ] An Apple Developer account and a Google Play developer account, for test builds.
- [ ] A monthly spending limit on the OpenRouter key, and a new key.
- [ ] 10–20 people for the scan calibration (tape measure plus scan), and the beta tester list.

### "Beta 2": connected to the store
This follows the plugin plan:
- real checkout through store checkout links, confirmed by the store;
- "Sign in with Nyoni";
- shopper data saved on the server;
- Nyoni purchases filling the closet;
- live stock from WooCommerce.

### Already done
- Live AI everywhere, with spending limits.
- 42 server tests, 9 measurement tests and the browser flows passing.
- Demo tools hidden from beta builds.
- Photos deleted after measuring, and try-on photos after 24 hours.
