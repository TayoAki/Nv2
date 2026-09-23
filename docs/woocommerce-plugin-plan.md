# Connecting the app to nyonicouture.com

Plan for linking the Nyoni Couture app to the WooCommerce store: live catalogue, real checkout, "Sign in with Nyoni", and Nyoni purchases in the closet. It also covers the iOS App Store rules that shape how checkout and the membership work.

## Summary

Use two features already built into WooCommerce, plus one small custom plugin, the **Nyoni App Bridge**:

| Need | How | New code on the store |
| --- | --- | --- |
| Live prices, stock and sizes | Built-in **webhooks** (product created, updated, deleted) | None |
| Order paid, refunded or cancelled | Built-in **webhooks** (order created, updated) | None |
| Checkout | Built-in **shareable checkout links** (WooCommerce 10+) | None |
| First load of the catalogue and past orders | Bridge plugin: "Send to app" button | Small |
| "Sign in with Nyoni" (store password) | Bridge plugin: login hand-off page | Small |
| Knowing which app shopper placed an order | Bridge plugin: tags orders from app checkout links | Small |

Everything travels **from the store outward**, or through the **shopper's own browser**. The app server never calls into the store.

## Why this approach

**1. The SiteGround bot protection blocks server-to-store calls.** When we tried reading nyonicouture.com's API from a server, SiteGround answered with a captcha. Anything where our server calls the store (the WooCommerce REST API at `/wp-json/wc/`, or the token step of an OAuth login plugin) would need a security exception. In this plan:
- webhooks are sent by the store itself, so they go out and never hit the captcha;
- checkout links and the login page are opened by the shopper's browser, which passes the protection like any visitor.

**2. Least access.** A WooCommerce REST API key with read/write can read every customer and change every order. Webhooks, checkout links and a bridge limited to three jobs mean a leak of the app server can't modify the store.

**3. Live data without polling.** Webhooks arrive the moment a price or stock level changes. With the REST API the server would have to keep asking.

**4. Existing store passwords.** WooCommerce's API can't check a customer's password, so API-only designs need a separate email sign-in. The bridge uses the store's real login page: customers sign in with the account they already have, and no email service is needed.

**5. Less to maintain.** WooCommerce maintains the webhooks and checkout links. The bridge plugin stays small (about 200–300 lines of PHP), and it only gets involved at login, at the start of checkout and for the first sync.

### Options considered

| Option | Problem |
| --- | --- |
| WooCommerce REST API key | Needs a SiteGround exception; the key reaches the whole store; no login with store passwords |
| Off-the-shelf OAuth server plugin (for example miniOrange WP OAuth Server) | The token step is a server-to-store call, which is blocked; a large plugin with premium tiers |
| Mobile-app plugins (for example MStore API) | Also served from `/wp-json/`, so still blocked; built for their own app builders |
| **Built-ins plus a small bridge (chosen)** | A small plugin to maintain |

## How it works

### 1. Catalogue and stock (built-in webhooks)

In WooCommerce → Settings → Advanced → Webhooks, create:

| Name | Topic | Delivery URL |
| --- | --- | --- |
| App: products | Product created / updated / deleted (3 webhooks) | `https://api-production-b54e.up.railway.app/v1/woo/webhooks` |
| App: orders | Order created / updated (2 webhooks) | same |

- **Secret:** each webhook gets the same long random secret, stored in Railway as `WOO_WEBHOOK_SECRET`.
- **Verification:** WooCommerce signs every delivery (the `X-WC-Webhook-Signature` header is an HMAC-SHA256 of the body), and the server rejects anything that doesn't match.
- **What changes:** the server keeps its own copy of products and variations (one per size) and serves it to the app, replacing the CSV export. The admin panel's manual size edits become a fallback for products with no store sizes.
- **Photos:** AI try-on references stay matched by product slug (from `product_url` in the capsule file), so the studio cut-outs keep working. New products use the store's main photo until a cut-out is made.

### 2. Checkout (built-in shareable checkout links)

The shopper taps **Secure checkout**, and:

1. The app server checks prices and stock against its live copy.
2. The server builds a link like `https://nyonicouture.com/checkout-link/?products=VARIATION_ID:QTY,…&nyoni_app=SIGNED_TOKEN`.
3. The app opens it in an in-app browser, so they stay "in" the app. It uses `WebBrowser.openAuthSessionAsync`, which the app already uses.
4. WooCommerce fills the cart and opens the normal checkout page, where they pay with the store's existing payment methods and Apple Pay if enabled.
5. The bridge plugin saves `nyoni_app` on the order.
6. The order webhook tells the server when the order is paid. The app shows "Order confirmed" only then, as the plan requires.
7. The browser returns to the app (`nyonicouture://order/…`), which shows the order status screen.

