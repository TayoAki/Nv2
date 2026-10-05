<?php
/**
 * Minimal JWT (HS256) encoder for the login hand-off token (spec 4.4).
 *
 * @package NyoniAppBridge
 */

defined( 'ABSPATH' ) || exit;

class NAB_JWT {

	/** URL-safe base64 with no padding. */
	public static function b64url( string $bin ): string {
		return rtrim( strtr( base64_encode( $bin ), '+/', '-_' ), '=' );
	}

	/**
	 * Encode a payload as a signed HS256 JWT.
	 *
	 * @param array  $payload Claims.
	 * @param string $secret  HMAC key (the bridge secret).
	 */
	public static function encode( array $payload, string $secret ): string {
		$header  = self::b64url( wp_json_encode( array( 'alg' => 'HS256', 'typ' => 'JWT' ) ) );
		$claims  = self::b64url( wp_json_encode( $payload ) );
		$signing = $header . '.' . $claims;
		$sig     = self::b64url( hash_hmac( 'sha256', $signing, $secret, true ) );
		return $signing . '.' . $sig;
	}
}
