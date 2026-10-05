<?php
/**
 * "Sign in with Nyoni" hand-off page (spec 4.4): GET /nyoni-app-login/.
 * Uses the store's real login, then returns a short-lived signed identity token.
 *
 * @package NyoniAppBridge
 */

defined( 'ABSPATH' ) || exit;

class NAB_Login {

	public static function init(): void {
		add_action( 'init', array( __CLASS__, 'add_rewrite_rules' ) );
		add_filter( 'query_vars', array( __CLASS__, 'query_vars' ) );
		add_action( 'template_redirect', array( __CLASS__, 'maybe_handle' ) );
		add_filter( 'woocommerce_login_redirect', array( __CLASS__, 'account_redirect' ), 10, 2 );
		add_filter( 'woocommerce_registration_redirect', array( __CLASS__, 'account_redirect' ), 10, 1 );
	}

	public static function add_rewrite_rules(): void {
		add_rewrite_rule( '^nyoni-app-login/?$', 'index.php?nab_route=login', 'top' );
	}

	public static function query_vars( array $vars ): array {
		if ( ! in_array( 'nab_route', $vars, true ) ) {
			$vars[] = 'nab_route';
		}
		return $vars;
	}

	public static function maybe_handle(): void {
		if ( 'login' === get_query_var( 'nab_route' ) ) {
			self::handle();
		}
	}

	private static function handle(): void {
		nocache_headers();
		header( 'Cache-Control: no-store' );
		header( 'Referrer-Policy: no-referrer' );

		$state  = isset( $_GET['state'] ) && is_string( $_GET['state'] ) ? wp_unslash( $_GET['state'] ) : '';
		$return = isset( $_GET['return'] ) && is_string( $_GET['return'] ) ? wp_unslash( $_GET['return'] ) : '';

		// Invalid parameters: show an error and stop. Never redirect (spec 4.4).
		if ( ! preg_match( '/^[A-Za-z0-9_-]{16,128}$/', $state ) || ! nab_return_allowed( $return ) ) {
			self::error_page( __( 'This sign-in link is invalid or has expired. Please return to the app and try again.', 'nyoni-app-bridge' ) );
		}

		// Rate limit: 30 hand-offs per IP per hour.
		$rk = 'nab_rl_' . md5( self::client_ip() );
		$n  = (int) get_transient( $rk );
		if ( $n >= 30 ) {
			self::error_page( __( 'Too many sign-in attempts. Please try again later.', 'nyoni-app-bridge' ) );
		}
		$window = (int) get_transient( $rk . '_start' );
		if ( ! $window ) { $window = time(); set_transient( $rk . '_start', $window, HOUR_IN_SECONDS ); }
		set_transient( $rk, $n + 1, max( 1, HOUR_IN_SECONDS - ( time() - $window ) ) );

		// Not logged in: send them through the store's normal login/registration.
		if ( ! is_user_logged_in() ) {
			$login = wc_get_page_permalink( 'myaccount' );
			if ( WC()->session ) {
				WC()->session->set_customer_session_cookie( true );
				WC()->session->set( 'nab_login_return', self::current_url() );
			}
			wp_safe_redirect( add_query_arg( 'redirect_to', rawurlencode( self::current_url() ), $login ) );
			exit;
		}

		if ( ! preg_match( '/^[a-f0-9]{64}$/', nab_secret() ) ) {
			self::error_page( 'App sign-in is not configured.' );
		}

		// Logged in: issue the identity token.
		$user = wp_get_current_user();
		$now  = time();
		$token = NAB_JWT::encode(
			array(
				'iss'         => home_url(),
				'aud'         => 'nyoni-app',
				'sub'         => (string) $user->ID,
				'email'       => $user->user_email,
				'given_name'  => $user->first_name,
				'family_name' => $user->last_name,
				'state'       => $state,
				'iat'         => $now,
				'exp'         => $now + 120, // 2 minutes.
				'jti'         => nab_uuid4(),
			),
			nab_secret()
		);

		// Queue closet + membership so benefits are ready when the app opens.
		NAB_Events::queue_customer( $user->ID );


		$sep  = ( false !== strpos( $return, '?' ) ) ? '&' : '?';
		$dest = $return . $sep . 'token=' . rawurlencode( $token ) . '&state=' . rawurlencode( $state );

		wp_redirect( $dest ); // Return target is allow-listed, may be a custom scheme.
		exit;
	}

	/** Restore only our validated local hand-off after login or registration. */
 public static function account_redirect( $redirect, $user = null ): string {
  $candidate = isset( $_REQUEST['redirect_to'] ) && is_string( $_REQUEST['redirect_to'] ) ? wp_unslash( $_REQUEST['redirect_to'] ) : '';
  if ( ! $candidate && function_exists( 'WC' ) && WC()->session ) { $candidate = (string) WC()->session->get( 'nab_login_return' ); }
  $parts = wp_parse_url( $candidate ); $home = wp_parse_url( home_url( '/nyoni-app-login/' ) );
  if ( ! is_array( $parts ) || isset( $parts['user'] ) || isset( $parts['pass'] ) || isset( $parts['fragment'] )
   || ( $parts['scheme'] ?? '' ) !== $home['scheme'] || ( $parts['host'] ?? '' ) !== $home['host']
   || ( $parts['port'] ?? 443 ) !== ( $home['port'] ?? 443 ) || ( $parts['path'] ?? '' ) !== $home['path'] ) { return (string) $redirect; }
  parse_str( $parts['query'] ?? '', $args );
  if ( ! is_string( $args['state'] ?? null ) || ! preg_match( '/^[A-Za-z0-9_-]{16,128}$/', $args['state'] )
   || ! is_string( $args['return'] ?? null ) || ! nab_return_allowed( $args['return'] ) ) { return (string) $redirect; }
  if ( function_exists( 'WC' ) && WC()->session ) { WC()->session->set( 'nab_login_return', null ); }
  return $candidate;
 }

	private static function current_url(): string {
		$req = isset( $_SERVER['REQUEST_URI'] ) ? wp_unslash( $_SERVER['REQUEST_URI'] ) : '';
		return home_url( $req );
	}

	private static function client_ip(): string {
		return isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '0.0.0.0';
	}

	/** Minimal plain error page, then stop. */
	private static function error_page( string $message ): void {
		status_header( 400 );
		nocache_headers();
		$title = esc_html__( 'Sign in with Nyoni', 'nyoni-app-bridge' );
		echo '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
		echo '<title>' . $title . '</title>';
		echo '<div style="font-family:system-ui,sans-serif;max-width:32rem;margin:16vh auto;padding:0 24px;text-align:center;color:#211e18">';
		echo '<h1 style="font-weight:600">' . $title . '</h1>';
		echo '<p style="color:#6d6759">' . esc_html( $message ) . '</p>';
		echo '</div>';
		exit;
	}
}
