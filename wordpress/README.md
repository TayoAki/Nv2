# Nyoni App Bridge (WordPress plugin)

The plugin that connects nyonicouture.com to the app server. It was built by Nyoni's developer to section 4 of [the plugin plan](../docs/woocommerce-plugin-plan.md).

| | |
| --- | --- |
| Version | 1.0.1 |
| Install file | `nyoni-app-bridge-1.0.1.zip`, unchanged from the developer's handoff. SHA-256 `30e6007557abdb1a0dc6ae901f74300b0d375acb68859d6b2def5e73491aa76f` |
| Source | `nyoni-app-bridge/`, unpacked from the same zip. Its README has the full install guide. |
| Status | Not installed on the store yet. |

## Install

Upload the zip in WordPress (Plugins → Add New → Upload Plugin) **on staging first**, then follow plugin plan section 11, "What IT does next".

The two secrets go only into Railway (api service → Variables):
- `NYONI_BRIDGE_SECRET`: shown once on WooCommerce → Nyoni App;
- `WOO_WEBHOOK_SECRET`: the secret typed into the five webhooks.

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
