# Nyoni App Bridge (WordPress plugin)

The plugin that connects nyonicouture.com to the app server. It was built by Nyoni's developer to section 4 of [the plugin plan](../docs/woocommerce-plugin-plan.md).

| | |
| --- | --- |
| Version | 1.0.2 |
| Install file | `nyoni-app-bridge-1.0.2.zip`. SHA-256 `26c28753350526e1ea706a1d10a61ee4d74d14224daa059da48ec027c7edb2b1` |
| Source | `nyoni-app-bridge/`. Its README has the full install guide. |
| Status | 1.0.1 is installed on staging (staging2.nyonicouture.com) and connected. 1.0.2 is ready to upload there. |

**1.0.2** adds one thing to the developer's 1.0.1 (SHA-256 `30e6007557abdb1a0dc6ae901f74300b0d375acb68859d6b2def5e73491aa76f`): a **Create app webhooks** button on WooCommerce → Nyoni App.
- It creates or updates the five product and order webhooks from plan 4.6, signed with the bridge secret, so `WOO_WEBHOOK_SECRET` is optional.
- Regenerating the secret re-signs them.
- Other webhooks on the store are left alone.

The new code is in `includes/class-nab-webhooks.php`, plus the button in `class-nab-settings.php`.

## Install

Upload the zip in WordPress (Plugins → Add New → Upload Plugin) **on staging first**, then follow plugin plan section 11, "What IT does next". To update an installed copy, upload the new zip and choose **Replace current with uploaded**. Settings and the secret are kept.

The two secrets go only into Railway (api service → Variables):
- `NYONI_BRIDGE_SECRET`: shown once on WooCommerce → Nyoni App;
- `WOO_WEBHOOK_SECRET`: only needed for webhooks made by hand. The button signs them with the bridge secret.

Never commit them or paste them into chat.

## Checked against the app server

`test/plugin-contract.php` runs the plugin's own PHP (event signing, the login token, checkout-link verification) against a local app server, with stand-ins for WordPress functions only. It covers:
- Test connection;
- a catalogue batch, including Club `variable-subscription` products and variation images;
- customer orders and Club status;
- sign-in with a plugin-made token, and refusing the same token a second time;
- the checkout link, and the signed fallback passing the plugin's `verify_link`.

All checks passed on 1 October 2026. To re-run, start the server with **test** secrets and `STORE_URL=http://localhost:8300`, then run:

```bash
NYONI_BRIDGE_SECRET=<the same test secret> php wordpress/test/plugin-contract.php
```

These checks don't replace the staging tests in the plugin's README: real login through the theme, sandbox purchases, Club changes, and retries while the server is down.
