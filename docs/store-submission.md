# App Store and Google Play submission

These are the answers for the store forms for **Beta 1**: guests only, buy on nyonicouture.com. Check them again when "Sign in with Nyoni" ships (plugin plan): accounts add contact info, a user ID and purchase history.

## Builds

| | |
| --- | --- |
| iOS bundle ID | `com.nyonicouture.app` |
| Android package | `com.nyonicouture.app` |
| Build profiles (`eas.json`) | `preview`: internal test builds. `production`: TestFlight and Google Play. Both use the live API. |
| Version numbers | Kept by EAS (`appVersionSource: remote`); `production` raises the build number each time. |
| Encryption | Standard HTTPS only, so `usesNonExemptEncryption` is false: no export compliance documents are needed. |

```bash
npx eas-cli@latest build --profile preview --platform all   # internal testers
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit --platform ios                     # TestFlight
npx eas-cli@latest submit --platform android                 # Play internal testing
```

The first build asks for the Apple Developer and Google Play accounts. They must belong to Nyoni Couture, so the listing shows Nyoni as the seller.

## Links

- **Privacy policy:** https://nyonicouture.com/privacy-policy/
- **Terms:** https://nyonicouture.com/terms-and-conditions/
- **Support URL:** the store's contact page (still needed, see `src/lib/links.ts`).

Both links are in the app: under Account in the menu, on the privacy screen and on the AI consent sheet.

**The privacy policy must cover the app.** Apple and Google reviewers read it. It needs to say:
- photos are sent to Nyoni's server and to AI providers (OpenRouter, which routes to OpenAI and Google) to make try-on previews, read closet photos and answer the stylist;
- try-on photos are deleted after 24 hours; body-scan photos straight after measuring; closet photos when the piece is deleted;
- body measurements stay on the phone;
- the providers don't use the photos to train models (check this against OpenRouter's settings for the key);
- how to delete everything: Account → Privacy → Delete all my data.

## Apple: App Privacy (nutrition labels)

Nothing is used for tracking, and nothing is linked to the shopper's identity: the app has no accounts in Beta 1 and uses a random device token.

| Data type | Collected | Purpose | Linked to identity | Tracking |
| --- | --- | --- | --- | --- |
| Photos or Videos | Yes (try-on and closet photos) | App Functionality | No | No |
| Other User Content | Yes (stylist messages) | App Functionality | No | No |
| Device ID | Yes (a random app token, not the advertising ID) | App Functionality, fraud prevention (spending limits) | No | No |
| Contact info, location, health, purchases, browsing, diagnostics | Not collected | | | |

- **Body measurements:** the scan photos are processed in real time and deleted at once, and the measurements are kept on the phone only. Under Apple's definition this is not collected. If measurements are later saved to the server, add **Health & Fitness → Fitness**.
- **Purchases:** made on nyonicouture.com, not in the app.

## Google Play: Data safety

- **Is data encrypted in transit?** Yes.
- **Can users ask for their data to be deleted?** Yes: in the app (Privacy → Delete all my data), which deletes the server data at once. There's no account to delete in Beta 1. When accounts ship, the web deletion page from the plugin plan (4.8) is the "delete account" URL.

| Data type | Collected | Shared | Optional | Purpose |
| --- | --- | --- | --- | --- |
| Photos | Yes, kept briefly | No ¹ | Yes | App functionality |
| Other in-app messages (stylist) | Yes | No ¹ | Yes | App functionality |
| Device or other IDs | Yes | No | No | App functionality, fraud prevention |

¹ Sending data to a service provider that processes it for Nyoni (OpenRouter and the model providers) is not "sharing" under Google's definition.

## AI rules

- **Apple 5.1.2(i):** before any photo or message goes to an AI service, the AI consent sheet names OpenRouter, OpenAI and Google, says what is sent and why, and asks for permission. Shoppers can withdraw it under Privacy.
- **Google Play AI-generated content:** every preview has "Report a problem". Reports reach the server and show in the store admin under "Preview reports".
- AI output is labelled as AI throughout.

## App Review notes (paste into App Store Connect)

> Nyoni Couture is the app for nyonicouture.com, a menswear store. No sign-in is needed: the app opens as a guest with an example closet.
>
> - **Purchases:** clothes are bought on nyonicouture.com. The app opens the store's product page in the browser (guideline 3.1.3(e), physical goods). The app sells no digital content.
> - **AI features** (try-on previews, closet photo reading, stylist) ask for consent first and name the providers. Try them with any full-length photo.
> - **Body scan** (Scan tab) needs a person standing 2–3 m from the phone. You can also test it with "Use photos I already have" and any two full-length photos (front and side).
> - **Data deletion:** Account → Privacy → Delete all my data.

When accounts ship, add the reviewer test account from plugin plan 4.9.

## Age rating

There's no user-to-user content, no web browsing inside the app, and no gambling or mature themes. The answers give **4+** on the App Store and **Everyone** on Google Play.
