# Nyoni App Bridge 1.0.1

Installable WordPress plugin implementing section 4 of the supplied Nyoni app integration brief. WooCommerce supplies product, inventory, order and Club data; the plugin sends signed events to the app server and hands login and checkout to the shopper’s browser.

## Included

- WooCommerce → Nyoni App settings, HTTPS server validation, one-time secret display/regeneration, connection test, catalog progress and a rolling log of 50 events without personal data.
- Published catalog export in background batches of 50. Product/variation/stock changes coalesce into a background parent-product export after 30 seconds. Existing WooCommerce webhooks remain the primary ongoing feed.
- Product variation attributes and stock availability, plus an optional `image` URL on each variation so the app can reuse the store’s color/image assignments. Money values remain strings.
- Signed events: `ping`, `catalog.batch`, `customer.orders`, `membership.updated`. Network/5xx failures retry after 1 minute, 5 minutes, 30 minutes and 2 hours, preserving the event ID and body. Redirects and 4xx are not retried.
- `/nyoni-app-login/`: allowlisted return origins/paths, validated state, ordinary store login/registration, HS256 identity token with a 120-second lifetime, per-IP rate limit, no-store and no-referrer headers. Order and membership synchronization runs in the background.
- `nyoni_app` checkout attribution stored as public order meta `nyoni_app_ref` using WooCommerce CRUD, with classic and Store API checkout hooks.
- HMAC-signed `/nyoni-checkout/` fallback, including variation attributes and stock checks. Invalid products are rejected before clearing the existing cart; failed cart additions restore its items and coupons.
- Club status from configured products and subscription status changes. Each fixed-duration purchase expires the configured number of days after payment; a refund of an older order does not revoke a newer valid purchase. Pending subscription cancellation preserves paid access through its term. Unrelated subscriptions never grant Club access.
- No custom database tables. Deactivation cancels pending plugin jobs. Uninstall removes plugin options and pending jobs, preserving existing order references and membership source records.

## Requirements

WordPress 6.4+, PHP 8.1+, WooCommerce 10.0+ and its bundled Action Scheduler. HPOS compatibility is declared; order reads/writes use WooCommerce CRUD. WooCommerce Subscriptions is optional.

## Install on staging first

1. Upload `nyoni-app-bridge-1.0.1.zip` through Plugins → Add New → Upload Plugin and activate.
2. Open WooCommerce → Nyoni App. Set the **staging** app-server HTTPS URL before testing. The initial default is the Railway URL from the brief.
3. Copy the secret displayed on your first settings visit directly into the companion server’s `NYONI_BRIDGE_SECRET` environment variable. The 64-character hex string is used as the HMAC key as text, not decoded into bytes. A later visit hides it; regenerate if the copy was lost and update Railway to match.
4. Enter permitted return URLs and the actual Club **product/variation IDs**. An empty Club ID list grants no new memberships. Fixed purchases use the configured day count; subscription products use subscription dates instead.
5. Exclude `/nyoni-app-login/*`, `/checkout-link/*`, `/nyoni-checkout/*` and WooCommerce account/checkout routes from SiteGround/full-page caching. Confirm My Account allows registration if the app will offer sign-up.
6. Click **Test connection**, then **Send catalogue to app**. Refresh the settings screen for accepted/pending/retrying/failed batch counts. Failed terminal batches can be retried with another full export after the pending count reaches zero. WooCommerce → Status → Scheduled Actions exposes the `nyoni-app-bridge` group.
7. Create the five built-in WooCommerce webhooks: `product.created`, `product.updated`, `product.deleted`, `order.created`, `order.updated`. Use REST API v3, active status and `{app_server}/v1/woo/webhooks`; configure their separate secret on Railway as `WOO_WEBHOOK_SECRET`. The plugin does not create these automatically.
8. Complete the staging checks below before activating on production.

If a route returns 404, save Settings → Permalinks once. Do not put secrets, real customer exports or login redirect URLs into support logs.

## Companion server contract

The Railway server and app are separate deliverables (section 5 of the brief). They must implement:

- `POST /v1/woo/bridge`: verify HMAC over `timestamp + "." + rawBody` using `X-Nyoni-Timestamp`, base64 `X-Nyoni-Signature` and `X-Nyoni-Event-Id`; enforce timestamp tolerance, deduplicate event IDs and upsert catalog/orders/membership data.
- `POST /v1/woo/webhooks`: verify the WooCommerce webhook signature using `WOO_WEBHOOK_SECRET`. These built-in webhook payloads differ from the plugin’s compact event shapes.
- `/v1/auth/nyoni`: verify the JWT signature, issuer, audience, expiration and app state; reject reused `jti` values and create the app session. The plugin issues tokens; server-side single-use enforcement is required.
- `/v1/checkout`: generate a checkout reference and a normal Woo checkout link or the signed fallback below.

The plugin does not implement app sessions, virtual try-on credits, cloud closet storage or mobile-app purchase flows.

### Signed fallback checkout

Send a browser to:

```
/nyoni-checkout/?items=19271:1,105:2&nyoni_app=APP_REFERENCE&sig=SIGNATURE
```

Use product/variation IDs and positive quantities (maximum 50 lines, quantity 999 per line). The exact unescaped signing input is:

```
items=19271:1,105:2&nyoni_app=APP_REFERENCE
```

`SIGNATURE = base64url(HMAC-SHA256(NYONI_BRIDGE_SECRET, input))`, without padding. Encode query values once when assembling the browser URL. References allow 1–200 ASCII letters, digits, dot, underscore and hyphen. These links have no expiry in the supplied protocol; they authorize cart preparation only. Pricing, stock, payment and order creation remain with WooCommerce.

## Validation performed for this build

- 78 isolated PHP contract checks: HMAC/JWT, retry identity/backoff, URL validation, stock/cart rollback, classic/Store API callback behavior, reference persistence, catalog batching/progress and Club history/refund/subscription behavior.
- 14 HTTP checks against a local fixture server: login/guest redirects, JWT signature and lifetime, invalid state/return/rate limit, privacy headers and signed variation checkout.
- 8 settings checks: capability enforcement, HTTPS sanitization and one-time secret display.
- 11 read-only compatibility checks against the actual store on WordPress 7.1.2, WooCommerce 11.1.2, PHP 8.2.34. All 21 Field Jacket variations serialize with images; Woo CRUD, cart rollback and scheduler APIs exist.
- PHP lint on the store’s PHP 8.2 runtime. The plugin was loaded from a private build directory for read-only checks; it was not installed or activated and no bridge requests were sent.

The fixture tests do not replace staging checkout or Railway integration tests.

## Required staging acceptance

- Ping with matching staging secrets; export counts match published products and a product price/stock update reaches the app.
- Login and registration through the actual theme on desktop and mobile. Correct state reaches the app; expired and replayed tokens are rejected by Railway.
- A real sandbox classic checkout and a Checkout Block purchase preserve `nyoni_app_ref` with HPOS enabled. Test both the store’s built-in shareable checkout link and the signed variation fallback.
- Club purchase, second purchase, refund, cancellation, subscription renewal, on-hold, pending cancellation and scheduled expiry produce correct entitlements.
- Simulate server downtime and 401/500 responses; verify retry timing, idempotence, progress and logs. Ensure background jobs actually run through SiteGround cron/Action Scheduler.
- Confirm cache exclusions and verify the app receiver accepts the additional variation `image` field.

Build sources and executable tests are in the workspace; test fixtures are excluded from the installable ZIP.
