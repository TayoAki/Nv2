<?php
/**
 * Small shared helpers.
 *
 * @package NyoniAppBridge
 */

defined( 'ABSPATH' ) || exit;

/** The bridge secret (64 hex chars). */
function nab_secret(): string {
	return (string) get_option( NAB_OPT_SECRET, '' );
}

/** App server base URL, no trailing slash. */
function nab_server_url(): string {
	return untrailingslashit( (string) get_option( NAB_OPT_SERVER, NAB_DEFAULT_SERVER ) );
}

/** RFC 4122 v4 UUID. */
function nab_uuid4(): string {
	$d    = random_bytes( 16 );
	$d[6] = chr( ( ord( $d[6] ) & 0x0f ) | 0x40 );
	$d[8] = chr( ( ord( $d[8] ) & 0x3f ) | 0x80 );
	$h    = bin2hex( $d );
	return sprintf( '%s-%s-%s-%s-%s', substr( $h, 0, 8 ), substr( $h, 8, 4 ), substr( $h, 12, 4 ), substr( $h, 16, 4 ), substr( $h, 20, 12 ) );
}

/** ISO-8601 UTC timestamp, e.g. 2026-09-24T12:00:00Z. */
function nab_iso8601( ?int $ts = null ): string {
	return gmdate( 'Y-m-d\TH:i:s\Z', $ts ?? time() );
}

/** Configured Club product IDs. */
function nab_club_product_ids(): array {
	$raw = (string) get_option( NAB_OPT_CLUB_IDS, '' );
	$ids = array_filter( array_map( 'absint', preg_split( '/[\s,]+/', $raw ) ) );
	return array_values( array_unique( $ids ) );
}

/** Allowed return-URL prefixes, one per line. */
function nab_return_prefixes(): array {
	$raw = (string) get_option( NAB_OPT_RETURNS, NAB_DEFAULT_RETURNS );
	return array_values( array_filter( array_map( 'trim', preg_split( '/\r?\n/', $raw ) ) ) );
}

/**
 * Append one line to the rolling event log (last 50).
 * Never store tokens, secrets, emails or addresses here.
 *
 * @param string     $type   Event type.
 * @param string|int $status HTTP status code or a short code like "net-error".
 * @param string     $error  Short error detail (already free of PII).
 */
function nab_log_add( string $type, $status, string $error = '' ): void {
	$log   = get_option( NAB_OPT_LOG, array() );
	$log   = is_array( $log ) ? $log : array();
	$log[] = array(
		'time'   => nab_iso8601(),
		'type'   => sanitize_text_field( $type ),
		'status' => sanitize_text_field( (string) $status ),
		'error'  => in_array( $error, array( '', 'Network request failed.', 'Bridge secret is not set.', 'A public HTTPS server URL is required.' ), true ) || preg_match( '/^HTTP [0-9]{3}$/', $error ) ? $error : 'Delivery failed.',
	);
	if ( count( $log ) > 50 ) {
		$log = array_slice( $log, -50 );
	}
	update_option( NAB_OPT_LOG, $log, false );
}

/** Strict URLs: no credentials, fragments, encoded traversal or host-prefix matching. */
function nab_valid_server_url( string $url ): bool {
 $parts = wp_parse_url( $url );
 return is_array( $parts ) && 'https' === ( $parts['scheme'] ?? '' ) && ! empty( $parts['host'] )
  && ! isset( $parts['user'] ) && ! isset( $parts['pass'] )
  && ! isset( $parts['query'] ) && ! isset( $parts['fragment'] ) && (bool) wp_http_validate_url( $url );
}
function nab_return_allowed( string $url ): bool {
 if ( '' === $url || preg_match( '/[\\\\\x00-\x20\x7f]/', $url ) ) { return false; }
 $target = wp_parse_url( $url );
 if ( ! is_array( $target ) || isset( $target['user'] ) || isset( $target['pass'] ) || isset( $target['fragment'] ) ) { return false; }
 foreach ( nab_return_prefixes() as $prefix ) {
  if ( 'nyonicouture://' === $prefix && str_starts_with( $url, $prefix ) ) { return true; }
  $allowed = wp_parse_url( $prefix );
  if ( ! is_array( $allowed ) || 'https' !== ( $allowed['scheme'] ?? '' ) || 'https' !== ( $target['scheme'] ?? '' ) ) { continue; }
  if ( strtolower( $allowed['host'] ?? '' ) !== strtolower( $target['host'] ?? '' ) || ( $allowed['port'] ?? 443 ) !== ( $target['port'] ?? 443 ) ) { continue; }
  $path = $target['path'] ?? '/'; $base = $allowed['path'] ?? '/';
  if ( preg_match( '/%(?:2e|2f|5c)|(?:^|\/)\.\.?(?:\/|$)/i', $path ) ) { continue; }
  if ( '/' === $base || $path === rtrim( $base, '/' ) || str_starts_with( $path, rtrim( $base, '/' ) . '/' ) ) { return true; }
 }
 return false;
}
/** Unschedule every action in our group, regardless of its arguments. */
function nab_cancel_jobs(): void {
 if ( ! function_exists( 'as_get_scheduled_actions' ) ) { return; }
 do {
  $actions = as_get_scheduled_actions( array( 'group' => 'nyoni-app-bridge', 'status' => 'pending', 'per_page' => 100 ), 'OBJECT' );
  foreach ( $actions as $action ) { as_unschedule_all_actions( $action->get_hook(), $action->get_args(), 'nyoni-app-bridge' ); }
 } while ( count( $actions ) === 100 );
}
