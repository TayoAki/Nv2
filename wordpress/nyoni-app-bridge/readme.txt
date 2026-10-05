=== Nyoni App Bridge ===
Contributors: nyonicouture
Requires at least: 6.4
Requires PHP: 8.1
Stable tag: 1.0.2
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Signed catalog, order and membership updates, store login handoff and app checkout attribution for Nyoni Couture.

== Description ==
Requires WooCommerce 10.0+ and its bundled Action Scheduler. See README.md for staging installation, server contracts and acceptance checks.

== Installation ==
Upload the plugin ZIP, activate on staging, then open WooCommerce > Nyoni App. Copy the one-time secret directly into the companion server and configure its matching HTTPS URL. Complete staging checks before production activation.

== Changelog ==
= 1.0.2 =
Added "Create app webhooks" on WooCommerce > Nyoni App: creates or updates the five product and order webhooks, signed with the bridge secret. Regenerating the secret re-signs them.

= 1.0.1 =
Hardened login, checkout, delivery, settings and membership handling; added variation images, catalog progress and automated contract tests.
