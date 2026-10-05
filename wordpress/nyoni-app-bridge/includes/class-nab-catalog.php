<?php
/** Published catalogue batches and coalesced product/stock changes. */
defined( 'ABSPATH' ) || exit;
class NAB_Catalog {
 public static function init(): void {
  add_action( 'nab_catalog_batch', array( __CLASS__, 'run_batch' ), 10, 4 );
  add_action( 'nab_catalog_single', array( __CLASS__, 'run_single' ) );
  add_action( 'nab_delivery_result', array( __CLASS__, 'delivery_result' ), 10, 2 );
  foreach ( array( 'woocommerce_new_product', 'woocommerce_update_product' ) as $hook ) { add_action( $hook, array( __CLASS__, 'on_product_change' ) ); }
  foreach ( array( 'woocommerce_new_product_variation', 'woocommerce_update_product_variation' ) as $hook ) { add_action( $hook, array( __CLASS__, 'on_variation_change' ) ); }
  foreach ( array( 'woocommerce_product_set_stock', 'woocommerce_variation_set_stock', 'woocommerce_product_set_stock_status', 'woocommerce_variation_set_stock_status' ) as $hook ) { add_action( $hook, array( __CLASS__, 'on_stock_change' ) ); }
 }
 public static function progress(): array {
  $run = get_option( 'nyoni_app_catalog_progress', array() );
  if ( ! is_array( $run ) ) { return array(); }
  $run['accepted'] = 0; $run['failed'] = 0; $run['retrying'] = 0;
  for ( $i = 1; $i <= ( $run['batches'] ?? 0 ); $i++ ) {
   $status = get_option( 'nyoni_app_batch_' . $run['id'] . '_' . $i, 'queued' );
   if ( isset( $run[ $status ] ) ) { $run[ $status ]++; }
  }
  $run['pending'] = max( 0, ( $run['batches'] ?? 0 ) - $run['accepted'] - $run['failed'] );
  return $run;
 }
 public static function send_all(): int {
  $previous = self::progress();
  if ( ! empty( $previous['pending'] ) ) { return (int) $previous['products']; }
  if ( isset( $previous['id'] ) ) {
   for ( $i = 1; $i <= $previous['batches']; $i++ ) { delete_option( 'nyoni_app_batch_' . $previous['id'] . '_' . $i ); }
  }
  $ids = wc_get_products( array( 'status' => 'publish', 'limit' => -1, 'return' => 'ids', 'orderby' => 'ID', 'order' => 'ASC' ) );
  $chunks = array_chunk( $ids, 50 ); $run = nab_uuid4();
  update_option( 'nyoni_app_catalog_progress', array( 'id' => $run, 'products' => count( $ids ), 'batches' => count( $chunks ), 'startedAt' => nab_iso8601() ), false );
  foreach ( $chunks as $i => $chunk ) {
   as_enqueue_async_action( 'nab_catalog_batch', array( $i + 1, count( $chunks ), $chunk, $run ), 'nyoni-app-bridge' );
  }
  return count( $ids );
 }
 public static function run_batch( int $batch, int $of, array $ids, string $run = '' ): void {
  $products = array();
  foreach ( $ids as $id ) {
   $p = wc_get_product( $id );
   if ( $p && $p->exists() && 'publish' === $p->get_status() ) { $products[] = NAB_Events::build_product( $p ); }
  }
  NAB_Bridge::send( 'catalog.batch', array( 'batch' => $batch, 'of' => $of, 'products' => $products ), array( 'run' => $run, 'batch' => $batch ) );
 }
 public static function delivery_result( array $context, string $status ): void {
  $run = get_option( 'nyoni_app_catalog_progress', array() );
  if ( ! empty( $context['run'] ) && ( $run['id'] ?? '' ) === $context['run'] && in_array( $status, array( 'accepted', 'failed', 'retrying' ), true ) ) {
   update_option( 'nyoni_app_batch_' . $context['run'] . '_' . absint( $context['batch'] ), $status, false );
  }
 }
 public static function run_single( int $id ): void {
  $p = wc_get_product( $id );
  if ( $p && $p->exists() && 'publish' === $p->get_status() ) {
   NAB_Bridge::send( 'catalog.batch', array( 'batch' => 1, 'of' => 1, 'products' => array( NAB_Events::build_product( $p ) ) ) );
  }
 }
 public static function on_product_change( int $id ): void { self::schedule( $id ); }
 public static function on_variation_change( int $id ): void { self::schedule( (int) wp_get_post_parent_id( $id ) ); }
 public static function on_stock_change( $product ): void {
  $p = is_object( $product ) ? $product : wc_get_product( $product );
  if ( $p ) { self::schedule( $p->is_type( 'variation' ) ? $p->get_parent_id() : $p->get_id() ); }
 }
 private static function schedule( int $id ): void {
  // A delayed read includes the final state of all saves during this window.
  if ( $id && ! as_has_scheduled_action( 'nab_catalog_single', array( $id ), 'nyoni-app-bridge' ) ) {
   as_schedule_single_action( time() + 30, 'nab_catalog_single', array( $id ), 'nyoni-app-bridge' );
  }
 }
}