- **Card data never touches the app or its server.**
- **Checkout links take product IDs;** a size is a variation, which is its own product ID. We'll confirm this on staging (open question 1).

### 3. "Sign in with Nyoni" (bridge plugin)

1. The app opens `https://nyonicouture.com/nyoni-app-login/?state=RANDOM&return=nyonicouture://auth` in the in-app browser.
2. If they aren't signed in, WordPress shows its normal login page (with "Lost password" and "Create account"). After login they come back to the hand-off page.
3. The plugin issues a **login token**, valid for 2 minutes and usable once. It contains the customer ID, email, name and the `state` value, and is signed with the bridge secret.
4. The plugin redirects to `nyonicouture://auth?token=…`. The return address must be on an allow list.
5. The app sends the token to the server. The server checks the signature, expiry, `state` and one-time use, then creates the app session and links it to the store customer.
6. If the shopper had been browsing as a guest, the existing "move my closet into my account" step runs as it does today.

**Security:** short expiry, single use, `state` binding (so another app can't replay a token), an allow-listed return address, and a signed payload. The token contains no password or store session.

### 4. First sync and purchase history (bridge plugin)

- **"Send catalogue to app":** a button in the plugin's settings. It sends all products and variations to the server in batches of 50 and runs in the background (WordPress cron) so large catalogues don't time out.
- **Past orders:** when a customer signs in the first time, the plugin sends their past Nyoni orders.
- **Into the closet:** the server turns each purchased item into a closet piece with its studio photo, labelled "Ordered" until delivered, then "Owned". This costs nothing in AI.
- **Signing:** every bridge message is signed with the bridge secret (header `X-Nyoni-Signature`, HMAC-SHA256 with a timestamp), and the server rejects anything older than 5 minutes.

### 5. Plugin settings page

WooCommerce → Nyoni App:
- **App server URL:** the Railway API.
- **Bridge secret:** generated; copy it into Railway as `NYONI_BRIDGE_SECRET`.
- **Allowed return addresses:** `nyonicouture://` and the web app URL.
- **Test connection:** sends a signed ping and shows the result.
- **Send catalogue to app:** shows progress.
- **Log:** the last 50 deliveries and errors.

## What gets built

**WordPress plugin** (`wordpress/nyoni-app-bridge/`, in this repo)
- The settings page, bridge secret and connection test.
- The `/nyoni-app-login/` login hand-off.
- Saving the `nyoni_app` token from checkout links onto the order.
- The catalogue send and per-customer order history send, with signing and retries.
- Removal cleans up its settings. No database tables of its own; it uses WordPress options and order meta.

**App server (Railway)**
- Endpoints:
  - `POST /v1/woo/webhooks` verifies the WooCommerce signature and updates products, variations and orders.
  - `POST /v1/woo/bridge` receives the catalogue, order history and pings.
  - `POST /v1/auth/nyoni` exchanges a login token for an app session.
  - `POST /v1/checkout` checks the bag and returns a checkout link.
- New tables: store products, variations, customers, orders, app accounts and sessions.
- **Server-side closet, looks and outfits,** so they survive reinstalling and work across devices. Needed once accounts are real.
- AI credits move from devices to member accounts.

**App**
- "Sign in with Nyoni" on the account screen.
- Real checkout through the checkout link, and an order screen driven by the store.
- The closet fills from the member's purchases.
- The remaining demo pieces are removed: demo checkout form, demo sign-in link and sample closet for new members.

## Requirements

- **WooCommerce 10 or later**, for checkout links. Check under Plugins or WooCommerce → Status.
- **WordPress 6.4+ and PHP 8.1+**, which SiteGround supports.
- **Pretty permalinks on.** They almost certainly are already.
- **SiteGround caching:** exclude `/checkout-link/*` and `/nyoni-app-login/*` from the dynamic cache in SG Optimizer, so every shopper gets their own cart and login.
- **Outgoing requests** from WordPress to the Railway API must be allowed. They normally are on SiteGround.
- **A staging copy** of the site (SiteGround Site Tools → WordPress → Staging) for testing before the live store.

## Testing and rollout

1. **Local:** I build and test the plugin on a local WordPress and WooCommerce install, including checkout links with size variations, the login hand-off, webhook signatures and the catalogue send.
2. **Staging:** you install the plugin zip on the SiteGround staging site. We connect it to a staging copy of the API, then test sign-in, a test-mode order, a refund, and price and stock edits.
3. **Beta:** install on the live store and connect it to the live API. Invite testers, with the staff admin watching orders.
4. **Afterwards:** retire the CSV export and use the admin panel only for app-specific settings.

**What will need your time:** installing the plugin, creating the webhooks (about 10 minutes, with written steps), and placing a few test orders on staging.

## iOS App Store rules

### Clothes: no Apple fee

- **Apple's rule:** Guideline 3.1.3(e) says apps that sell **physical goods** must use payment methods **other than** in-app purchase: cards, Apple Pay or your own checkout.
- **So:** Apple takes no cut of clothing sales. The WooCommerce checkout above is exactly what Apple expects.
- **Other fashion apps:** this is how Gucci, Farfetch, Net-a-Porter, SSENSE, Nike and Amazon work. Customers browse, try things on (Gucci's app has AR try-on for sneakers) and pay through the retailer's own checkout, often with Apple Pay. Those apps charge nothing for their digital features, which exist to sell products.

### The $97 membership: counts as digital

- **Why it's digital:** unlocking AI try-on credits and the stylist is a digital service used inside the app, so Guideline 3.1.1 applies.
- **If sold inside the iOS app:** it must be an Apple in-app purchase. Apple takes 30%, or 15% under the Small Business Program and for subscriptions after the first year.
- **Linking to web sign-up (US):** since the April 2025 Epic v. Apple ruling, US apps may link to a web page to buy. In December 2025 the appeals court let Apple charge some commission on those linked purchases; the amount was still being settled. Apps that link out generally still have to offer in-app purchase as well. **Check the current rule when we submit.**
- **Selling only on the website:** allowed. Many apps do this (Netflix and Spotify in some markets). You can't use in-app wording that breaks Apple's current rules, which is why it's worth checking at submission.

### Options for Nyoni

| Option | Apple fee | Notes |
| --- | --- | --- |
| **A. AI styling free for customers.** Credits come with purchases (for example 20 previews per order) plus a small free allowance | None | The Gucci model: the AI sells clothes. Simplest approval. The AI cost is covered by clothing margin. |
| **B. Membership sold on nyonicouture.com.** The app only signs members in | None on web sales | Needs a way to sign up outside the app; in-app links follow the current US rules |
| **C. Membership as an in-app purchase** | 15–30% | The easiest sign-up, but on $97 you keep about $68–82, which squeezes the 80% margin target |

**Recommendation:** option A for the beta, with B added when the paid membership launches. It keeps the AI as a reason to buy, avoids Apple's cut and passes review easily.

### Sign in with Apple

- **The rule:** apps that offer third-party logins (Google, Facebook) must also offer Sign in with Apple (Guideline 4.8).
- **Nyoni is exempt:** apps that only use the company's own account system are exempt, and "Sign in with Nyoni" is Nyoni's own account system.
- **If Google sign-in is added later,** Sign in with Apple must come with it.

## Open questions

1. Do checkout links accept size variation IDs, or only parent products? To test on staging. If only parent products, the bridge plugin adds the variations to the cart itself on the same `/checkout-link/` visit.
2. What WooCommerce version does the store run?
3. Which payment gateways are active (Stripe, WooPayments, PayPal)? Does the store have Apple Pay?
4. Does SiteGround offer a staging site on your plan?
5. Membership model for the beta: option A (free with purchase) or B (web membership)?

## Sources

- [WooCommerce shareable checkout URLs (developer docs)](https://developer.woocommerce.com/docs/best-practices/urls-and-routing/checkout-urls/)
- [Creating sharable checkout URLs (WooCommerce)](https://woocommerce.com/document/creating-sharable-checkout-urls-in-woocommerce/)
- [WooCommerce webhooks (developer docs)](https://developer.woocommerce.com/docs/apis/rest-api/v2/webhooks/)
- [WP OAuth Server plugin (WordPress.org)](https://wordpress.org/plugins/miniorange-oauth-20-server/)
- [App Review Guidelines (Apple)](https://developer.apple.com/app-store/review/guidelines/)
- [Epic v. Apple anti-steering ruling explained (RevenueCat)](https://www.revenuecat.com/blog/growth/apple-anti-steering-ruling-monetization-strategy)
- [Apple defeats ban on commission for linked-out purchases (9to5Mac, December 2025)](https://9to5mac.com/2025/12/11/apple-defeats-ban-on-charging-commission-on-linked-out-purchases-from-ios-apps/)
