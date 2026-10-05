<?php
/**
 * Linking app checkouts to orders (spec 4.5).
 *
 * The app appends ?nyoni_app=<ref> to WooCommerce's shareable checkout link. We stash
 * the ref in the WC session and copy it onto the created order as meta `nyoni_app_ref`
 * (no leading underscore, so it rides along in the order webhook's meta_data).
 *
 * Fallback /nyoni-checkout/ is provided for stores whose checkout links can't carry
 * variation IDs (open question 1).
 *
 * @package NyoniAppBridge
 */

defined( 'ABSPATH' ) || exit;

class NAB_Checkout {

	private const REF_RE = '/^[A-Za-z0-9._-]{1,200}$/';

	public static function init(): void {
		add_action( 'wp_loaded', array( __CLASS__, 'capture_ref' ) );
		add_action( 'woocommerce_checkout_order_created', array( __CLASS__, 'save_ref_to_order' ), 10, 1 );
		add_action( 'woocommerce_store_api_checkout_order_processed', array( __CLASS__, 'save_ref_to_order' ), 10, 1 );
		add_action( 'woocommerce_thankyou', array( __CLASS__, 'clear_ref' ) );

		add_action( 'init', array( __CLASS__, 'add_rewrite_rules' ) );
		add_filter( 'query_vars', array( __CLASS__, 'query_vars' ) );
		add_action( 'template_redirect', array( __CLASS__, 'maybe_handle_fallback' ) );
	}

	public static function add_rewrite_rules(): void {
		add_rewrite_rule( '^nyoni-checkout/?$', 'index.php?nab_route=checkout', 'top' );
	}

	public static function query_vars( array $vars ): array {
		if ( ! in_array( 'nab_route', $vars, true ) ) {
			$vars[] = 'nab_route';
		}
		return $vars;
	}

	/** Save the ref from any front-end request that carries it. */
	public static function capture_ref(): void {
		if ( is_admin() || ! isset( $_GET['nyoni_app'] ) || ! is_string( $_GET['nyoni_app'] ) || ! function_exists( 'WC' ) || ! WC()->session ) {
			return;
		}
		// Signed fallback saves attribution only after its signature and cart are accepted.
		if ( isset( $_SERVER['REQUEST_URI'] ) && str_contains( $_SERVER['REQUEST_URI'], '/nyoni-checkout' ) ) { return; }
		$ref = wp_unslash( $_GET['nyoni_app'] );
		if ( preg_match( self::REF_RE, $ref ) ) {
			if ( ! WC()->session->has_session() ) {
				WC()->session->set_customer_session_cookie( true );
			}
			WC()->session->set( 'nyoni_app_ref', $ref );
		}
	}

	/**
	 * Copy the stashed ref onto the order. Accepts an order object or id
	 * (classic checkout passes the object, the Store API passes the same).
	 *
	 * @param WC_Order|int $order Order or id.
	 */
	public static function save_ref_to_order( $order ): void {
		$order = is_numeric( $order ) ? wc_get_order( $order ) : $order;
		if ( ! $order instanceof WC_Order || $order->get_meta( 'nyoni_app_ref' ) ) {
			return;
		}
		$ref = ( function_exists( 'WC' ) && WC()->session ) ? (string) WC()->session->get( 'nyoni_app_ref' ) : '';
		if ( $ref && preg_match( self::REF_RE, $ref ) ) {
			$order->update_meta_data( 'nyoni_app_ref', $ref );
			$order->save();

		}
	}

	public static function clear_ref( $order_id ): void {
		$order = wc_get_order( $order_id );
		if ( $order && WC()->session && $order->get_meta( 'nyoni_app_ref' ) === WC()->session->get( 'nyoni_app_ref' ) ) { WC()->session->set( 'nyoni_app_ref', null ); }
	}

	public static function maybe_handle_fallback(): void {
		if ( 'checkout' === get_query_var( 'nab_route' ) ) {
			self::handle_fallback();
		}
	}

