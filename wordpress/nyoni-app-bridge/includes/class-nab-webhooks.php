<?php
/**
 * The five WooCommerce webhooks the app server needs (spec 4.6), created with one click.
 *
 * They are ordinary WooCommerce webhooks (WooCommerce -> Settings -> Advanced -> Webhooks),
 * signed with the bridge secret, so the server needs no second secret. Regenerating the
 * bridge secret updates them too.
 *
 * @package NyoniAppBridge
 */

defined( 'ABSPATH' ) || exit;

class NAB_Webhooks {

	/** Topic => name. */
	const TOPICS = array(
		'product.created' => 'App: product created',
		'product.updated' => 'App: product updated',
		'product.deleted' => 'App: product deleted',
		'order.created'   => 'App: order created',
		'order.updated'   => 'App: order updated',
	);

	public static function delivery_url(): string {
		return nab_server_url() . '/v1/woo/webhooks';
	}

	/**
	 * The app's webhooks by topic: any webhook pointing at an app server's /v1/woo/webhooks,
	 * so changing the server URL updates them instead of leaving old ones behind.
	 *
	 * @return array<string, WC_Webhook>
	 */
	private static function existing(): array {
		$found = array();
		foreach ( WC_Data_Store::load( 'webhook' )->get_webhooks_ids() as $id ) {
			$hook = wc_get_webhook( $id );
			if ( ! $hook || ! isset( self::TOPICS[ $hook->get_topic() ] ) ) {
				continue;
			}
			if ( ! str_ends_with( untrailingslashit( (string) $hook->get_delivery_url() ), '/v1/woo/webhooks' ) ) {
				continue;
			}
			$found[ $hook->get_topic() ] = $hook;
		}
		return $found;
	}

	/**
	 * Creates the missing webhooks and brings existing ones up to date (address, secret, active).
	 *
	 * @return array{created:int, updated:int}
	 */
	public static function ensure(): array {
		$secret = nab_secret();
		$url    = self::delivery_url();
		$have   = self::existing();
		$result = array( 'created' => 0, 'updated' => 0 );
		foreach ( self::TOPICS as $topic => $name ) {
			$hook = $have[ $topic ] ?? new WC_Webhook();
			$new  = ! $hook->get_id();
			$hook->set_name( $name );
			$hook->set_topic( $topic );
			$hook->set_delivery_url( $url );
			$hook->set_secret( $secret );
			$hook->set_status( 'active' );
			$hook->set_api_version( 'wp_api_v3' );
			if ( $new ) {
				$hook->set_user_id( get_current_user_id() );
			}
			$hook->save();
			$result[ $new ? 'created' : 'updated' ]++;
		}
		return $result;
	}

	/** After a new bridge secret: re-sign the app's webhooks that already exist. */
	public static function resign(): void {
		$secret = nab_secret();
		foreach ( self::existing() as $hook ) {
			$hook->set_secret( $secret );
			$hook->save();
		}
	}

	/** How many of the five are active and pointing at the current server. */
	public static function active_count(): int {
		$url = self::delivery_url();
		return count( array_filter( self::existing(), static fn( $hook ) => 'active' === $hook->get_status() && $url === $hook->get_delivery_url() ) );
	}
}
