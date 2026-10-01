<?php
/**
 * Plugin Name:       Nyoni App Bridge
 * Plugin URI:        https://nyonicouture.com/
 * Description:       Connects the Nyoni Couture app to this WooCommerce store: signed bridge events (catalogue, orders, membership), a store-login hand-off for "Sign in with Nyoni", and app-checkout order linking. The store only sends data out; nothing calls in.
 * Version:           1.0.1
 * Requires at least: 6.4
 * Requires PHP:      8.1
 * Author:            Nyoni Couture
 * Text Domain:       nyoni-app-bridge
 * WC requires at least: 10.0
 *
 * @package NyoniAppBridge
 */

defined( 'ABSPATH' ) || exit;

define( 'NAB_VERSION', '1.0.1' );
define( 'NAB_FILE', __FILE__ );
define( 'NAB_DIR', plugin_dir_path( __FILE__ ) );
define( 'NAB_URL', plugin_dir_url( __FILE__ ) );

/* Option keys (see spec 4.1). */
define( 'NAB_OPT_SERVER',    'nyoni_app_server_url' );
define( 'NAB_OPT_SECRET',    'nyoni_app_bridge_secret' );
define( 'NAB_OPT_RETURNS',   'nyoni_app_return_prefixes' );
define( 'NAB_OPT_CLUB_IDS',  'nyoni_app_club_product_ids' );
define( 'NAB_OPT_CLUB_DAYS', 'nyoni_app_club_days' );
define( 'NAB_OPT_LOG',       'nyoni_app_log' );

define( 'NAB_DEFAULT_SERVER',  'https://api-production-b54e.up.railway.app' );
define( 'NAB_DEFAULT_RETURNS', "nyonicouture://\nhttps://web-production-98e6c5.up.railway.app/" );

require_once NAB_DIR . 'includes/helpers.php';
require_once NAB_DIR . 'includes/class-nab-jwt.php';
require_once NAB_DIR . 'includes/class-nab-bridge.php';
require_once NAB_DIR . 'includes/class-nab-events.php';
require_once NAB_DIR . 'includes/class-nab-catalog.php';
require_once NAB_DIR . 'includes/class-nab-login.php';
require_once NAB_DIR . 'includes/class-nab-checkout.php';
require_once NAB_DIR . 'includes/class-nab-membership.php';
require_once NAB_DIR . 'includes/class-nab-settings.php';

/**
 * HPOS (custom order tables) compatibility. Declared before WooCommerce init.
 */
add_action(
	'before_woocommerce_init',
	static function () {
		if ( class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', NAB_FILE, true );
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'cart_checkout_blocks', NAB_FILE, true );
		}
	}
);

/**
 * Boot the plugin once WooCommerce is present.
 */
add_action(
	'plugins_loaded',
	static function () {
		if ( ! class_exists( 'WooCommerce' ) || ! defined( 'WC_VERSION' ) || version_compare( WC_VERSION, '10.0', '<' ) ) {
			add_action(
				'admin_notices',
				static function () {
					echo '<div class="notice notice-error"><p>' .
						esc_html__( 'Nyoni App Bridge requires WooCommerce 10.0 or later.', 'nyoni-app-bridge' ) .
						'</p></div>';
				}
			);
			return;
		}

		NAB_Events::init();
		NAB_Login::init();      // /nyoni-app-login/ rewrite + hand-off.
		NAB_Checkout::init();   // nyoni_app ref capture + /nyoni-checkout/ fallback.
		NAB_Catalog::init();    // catalogue batches + single-product updates.
		NAB_Membership::init(); // Club status + daily expiry cron.
		NAB_Bridge::init();     // retry action handler.

		if ( is_admin() ) {
			NAB_Settings::init(); // WooCommerce -> Nyoni App.
		}
	}
);

/**
 * Activation: generate a secret, seed defaults, register routes, flush rewrites,
 * and schedule the daily membership-expiry check.
 */
register_activation_hook(
	NAB_FILE,
	static function () {
		if ( ! get_option( NAB_OPT_SECRET ) ) {
			update_option( NAB_OPT_SECRET, bin2hex( random_bytes( 32 ) ), false ); // 64 hex chars.
			update_option( 'nyoni_app_secret_unseen', 'first', false );
		}
		if ( false === get_option( NAB_OPT_SERVER ) ) {
			update_option( NAB_OPT_SERVER, NAB_DEFAULT_SERVER, false );
		}
		if ( false === get_option( NAB_OPT_RETURNS ) ) {
			update_option( NAB_OPT_RETURNS, NAB_DEFAULT_RETURNS, false );
		}
		if ( false === get_option( NAB_OPT_CLUB_DAYS ) ) {
			update_option( NAB_OPT_CLUB_DAYS, 365, false );
		}

		NAB_Login::add_rewrite_rules();
		NAB_Checkout::add_rewrite_rules();
		flush_rewrite_rules();

		if ( function_exists( 'as_has_scheduled_action' ) && ! as_has_scheduled_action( 'nab_daily_membership_check' ) ) {
			as_schedule_recurring_action( time() + HOUR_IN_SECONDS, DAY_IN_SECONDS, 'nab_daily_membership_check', array(), 'nyoni-app-bridge' );
		}
	}
);

/**
 * Deactivation: drop scheduled work and flush rewrites. Options are kept
 * (removed only on uninstall).
 */
register_deactivation_hook(
	NAB_FILE,
	static function () {
		nab_cancel_jobs();
		$run = get_option( 'nyoni_app_catalog_progress', array() );
		for ( $i = 1; $i <= ( $run['batches'] ?? 0 ); $i++ ) { delete_option( 'nyoni_app_batch_' . $run['id'] . '_' . $i ); }
		delete_option( 'nyoni_app_catalog_progress' );
		global $wp_rewrite;
		unset( $wp_rewrite->extra_rules_top['^nyoni-app-login/?$'], $wp_rewrite->extra_rules_top['^nyoni-checkout/?$'] );
		flush_rewrite_rules();
	}
);