	/**
	 * GET /nyoni-checkout/?items=91:1,105:2&nyoni_app=<ref>&sig=<hmac>
	 * Verifies the signature, fills the cart from variation IDs, saves the ref,
	 * then redirects to the normal checkout.
	 */
 public static function verify_link( string $items, string $ref, string $signature ): bool {
  if ( ! preg_match( '/^[a-f0-9]{64}$/', nab_secret() ) || ! preg_match( self::REF_RE, $ref )
   || strlen( $items ) > 2000 || ! preg_match( '/^[1-9][0-9]{0,9}:[1-9][0-9]{0,2}(?:,[1-9][0-9]{0,9}:[1-9][0-9]{0,2}){0,49}$/', $items ) ) { return false; }
  $expected = NAB_JWT::b64url( hash_hmac( 'sha256', 'items=' . $items . '&nyoni_app=' . $ref, nab_secret(), true ) );
  return hash_equals( $expected, $signature );
 }
 /** Validate all products before touching an existing cart. */
 public static function build_cart( string $items ): bool {
  if ( ! WC()->cart || ! WC()->session ) { return false; }
  $lines = array(); $quantities = array();
  foreach ( explode( ',', $items ) as $pair ) {
   list( $id, $qty ) = array_map( 'intval', explode( ':', $pair ) );
   $product = wc_get_product( $id );
   $quantities[ $id ] = ( $quantities[ $id ] ?? 0 ) + $qty;
   if ( ! $product || ! $product->exists() || ! $product->is_purchasable() || ! $product->is_in_stock()
    || ! $product->has_enough_stock( $quantities[ $id ] ) || ( $product->is_sold_individually() && $quantities[ $id ] > 1 )
    || ! in_array( $product->get_type(), array( 'simple', 'variation', 'subscription', 'subscription_variation' ), true ) ) { return false; }
   $variation = $product->is_type( array( 'variation', 'subscription_variation' ) );
   $lines[] = array( $variation ? $product->get_parent_id() : $id, $qty, $variation ? $id : 0, $variation ? $product->get_variation_attributes() : array() );
  }
  $cart = WC()->cart;
  $snapshot = array( 'contents' => $cart->get_cart_contents(), 'removed' => $cart->get_removed_cart_contents(), 'coupons' => $cart->get_applied_coupons() );
  $cart->empty_cart( false );
  try {
   foreach ( $lines as $line ) {
    if ( ! apply_filters( 'woocommerce_add_to_cart_validation', true, $line[0], $line[1], $line[2], $line[3] ) || ! $cart->add_to_cart( ...$line ) ) { throw new RuntimeException( 'Cart validation failed.' ); }
   }
   $cart->calculate_totals();
   WC()->session->set_customer_session_cookie( true );
   return true;
  } catch ( Throwable $e ) {
   $cart->set_cart_contents( $snapshot['contents'] );
   $cart->set_removed_cart_contents( $snapshot['removed'] );
   $cart->set_applied_coupons( $snapshot['coupons'] );
   $cart->calculate_totals();
   return false;
  }
 }
 private static function handle_fallback(): void {
  nocache_headers(); header( 'Cache-Control: no-store' ); header( 'Referrer-Policy: no-referrer' );
  $args = array();
  foreach ( array( 'items', 'nyoni_app', 'sig' ) as $key ) {
   $args[ $key ] = isset( $_GET[ $key ] ) && is_string( $_GET[ $key ] ) ? wp_unslash( $_GET[ $key ] ) : '';
  }
  if ( ! self::verify_link( $args['items'], $args['nyoni_app'], $args['sig'] ) ) { status_header( 403 ); exit( 'Invalid checkout link' ); }
  if ( ! function_exists( 'WC' ) || ! self::build_cart( $args['items'] ) ) { status_header( 400 ); exit( 'One or more items cannot be added. Please return to the app.' ); }
  WC()->session->set( 'nyoni_app_ref', $args['nyoni_app'] );
  wp_safe_redirect( wc_get_checkout_url() ); exit;
 }
}
