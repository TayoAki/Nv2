# Connecting the app to nyonicouture.com

How the Nyoni Couture app works with the WooCommerce store, and the spec for the **Nyoni App Bridge** WordPress plugin.

- **Who builds what:** Nyoni's developer builds the plugin (section 4). The app and server side (section 5) are built in this repo.
- **Status:** plan, version 2. Nothing is installed on the store yet.

## Contents

1. [Decisions](#1-decisions)
2. [Tiers and what they unlock](#2-tiers-and-what-they-unlock)
3. [How it fits together](#3-how-it-fits-together)
4. [Plugin spec (for Nyoni's developer)](#4-plugin-spec-for-nyonis-developer)
5. [App and server side (built in this repo)](#5-app-and-server-side-built-in-this-repo)
6. [What we need from Nyoni](#6-what-we-need-from-nyoni)
7. [Testing and rollout](#7-testing-and-rollout)
8. [Why this approach](#8-why-this-approach)
9. [iOS App Store rules](#9-ios-app-store-rules)
10. [Open questions](#10-open-questions)

---

## 1. Decisions

1. **Every payment happens on nyonicouture.com**, never inside the iOS or Android app. That covers clothes and the **Nyoni Club** membership ($99 a year). Payments use the store's existing checkout and gateways, so Apple and Google take no commission.
2. **The app never takes payment.** It sends shoppers to the store's checkout, and it unlocks member benefits when someone signs in with their Nyoni account.
3. **The store is the source of truth** for products, prices, stock, customers, orders and memberships. The app reflects what the store tells it.
4. **Nothing calls into the store from a server.** The store sends updates out, and logins and checkouts go through the shopper's own browser. This avoids the SiteGround captcha and gives the app no write access to the store.
5. **We reuse WooCommerce's built-in features** (webhooks and shareable checkout links) and keep the custom plugin small.

## 2. Tiers and what they unlock

| Tier | How you get it | AI try-on previews | Stylist | Other |
| --- | --- | --- | --- | --- |
| **Guest / free account** | Download the app | 3 to start | 20 messages a month | Browse, closet, saved looks |
| **Customer** | Any paid clothing order | **+20 per order**, valid 12 months | 60 a month | Purchases appear in the closet automatically |
| **Nyoni Club** | $99 a year on nyonicouture.com | **25 a month**, plus any customer bonus | Fair use (200 a month) | Real-world perks set by Nyoni (for example free alterations, early access, fitting discount) |

- The numbers can be changed on the server without an app update. They're sized to keep AI cost at about 20% of the $99 (see the cost notes in the README).
- **Nyoni sets the Club perks.** Perks that happen in the real world make the membership stronger, and they're handled by the store, not the app.
- Credits belong to the **member account**, not the phone.

## 3. How it fits together

```
nyonicouture.com (WordPress + WooCommerce + Nyoni App Bridge)
   │  webhooks: products, orders            (built into WooCommerce)
   │  bridge events: catalogue, order history, membership, ping   (plugin)
   ▼
Nyoni app server (Railway)  ◄──────────  Nyoni app (iOS / Android / web)
   ▲                                          │
   │                                          │ opens in the shopper's browser:
   │                                          │   • /nyoni-app-login/      (plugin)
   │                                          │   • /checkout-link/?…      (WooCommerce)
   │                                          │   • Nyoni Club product page
   └──── login token returned to the app ◄────┘
```

### Journey: sign in

1. The shopper taps **Sign in with Nyoni**.
2. The app opens `nyonicouture.com/nyoni-app-login/` in an in-app browser.
3. The store's normal login page appears: existing password, "Lost password" and "Create account".
4. The plugin sends the shopper back to the app with a short-lived signed token.
5. The app server checks the token and signs them in.
6. The plugin sends their past orders and membership status to the server, so the closet fills and benefits unlock.

### Journey: buy clothes

1. The shopper taps **Secure checkout** in the bag.
2. The server re-checks prices and stock, then returns a checkout link.
3. The app opens it; WooCommerce fills the cart and shows the normal checkout.
4. The shopper pays on the store.
5. WooCommerce's order webhook tells the server the order is paid. The app shows "Order confirmed" only then.
6. The customer's +20 previews are credited, and the items appear in their closet as "Ordered".

### Journey: join Nyoni Club

1. The shopper taps **Nyoni Club** in the app. It shows the benefits and, where Apple allows, a link to join on nyonicouture.com (see section 9).
2. They buy the Club product on the store, signed in or creating an account.
3. The plugin sends `membership.updated`.
4. The next time the app opens, or straight away if they're signed in, the member benefits are on.

## 4. Plugin spec (for Nyoni's developer)

**Plugin name:** Nyoni App Bridge. Slug `nyoni-app-bridge`, text domain `nyoni-app-bridge`.

**Requirements**
- WordPress 6.4+, PHP 8.1+, WooCommerce 10.0+.
- HPOS (high-performance order storage) compatible: use `wc_get_order()` and order methods, never direct post-meta queries.
- No custom database tables. Use WordPress options, order meta and user meta.
- Uninstalling removes the plugin's options. It leaves order meta, which is harmless.

### 4.1 Settings page

Location: WooCommerce → Nyoni App. Only visible to users with `manage_woocommerce`.

| Setting | Stored as | Notes |
| --- | --- | --- |
| App server URL | `nyoni_app_server_url` | Default `https://api-production-b54e.up.railway.app`, no trailing slash |
| Bridge secret | `nyoni_app_bridge_secret` | 64 random hex characters, generated on activation. Shown once with a "Regenerate" button. Must match `NYONI_BRIDGE_SECRET` on the server. **Never output it on public pages or in logs.** |
| Allowed return URLs | `nyoni_app_return_prefixes` | One per line. Defaults: `nyonicouture://` and `https://web-production-98e6c5.up.railway.app/` |
| Club product IDs | `nyoni_app_club_product_ids` | Product (or subscription product) IDs that grant Nyoni Club |
| Club length | `nyoni_app_club_days` | Default 365. Only used if WooCommerce Subscriptions isn't installed |

**Buttons**
- **Test connection:** sends a `ping` event and shows the server's reply.
- **Send catalogue to app:** runs the full catalogue sync (4.3) in the background and shows its progress.

**Log:** the last 50 outgoing events, showing time, type, HTTP status and a short error. Never log tokens, secrets, emails or addresses.

### 4.2 Signing outgoing events (bridge protocol)

Every event is sent as `POST {server}/v1/woo/bridge` with a JSON body.

Headers:
```
Content-Type: application/json
X-Nyoni-Timestamp: 1790179200            (Unix seconds)
X-Nyoni-Signature: base64( HMAC-SHA256( secret, timestamp + "." + raw_body ) )
X-Nyoni-Event-Id: 5f0c…                  (UUID; the server ignores repeats)
```

Body envelope:
```json
{ "type": "catalog.batch", "sentAt": "2026-09-24T12:00:00Z", "data": { } }
```

- **Sending:** use `wp_remote_post` with a 15-second timeout.
- **Retries:** on a network error or a 5xx reply, retry through Action Scheduler (bundled with WooCommerce) after 1 minute, 5 minutes, 30 minutes, then 2 hours, and log the attempts. Don't retry a 4xx reply; log it.
- **Replies:** the server returns `200 {"ok":true}` when accepted, and `401` when the signature is wrong or the timestamp is more than 5 minutes old.

**Reference signing code (PHP):**
```php
$body = wp_json_encode( $payload );
$ts   = (string) time();
$sig  = base64_encode( hash_hmac( 'sha256', $ts . '.' . $body, $secret, true ) );
```

### 4.3 Events the plugin sends

**`ping`**
- **When:** the Test connection button.
- **Data:** `{ "site": home_url(), "wc": WC_VERSION, "plugin": "1.0.0" }`.

**`catalog.batch`**
- **When:** the Send catalogue button. It sends every published product in batches of 50, as background actions.
- **Data:** `{ "batch": 1, "of": 4, "products": [ Product, … ] }`, using the Product shape below.
- **Ongoing updates:** not needed from the plugin. WooCommerce's built-in product webhooks cover them (section 4.6).

**`customer.orders`**
- **When:** every successful login hand-off (4.4), after the redirect is prepared. Also send it when a guest order is linked to an account.
- **Data:** `{ "customer": Customer, "orders": [ Order, … ] }` with the customer's last 50 orders in any status. The server removes duplicates.

**`membership.updated`**
- **When:**
  - an order containing a Club product becomes *processing* or *completed*: `active`;
  - it's refunded or cancelled: `cancelled`;
  - if WooCommerce Subscriptions is installed, on every subscription status change (`woocommerce_subscription_status_updated`);
  - a daily cron sends `expired` for memberships that have passed `expires_at`.
- **Data:**
```json
{
  "customer": { "id": 123, "email": "…" },
  "status": "active",               // active | expired | cancelled | on_hold
  "startedAt": "2026-09-24T12:00:00Z",
  "expiresAt": "2027-09-24T12:00:00Z",
  "orderId": 4567,
  "subscriptionId": null
}
```
- **Record keeping:** store `nyoni_club_expires_at` in user meta so the daily check is cheap.

**Shapes**
```jsonc
// Product
{
  "id": 82, "slug": "nathan", "name": "Midnight Navy Three Piece Suit",
  "permalink": "https://nyonicouture.com/product/three-piece-suit/nathan/",
  "status": "publish", "type": "variable",              // simple | variable
  "currency": "USD",
  "price": "895.00", "regularPrice": "895.00", "salePrice": "",
  "categories": ["Suits", "Three Piece Suit"],
  "images": ["https://…/nathan-1.jpg"],
  "stockStatus": "instock", "stockQuantity": null,      // simple products
  "variations": [
    { "id": 91, "sku": "NATHAN-42", "attributes": { "pa_size": "42US / 52EU" },
      "price": "895.00", "stockStatus": "instock", "stockQuantity": 3 }
  ]
}
// Customer
{ "id": 123, "email": "…", "firstName": "…", "lastName": "…", "createdAt": "…" }
// Order
{
  "id": 4567, "number": "4567", "status": "processing", "currency": "USD",
  "total": "895.00", "createdAt": "…", "paidAt": "…",
  "customerId": 123, "billingEmail": "…",
  "appRef": "…or null",                                 // see 4.5
  "items": [ { "productId": 82, "variationId": 91, "name": "…", "quantity": 1,
               "total": "895.00", "attributes": { "pa_size": "42US / 52EU" } } ]
}
```
- **Money:** keep amounts as the strings WooCommerce gives; the server converts them to cents.
- **Leave out** addresses, phone numbers and payment details. The app doesn't need them.

### 4.4 Login hand-off page

**Route:** `GET /nyoni-app-login/`, registered with a rewrite rule. SiteGround's cache must be off for this route (section 6).

**Parameters**

| Parameter | Required | Rule |
| --- | --- | --- |
| `state` | yes | 16–128 characters of `[A-Za-z0-9_-]` |
| `return` | yes | Must start with one of the allowed return URLs |

**Steps**
1. Check the parameters. If invalid, show a plain error page and stop; never redirect.
2. If the visitor isn't logged in, redirect to `wc_get_page_permalink('myaccount')` with `redirect_to` pointing back to this URL (with the same query), so the store's login and registration work as normal.
3. Once logged in, build a **login token** (JWT, HS256, signed with the bridge secret):
```json
{
  "iss": "https://nyonicouture.com",
  "aud": "nyoni-app",
  "sub": "123",
  "email": "…", "given_name": "…", "family_name": "…",
  "state": "<state>",
  "iat": 1790179200, "exp": 1790179320,
  "jti": "<uuid>"
}
```
   Expiry is **2 minutes**.
4. Redirect (302) to `return` plus `token=<jwt>&state=<state>`, added with `?` or `&` as needed.
5. Queue `customer.orders` and the current `membership.updated` for this customer (4.3).

**Security**
- The token proves identity only. It carries no password, cookie or store session.
- The server rejects tokens that are expired, reused (`jti`) or for the wrong `state`.
- Send `Cache-Control: no-store` and `Referrer-Policy: no-referrer` on this page.
- Rate limit: 30 hand-offs per IP per hour, using a transient.

### 4.5 Linking app checkouts to orders

The app sends shoppers to WooCommerce's built-in checkout link and adds one parameter:
```
https://nyonicouture.com/checkout-link/?products=91:1,105:2&nyoni_app=<ref>
```
- **`<ref>`:** an opaque reference created by the app server, at most 200 characters of `[A-Za-z0-9._-]`.
- **What the plugin does:**
  - on any front-end request with `nyoni_app`, save the value in the WooCommerce session (`WC()->session`);
  - when the order is created (`woocommerce_checkout_order_created`, and the Store API equivalent for block checkout), save it as order meta **`nyoni_app_ref`**, with no leading underscore so it appears in the order webhook's `meta_data`;
  - include it as `appRef` in `customer.orders`.

**Fallback, only if checkout links don't accept size (variation) IDs on your store** (open question 1). The plugin also provides `GET /nyoni-checkout/?items=91:1,105:2&nyoni_app=<ref>&sig=<hmac>`:
- `sig` is `base64url( HMAC-SHA256( secret, "items=…&nyoni_app=…" ) )`;
- the plugin checks it, empties the cart, adds each variation with `WC()->cart->add_to_cart( $parent_id, $qty, $variation_id, $attributes )`, saves the ref as above and redirects to the checkout page.

### 4.6 Built-in webhooks (configuration, no code)

Create these in WooCommerce → Settings → Advanced → Webhooks. **Status: Active, API version: WP REST API Integration v3.**

| Name | Topic |
| --- | --- |
| App: product created | Product created |
| App: product updated | Product updated |
| App: product deleted | Product deleted |
| App: order created | Order created |
| App: order updated | Order updated |

- **Delivery URL** for all of them: `https://api-production-b54e.up.railway.app/v1/woo/webhooks`.
- **Secret:** the same value for all of them. The server stores it as `WOO_WEBHOOK_SECRET`.
- **If product webhooks don't include variations** on your setup, the plugin should also send a single-product `catalog.batch` on `woocommerce_update_product` and `woocommerce_update_product_variation` (debounced to one send per product per minute).

### 4.7 Acceptance checklist for the plugin

- [ ] Activation generates a secret; Test connection returns "Connected" against the staging server.
- [ ] Send catalogue delivers every published product and variation; the server count matches the store.
- [ ] Changing a size's stock or a price reaches the app within a minute.
- [ ] `/nyoni-app-login/` with a bad `return` shows an error and does not redirect.
- [ ] Logged-out visitors get the normal My Account login and land back in the app after it; new-account registration works too.
- [ ] A token older than 2 minutes, or used twice, is rejected by the server.
- [ ] A checkout link with `nyoni_app` produces an order whose webhook includes `nyoni_app_ref`.
- [ ] Buying a Club product sends `membership.updated` `active`; refunding it sends `cancelled`.
- [ ] Events retry after the server is briefly unavailable.
- [ ] No secret, token, email or address appears in the plugin log or PHP error log.
- [ ] Works with the classic and the block checkout, and with HPOS on.

## 5. App and server side (built in this repo)

**Server (Railway)**
- `POST /v1/woo/webhooks`: checks `X-WC-Webhook-Signature`, and updates products, variations and orders.
- `POST /v1/woo/bridge`: checks `X-Nyoni-Signature` and timestamp, ignores repeated event IDs, and handles the four event types.
- `POST /v1/auth/nyoni`: checks the login token (signature, `aud`, `exp`, `state`, `jti`), creates or links the member and returns an app session.
- `POST /v1/checkout`: re-checks the bag against the live catalogue and returns the checkout link with a new `nyoni_app` ref.
- **Catalogue:** served from the store's data instead of the CSV export. AI cut-out photos stay matched by product slug.
- **Accounts:** member accounts, sessions, closet, looks and outfits move to the server, so they survive reinstalls and work across devices.
- **Credits:** tier rules (section 2), with credit grants on paid orders and Club status, and refunds on refunded orders.

**App**
- **Sign-in:** "Sign in with Nyoni" replaces the demo sign-in link, and the guest-to-account move stays.
- **Checkout:** a real checkout through the in-app browser replaces the demo checkout form. The order screen follows the store's order status.
- **Closet:** filled from purchases. New members start with an empty closet instead of the sample pieces.
- **Nyoni Club screen:** shows benefits and status, and a link to join only where Apple allows it (section 9).
- **Credits:** remaining credits shown on the try-on screens.

## 6. What we need from Nyoni

**Information**
1. Your **WooCommerce version** (Plugins page, or WooCommerce → Status). It must be 10.0 or later.
2. **Payment gateways** in use, and whether **Apple Pay / Google Pay** are on. Recommended: they make in-app-browser checkout much smoother.
3. Whether **WooCommerce Subscriptions** is installed. If it is, Club auto-renews; if not, the Club is a one-year product with a renewal email.
4. **Nyoni Club details:** price ($99 a year), perks, and the product ID once created.
5. Whether **classic or block checkout** is used.

**Access and setup**

6. **A staging site:** SiteGround Site Tools → WordPress → Staging, with its URL.
7. **A test customer account** on staging, and test mode on the payment gateway there.
8. **SiteGround caching:** exclude `/nyoni-app-login/*`, `/checkout-link/*` and `/nyoni-checkout/*` in SG Optimizer → Caching → Exclude URLs.
9. **Webhooks** created as in section 4.6, first on staging, then live.

**Secrets** go straight into Railway (api service → Variables). Never paste them into chat or email.

10. `NYONI_BRIDGE_SECRET`: copied from the plugin's settings page.
11. `WOO_WEBHOOK_SECRET`: the secret you type into the webhooks.

**Content**

12. An updated **privacy policy** covering the app: try-on photos, 24-hour deletion, AI processing, and account linking.

## 7. Testing and rollout

1. **Build in parallel.** Your developer builds the plugin to section 4. I build section 5 against a mock of the plugin's events, so both sides can be tested before they meet.
2. **Connect on staging.** Run the checklist in 4.7 and the three journeys in section 3, with test payments.
3. **Private beta.** Install on the live store with the webhooks switched on, and invite testers via TestFlight and Google Play internal testing.
4. **Retire the CSV export** once the live catalogue has run cleanly for a week.

## 8. Why this approach

**The SiteGround bot protection.** It answered our server's requests to nyonicouture.com with a captcha. With this design:
- WooCommerce webhooks and the bridge events are sent by the store, so they go out and never hit the protection;
- login and checkout run in the shopper's browser, which passes the protection like any visitor.

**Least access.** A WooCommerce REST API key with read/write can read every customer and change every order. Here the app can only receive signed updates and send shoppers to pages they could reach anyway.

**Live data.** Webhooks arrive when prices or stock change, with no polling.

**Existing passwords.** The WooCommerce API can't check a password. The hand-off page uses the store's real login, so customers keep one account and no email-sending service is needed.

**Little custom code.** WooCommerce maintains the webhooks and checkout links. The plugin adds only sign-in, first sync, membership status and order linking.

### Options considered

| Option | Why not |
| --- | --- |
| WooCommerce REST API key | Needs a SiteGround exception; the key reaches the whole store; no login with store passwords |
| Off-the-shelf OAuth plugin (for example miniOrange WP OAuth Server) | Its token step is a server-to-store call, which is blocked; large, with premium tiers |
| Mobile-app plugins (for example MStore API) | Also served from `/wp-json/`, so blocked; built for their own app builders |
| Selling the membership inside the app | Apple takes 15–30% (section 9) |

## 9. iOS App Store rules

**Clothes: must use your own checkout; Apple takes nothing.**
- Guideline 3.1.3(e): apps selling physical goods must use payment methods other than in-app purchase (cards, Apple Pay, the store's checkout).
- Gucci, Farfetch, Net-a-Porter, SSENSE and Nike all do this: free features in the app, and purchases through their own checkout.

**Nyoni Club counts as digital, because it unlocks AI features in the app.**
- Sold **inside** the app, it would have to be an Apple in-app purchase, with Apple taking 15–30%.
- Sold **only on nyonicouture.com, with the app as a sign-in**, it's allowed ("multiplatform services", Guideline 3.1.3(b)), and Apple takes nothing. **This is our plan.**
- **Linking to the join page from the app:** in the US, a court ruling in 2025 lets apps link to web purchases. In December 2025 an appeals court allowed Apple to charge some commission on linked purchases, with the amount still being settled. Rules differ outside the US.
- **Default:** the app describes Club benefits and says members sign in with their Nyoni account. A "Join on nyonicouture.com" button appears only in regions where Apple's rules at submission allow it, controlled by a server setting so it can change without an app update.
- **Real-world perks** (alterations, discounts, early access) strengthen the Club. They're delivered by the store, not the app.

**Sign in with Apple is not required.** Guideline 4.8 exempts apps that only use the company's own account system, and "Sign in with Nyoni" is exactly that. If Google or Facebook login is ever added, Sign in with Apple must be offered too.

**Google Play** has similar rules for physical goods (the store's own checkout is fine) and for digital subscriptions. We'll check Google's current policy for the Club link before the Android release.

## 10. Open questions

1. Do WooCommerce checkout links accept **variation IDs** on your store? To test on staging. If not, the plugin's `/nyoni-checkout/` fallback (4.5) is used.
2. Should Club auto-renew (needs WooCommerce Subscriptions) or be a one-year product?
3. What are the Club perks?
4. Beta testers: invite list and timing.

## Sources

- [WooCommerce shareable checkout URLs (developer docs)](https://developer.woocommerce.com/docs/best-practices/urls-and-routing/checkout-urls/)
- [Creating sharable checkout URLs (WooCommerce)](https://woocommerce.com/document/creating-sharable-checkout-urls-in-woocommerce/)
- [WooCommerce webhooks (developer docs)](https://developer.woocommerce.com/docs/apis/rest-api/v2/webhooks/)
- [WP OAuth Server plugin (WordPress.org)](https://wordpress.org/plugins/miniorange-oauth-20-server/)
- [App Review Guidelines (Apple)](https://developer.apple.com/app-store/review/guidelines/)
- [Epic v. Apple anti-steering ruling explained (RevenueCat)](https://www.revenuecat.com/blog/growth/apple-anti-steering-ruling-monetization-strategy)
- [Apple defeats ban on commission for linked-out purchases (9to5Mac, December 2025)](https://9to5mac.com/2025/12/11/apple-defeats-ban-on-charging-commission-on-linked-out-purchases-from-ios-apps/)
