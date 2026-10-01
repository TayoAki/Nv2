<?php
/**
 * Outgoing bridge transport: envelope, HMAC signing, delivery and retries (spec 4.2).
 *
 * POST {server}/v1/woo/bridge
 *   X-Nyoni-Timestamp: <unix seconds>
 *   X-Nyoni-Signature: base64( HMAC-SHA256( secret, timestamp + "." + raw_body ) )
 *   X-Nyoni-Event-Id:  <uuid>   (server ignores repeats)
 *
 * @package NyoniAppBridge
 */

defined( 'ABSPATH' ) || exit;

class NAB_Bridge {

	/** Retry backoff by attempt number (spec: 1m, 5m, 30m, 2h), then give up. */
	private const BACKOFF = array( 1 => 60, 2 => 300, 3 => 1800, 4 => 7200 );

	public static function init(): void {
		add_action( 'nab_send_event', array( __CLASS__, 'send' ), 10, 2 );
		add_action( 'nab_retry_event', array( __CLASS__, 'handle_retry' ), 10, 5 );
	}

	public static function queue( string $type, array $data ): void {
		as_enqueue_async_action( 'nab_send_event', array( $type, $data ), 'nyoni-app-bridge' );
	}

	/**
	 * Send an event. Returns true on a 2xx, false otherwise (a retry may be queued).
	 *
	 * @param string $type Event type (ping, catalog.batch, customer.orders, membership.updated).
	 * @param array  $data Event data.
	 */
	public static function send( string $type, array $data, array $context = array() ): bool {
		$envelope = array(
			'type'   => $type,
			'sentAt' => nab_iso8601(),
			'data'   => $data,
		);
		return self::post( (string) wp_json_encode( $envelope ), nab_uuid4(), $type, 1, $context );
	}

	/**
	 * Sign + POST the raw body. Timestamp is fresh on every (re)try; event id and
	 * body are stable so the server de-duplicates.
	 */
	private static function post( string $body, string $event_id, string $type, int $attempt, array $context = array() ): bool {
		$secret = nab_secret();
		if ( ! preg_match( '/^[a-f0-9]{64}$/', $secret ) ) {
			nab_log_add( $type, 'no-secret', 'Bridge secret is not set.' );
			do_action( 'nab_delivery_result', $context, 'failed' );
			return false;
		}

		if ( ! nab_valid_server_url( nab_server_url() ) ) {
			nab_log_add( $type, 'invalid-url', 'A public HTTPS server URL is required.' );
			do_action( 'nab_delivery_result', $context, 'failed' );
			return false;
		}

		$ts  = (string) time();
		$sig = base64_encode( hash_hmac( 'sha256', $ts . '.' . $body, $secret, true ) );

		$res = wp_safe_remote_post(
			nab_server_url() . '/v1/woo/bridge',
			array(
				'timeout' => 15,
				'redirection' => 0,
				'headers' => array(
					'Content-Type'      => 'application/json',
					'X-Nyoni-Timestamp' => $ts,
					'X-Nyoni-Signature' => $sig,
					'X-Nyoni-Event-Id'  => $event_id,
				),
				'body'    => $body,
			)
		);

		if ( is_wp_error( $res ) ) {
			nab_log_add( $type, 'net-error', 'Network request failed.' );
			self::schedule_retry( $body, $event_id, $type, $attempt, $context );
			return false;
		}

		$code = (int) wp_remote_retrieve_response_code( $res );

		if ( $code >= 200 && $code < 300 ) {
			nab_log_add( $type, $code, '' );
			do_action( 'nab_delivery_result', $context, 'accepted' );
			return true;
		}

		// 5xx -> retry; 4xx -> log and stop (spec 4.2).
		$detail = 'HTTP ' . $code;
		nab_log_add( $type, $code, $detail );
		if ( $code >= 500 && $code < 600 ) {
			self::schedule_retry( $body, $event_id, $type, $attempt, $context );
		} else {
			do_action( 'nab_delivery_result', $context, 'failed' );
		}
		return false;
	}

	/** Queue the next retry through Action Scheduler, if attempts remain. */
	private static function schedule_retry( string $body, string $event_id, string $type, int $attempt, array $context = array() ): void {
		if ( ! isset( self::BACKOFF[ $attempt ] ) || ! function_exists( 'as_schedule_single_action' ) ) {
			do_action( 'nab_delivery_result', $context, 'failed' );
			return;
		}
		do_action( 'nab_delivery_result', $context, 'retrying' );
		as_schedule_single_action(
			time() + self::BACKOFF[ $attempt ],
			'nab_retry_event',
			array( $body, $event_id, $type, $attempt + 1, $context ),
			'nyoni-app-bridge'
		);
	}

	/** Action Scheduler callback for a queued retry. */
	public static function handle_retry( string $body, string $event_id, string $type, int $attempt, array $context = array() ): void {
		self::post( $body, $event_id, $type, $attempt, $context );
	}
}
