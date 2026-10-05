<?php
/**
 * Uninstall: remove the plugin's options and scheduled work.
 * Order meta (nyoni_app_ref) and user meta (nyoni_club_expires_at) are left in place — harmless.
 *
 * @package NyoniAppBridge
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

$nab_options = array(
	'nyoni_app_server_url',
	'nyoni_app_bridge_secret',
	'nyoni_app_return_prefixes',
	'nyoni_app_club_product_ids',
	'nyoni_app_club_days',
	'nyoni_app_log',
	'nyoni_app_secret_unseen',
);
foreach ( $nab_options as $nab_option ) {
	delete_option( $nab_option );
}

// Load the group-cleanup helper without booting routes or event emitters.
require_once __DIR__ . '/includes/helpers.php';
nab_cancel_jobs();
$nab_run = get_option( 'nyoni_app_catalog_progress', array() );
for ( $nab_i = 1; $nab_i <= ( $nab_run['batches'] ?? 0 ); $nab_i++ ) {
 delete_option( 'nyoni_app_batch_' . $nab_run['id'] . '_' . $nab_i );
}
delete_option( 'nyoni_app_catalog_progress' );
// Clean only this plugin's transient namespace; source order/customer meta is preserved.
global $wpdb;
$nab_like = $wpdb->esc_like( '_transient_nab_' ) . '%';
$nab_timeout_like = $wpdb->esc_like( '_transient_timeout_nab_' ) . '%';
$wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s", $nab_like, $nab_timeout_like ) );
