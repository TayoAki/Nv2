<?php
/** Club entitlements, stored by source so an old refund cannot revoke a newer grant. */
defined( 'ABSPATH' ) || exit;
class NAB_Membership {
 private static bool $refreshing = false;
 public static function init(): void {
  foreach ( array( 'processing', 'completed' ) as $status ) { add_action( 'woocommerce_order_status_' . $status, array( __CLASS__, 'on_order_paid' ) ); }
  foreach ( array( 'refunded', 'cancelled' ) as $status ) { add_action( 'woocommerce_order_status_' . $status, array( __CLASS__, 'on_order_ended' ) ); }
  add_action( 'woocommerce_subscription_status_updated', array( __CLASS__, 'on_subscription_status' ), 10, 3 );
  add_action( 'woocommerce_subscription_payment_complete', array( __CLASS__, 'on_subscription_payment' ) );
  add_action( 'nab_daily_membership_check', array( __CLASS__, 'check_expiries' ) );
  add_action( 'nab_member_sync', array( __CLASS__, 'send_current_status' ) );
  // Action Scheduler is initialized after plugins_loaded; schedule here, including reactivation.
  add_action( 'action_scheduler_init', array( __CLASS__, 'schedule_daily' ) );
  if ( did_action( 'action_scheduler_init' ) ) { self::schedule_daily(); }
 }
 public static function schedule_daily(): void {
  if ( ! as_has_scheduled_action( 'nab_daily_membership_check', array(), 'nyoni-app-bridge' ) ) {
   as_schedule_recurring_action( time() + HOUR_IN_SECONDS, DAY_IN_SECONDS, 'nab_daily_membership_check', array(), 'nyoni-app-bridge' );
  }
 }
 public static function order_has_club( $order ): bool {
  $ids = nab_club_product_ids();
  if ( ! $ids ) { return false; }
  foreach ( $order->get_items() as $item ) {
   if ( in_array( (int) $item->get_product_id(), $ids, true ) || in_array( (int) $item->get_variation_id(), $ids, true ) ) { return true; }
  }
  return false;
 }
 private static function grants( int $id ): array {
  $grants = get_user_meta( $id, 'nyoni_club_grants', true );
  return is_array( $grants ) ? $grants : array();
 }
 private static function queue( int $id ): void {
  if ( ! self::$refreshing && $id && ! as_has_scheduled_action( 'nab_member_sync', array( $id ), 'nyoni-app-bridge' ) ) {
   as_enqueue_async_action( 'nab_member_sync', array( $id ), 'nyoni-app-bridge' );
  }
 }
 public static function on_order_paid( int $order_id ): void {
  $order = wc_get_order( $order_id );
  if ( ! $order || ! self::order_has_club( $order ) || ! $order->get_customer_id() ) { return; }
  // Subscription events own subscription entitlements; never grant a second fixed year.
  if ( ( function_exists( 'wcs_order_contains_subscription' ) && wcs_order_contains_subscription( $order ) )
   || ( function_exists( 'wcs_order_contains_renewal' ) && wcs_order_contains_renewal( $order ) ) ) { self::queue( (int) $order->get_customer_id() ); return; }
  $id = (int) $order->get_customer_id(); self::hydrate( $id ); $grants = self::grants( $id ); $key = 'order_' . $order_id;
  if ( isset( $grants[ $key ] ) && 'active' === $grants[ $key ]['status'] ) {
   $expiries = array_column( array_filter( $grants, static fn( $g ) => 'active' === $g['status'] ), 'expires' );
   if ( $expiries ) { update_user_meta( $id, 'nyoni_club_expires_at', max( $expiries ) ); }
   self::queue( $id ); return;
  }
  $start = $order->get_date_paid() ?: $order->get_date_created(); $started = $start ? $start->getTimestamp() : time();
  // Each purchase has its own duration measured from payment, per the bridge contract.
  $expiry = $started + max( 1, (int) get_option( NAB_OPT_CLUB_DAYS, 365 ) ) * DAY_IN_SECONDS;
  $grants[ $key ] = array( 'status' => 'active', 'started' => $started, 'expires' => $expiry, 'orderId' => $order_id, 'subscriptionId' => null );
  update_user_meta( $id, 'nyoni_club_grants', $grants );
  update_user_meta( $id, 'nyoni_club_expires_at', $expiry );
  self::queue( $id );
 }
 public static function on_order_ended( int $order_id ): void {
  $order = wc_get_order( $order_id );
  if ( ! $order || ! self::order_has_club( $order ) || ! $order->get_customer_id() ) { return; }
  $id = (int) $order->get_customer_id(); self::hydrate( $id ); $grants = self::grants( $id ); $key = 'order_' . $order_id;
  $grants[ $key ] = array_merge( $grants[ $key ] ?? array( 'started' => null, 'expires' => null, 'orderId' => $order_id, 'subscriptionId' => null ), array( 'status' => 'cancelled' ) );
  update_user_meta( $id, 'nyoni_club_grants', $grants ); self::queue( $id );
 }
 public static function on_subscription_payment( $subscription ): void {
  self::on_subscription_status( $subscription, $subscription->get_status() );
 }
 public static function on_subscription_status( $subscription, $new_status = '', $old_status = '' ): void {
  if ( ! is_object( $subscription ) && function_exists( 'wcs_get_subscription' ) ) { $subscription = wcs_get_subscription( $subscription ); }
  if ( ! $subscription || ! self::order_has_club( $subscription ) || ! $subscription->get_user_id() ) { return; }
  $map = array( 'active' => 'active', 'pending-cancel' => 'active', 'on-hold' => 'on_hold', 'cancelled' => 'cancelled', 'expired' => 'expired' );
  if ( ! isset( $map[ $new_status ] ) ) { return; }
  $end = 'pending-cancel' === $new_status ? $subscription->get_date( 'end' ) : ( $subscription->get_date( 'next_payment' ) ?: $subscription->get_date( 'end' ) );
  $start = $subscription->get_date( 'start' ); $id = (int) $subscription->get_user_id(); $grants = self::grants( $id );
  $grants[ 'sub_' . $subscription->get_id() ] = array( 'status' => $map[ $new_status ], 'started' => $start ? strtotime( $start . ' UTC' ) : null, 'expires' => $end ? strtotime( $end . ' UTC' ) : null, 'orderId' => null, 'subscriptionId' => $subscription->get_id() );
  update_user_meta( $id, 'nyoni_club_grants', $grants ); self::queue( $id );
 }
 /** Bootstrap historical fixed-duration Club purchases on first hand-off. */
 private static function hydrate( int $id ): void {
  if ( metadata_exists( 'user', $id, 'nyoni_club_grants' ) || ! nab_club_product_ids() ) { return; }
  $grants = array(); $page = 1;
  do {
   $orders = wc_get_orders( array( 'customer_id' => $id, 'status' => array( 'processing', 'completed' ), 'limit' => 100, 'page' => $page++, 'orderby' => 'date', 'order' => 'ASC' ) );
   foreach ( $orders as $order ) {
    if ( ! self::order_has_club( $order ) || ( function_exists( 'wcs_order_contains_subscription' ) && wcs_order_contains_subscription( $order ) ) || ( function_exists( 'wcs_order_contains_renewal' ) && wcs_order_contains_renewal( $order ) ) ) { continue; }
    $date = $order->get_date_paid() ?: $order->get_date_created(); $start = $date ? $date->getTimestamp() : time();
    $grants[ 'order_' . $order->get_id() ] = array( 'status' => 'active', 'started' => $start, 'expires' => $start + max( 1, (int) get_option( NAB_OPT_CLUB_DAYS, 365 ) ) * DAY_IN_SECONDS, 'orderId' => $order->get_id(), 'subscriptionId' => null );
   }
  } while ( count( $orders ) === 100 );
  update_user_meta( $id, 'nyoni_club_grants', $grants );
 }
 public static function send_current_status( int $id ): void {
  $user = get_userdata( $id ); if ( ! $user ) { return; }
  self::hydrate( $id );
  // Subscriptions remain authoritative (next-payment dates can move without a status change).
  if ( function_exists( 'wcs_get_users_subscriptions' ) ) {
   foreach ( wcs_get_users_subscriptions( $id ) as $subscription ) {
    // Update ledger without recursively queuing another sync.
    self::$refreshing = true;
    self::on_subscription_status( $subscription, $subscription->get_status() );
    self::$refreshing = false;
   }
  }
  $grants = self::grants( $id ); $selected = null; $rank = -1;
  $ranks = array( 'active' => 4, 'on_hold' => 3, 'cancelled' => 2, 'expired' => 1 );
  foreach ( $grants as $key => $grant ) {
   if ( 'active' === $grant['status'] && ! $grant['subscriptionId'] && $grant['expires'] && $grant['expires'] <= time() ) { $grant['status'] = 'expired'; $grants[ $key ] = $grant; }
   $next = $ranks[ $grant['status'] ] ?? 0;
   if ( $next > $rank || ( $next === $rank && ( $grant['expires'] ?? PHP_INT_MAX ) > ( $selected['expires'] ?? 0 ) ) ) { $selected = $grant; $rank = $next; }
  }
  update_user_meta( $id, 'nyoni_club_grants', $grants );
  $selected = $selected ?? array( 'status' => 'expired', 'started' => null, 'expires' => null, 'orderId' => null, 'subscriptionId' => null );
  if ( 'active' === $selected['status'] && $selected['expires'] ) { update_user_meta( $id, 'nyoni_club_expires_at', $selected['expires'] ); }
  else { delete_user_meta( $id, 'nyoni_club_expires_at' ); }
  NAB_Bridge::send( 'membership.updated', array( 'customer' => array( 'id' => $id, 'email' => $user->user_email ), 'status' => $selected['status'], 'startedAt' => $selected['started'] ? nab_iso8601( $selected['started'] ) : null, 'expiresAt' => $selected['expires'] ? nab_iso8601( $selected['expires'] ) : null, 'orderId' => $selected['orderId'], 'subscriptionId' => $selected['subscriptionId'] ) );
 }
 public static function check_expiries(): void {
  $page = 1;
  do {
   $users = get_users( array( 'meta_key' => 'nyoni_club_expires_at', 'meta_value' => time(), 'meta_compare' => '<=', 'meta_type' => 'NUMERIC', 'fields' => 'ID', 'number' => 100, 'paged' => $page++ ) );
   foreach ( $users as $id ) { self::queue( (int) $id ); }
  } while ( count( $users ) === 100 );
 }
}
