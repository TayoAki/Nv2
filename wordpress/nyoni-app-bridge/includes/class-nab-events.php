<?php
/**
 * Builds the Product / Customer / Order shapes and emits ping and customer.orders (spec 4.3).
 * Money stays as the strings WooCommerce gives; the server converts to cents.
 * Addresses, phone numbers and payment details are deliberately left out.
 *
 * @package NyoniAppBridge
 */

defined( 'ABSPATH' ) || exit;

class NAB_Events {
	public static function init(): void {
		add_action( 'wp_login', static function( $login, $user ) { self::queue_customer( (int) $user->ID ); }, 10, 2 );
		add_action( 'nab_customer_sync', array( __CLASS__, 'sync_customer' ) );
		add_action( 'woocommerce_after_order_object_save', array( __CLASS__, 'order_saved' ), 10, 1 );
	}
	public static function queue_customer( int $id ): void {
		if ( $id && ! as_has_scheduled_action( 'nab_customer_sync', array( $id ), 'nyoni-app-bridge' ) ) { as_enqueue_async_action( 'nab_customer_sync', array( $id ), 'nyoni-app-bridge' ); }
	}
	public static function sync_customer( int $id ): void {
		if ( ! get_userdata( $id ) ) { return; }
		self::send_customer_orders( $id );
		NAB_Membership::send_current_status( $id );
	}
	public static function order_saved( $order ): void {
		if ( $order instanceof WC_Order && 'shop_order' === $order->get_type() ) { self::queue_customer( (int) $order->get_customer_id() ); }
	}

	/** ping — { site, wc, plugin }. */
	public static function ping(): bool {
		return NAB_Bridge::send(
			'ping',
			array(
				'site'   => home_url(),
				'wc'     => defined( 'WC_VERSION' ) ? WC_VERSION : '',
				'plugin' => NAB_VERSION,
			)
		);
	}

	/** customer.orders — the customer and their last 50 orders, any status. */
	public static function send_customer_orders( int $user_id ): bool {
		if ( ! $user_id ) {
			return false;
		}
		$orders = wc_get_orders(
			array(
				'customer_id' => $user_id,
				'limit'       => 50,
				'orderby'     => 'date',
				'order'       => 'DESC',
				'status'      => array_keys( wc_get_order_statuses() ),
			)
		);
		$out = array();
		foreach ( $orders as $order ) {
			$out[] = self::build_order( $order );
		}
		return NAB_Bridge::send(
			'customer.orders',
			array(
				'customer' => self::build_customer( $user_id ),
				'orders'   => $out,
			)
		);
	}

	/** Product shape. */
	public static function build_product( WC_Product $p ): array {
		$type = $p->get_type();
		$cats = wp_get_post_terms( $p->get_id(), 'product_cat', array( 'fields' => 'names' ) );
		$cats = is_wp_error( $cats ) ? array() : array_values( $cats );

		$images  = array();
		$main_id = $p->get_image_id();
		if ( $main_id ) {
			$u = wp_get_attachment_image_url( (int) $main_id, 'full' );
			if ( $u ) {
				$images[] = $u;
			}
		}
		foreach ( $p->get_gallery_image_ids() as $gid ) {
			$u = wp_get_attachment_image_url( (int) $gid, 'full' );
			if ( $u ) {
				$images[] = $u;
			}
		}

		$out = array(
			'id'            => $p->get_id(),
			'slug'          => $p->get_slug(),
			'name'          => $p->get_name(),
			'permalink'     => get_permalink( $p->get_id() ),
			'status'        => $p->get_status(),
			'type'          => $type,
			'currency'      => get_woocommerce_currency(),
			'price'         => (string) $p->get_price(),
			'regularPrice'  => (string) $p->get_regular_price(),
			'salePrice'     => (string) $p->get_sale_price(),
			'categories'    => $cats,
			'images'        => $images,
			'stockStatus'   => $p->get_stock_status(),
			'stockQuantity' => $p->managing_stock() ? $p->get_stock_quantity() : null,
		);

		if ( $p->is_type( array( 'variable', 'variable-subscription' ) ) ) {
			$variations = array();
			foreach ( $p->get_children() as $vid ) {
				$v = wc_get_product( $vid );
				if ( ! $v || ! $v->exists() || 'publish' !== $v->get_status() ) {
					continue;
				}
				$variations[] = array(
					'id'            => $v->get_id(),
					'sku'           => $v->get_sku(),
					'image'         => wp_get_attachment_image_url( $v->get_image_id(), 'full' ) ?: null,
					'attributes'    => self::variation_attributes( $v ),
					'price'         => (string) $v->get_price(),
					'stockStatus'   => $v->get_stock_status(),
					'stockQuantity' => $v->managing_stock() ? $v->get_stock_quantity() : null,
				);
			}
			$out['variations'] = $variations;
		}

		return $out;
	}

	/** Customer shape. */
	public static function build_customer( int $user_id ): array {
		$user     = get_userdata( $user_id );
		$customer = new WC_Customer( $user_id );
		return array(
			'id'        => $user_id,
			'email'     => $user ? $user->user_email : $customer->get_email(),
			'firstName' => $customer->get_first_name(),
			'lastName'  => $customer->get_last_name(),
			'createdAt' => $user ? nab_iso8601( strtotime( $user->user_registered . ' UTC' ) ) : null,
		);
	}

	/** Order shape. */
	public static function build_order( WC_Order $o ): array {
		$items = array();
		foreach ( $o->get_items() as $item ) {
			$product = $item->get_product();
			$attrs   = ( $product && $product->is_type( 'variation' ) ) ? self::variation_attributes( $product ) : array();
			$items[] = array(
				'productId'   => $item->get_product_id(),
				'variationId' => $item->get_variation_id() ?: null,
				'name'        => $item->get_name(),
				'quantity'    => $item->get_quantity(),
				'total'       => (string) $item->get_total(),
				'attributes'  => $attrs,
			);
		}

		$created = $o->get_date_created();
		$paid    = $o->get_date_paid();

		return array(
			'id'           => $o->get_id(),
			'number'       => $o->get_order_number(),
			'status'       => $o->get_status(),
			'currency'     => $o->get_currency(),
			'total'        => (string) $o->get_total(),
			'createdAt'    => $created ? nab_iso8601( $created->getTimestamp() ) : null,
			'paidAt'       => $paid ? nab_iso8601( $paid->getTimestamp() ) : null,
			'customerId'   => $o->get_customer_id() ?: null,
			'billingEmail' => $o->get_billing_email(),
			'appRef'       => $o->get_meta( 'nyoni_app_ref' ) ?: null,
			'items'        => $items,
		);
	}

	/**
	 * Resolve a variation's attributes to human labels, keyed without the
	 * "attribute_" prefix, e.g. { "pa_size": "42US / 52EU" }.
	 */
	private static function variation_attributes( WC_Product $variation ): array {
		$attrs = array();
		foreach ( $variation->get_variation_attributes() as $key => $value ) {
			$clean = str_replace( 'attribute_', '', $key );
			$label = $value;
			if ( '' !== $value && taxonomy_exists( $clean ) ) {
				$term = get_term_by( 'slug', $value, $clean );
				if ( $term && ! is_wp_error( $term ) ) {
					$label = $term->name;
				}
			}
			$attrs[ $clean ] = $label;
		}
		return $attrs;
	}
}
