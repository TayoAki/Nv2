<?php
// Runs the Nyoni App Bridge plugin's own signing code against a local app server, to prove the
// two sides agree. WordPress functions are stubbed; everything else is the plugin as shipped.
//
// Start the server with test secrets (never production ones), then:
//   NYONI_BRIDGE_SECRET=<test hex> php wordpress/test/plugin-contract.php
// The server must run with the same NYONI_BRIDGE_SECRET and STORE_URL=http://localhost:8300.
define( 'ABSPATH', __DIR__ );
$PLUGIN = dirname( __DIR__ ) . '/nyoni-app-bridge';
$SERVER = dirname( __DIR__, 2 ) . '/server';
$SECRET = (string) getenv( 'NYONI_BRIDGE_SECRET' );
$API    = getenv( 'API_URL' ) ?: 'http://localhost:8090';
if ( ! preg_match( '/^[a-f0-9]{64}$/', $SECRET ) ) { fwrite( STDERR, "Set NYONI_BRIDGE_SECRET to the server's 64-character test secret.\n" ); exit( 2 ); }
function get_option( $k, $d = false ) { return $GLOBALS['opts'][ $k ] ?? $d; }
function plugin_dir_path( $f ) { return dirname( $f ) . "/"; } function plugin_dir_url( $f ) { return ""; } function plugin_basename( $f ) { return basename( $f ); }
function update_option( $k, $v ) { $GLOBALS['opts'][ $k ] = $v; }
function untrailingslashit( $s ) { return rtrim( $s, "/\\" ); }
function sanitize_text_field( $v ) { return trim( (string) $v ); }
function wp_parse_url( $u, $c = -1 ) { return parse_url( $u, $c ); }
function wp_http_validate_url( $u ) { return $u; }
function add_action() {} function add_filter() {} function do_action() {}
function wp_json_encode( $v ) { return json_encode( $v ); } // WordPress's default flags escape slashes too
function is_wp_error( $x ) { return false; }
function wp_remote_retrieve_response_code( $r ) { return $r['code']; }
function as_schedule_single_action() { echo "  plugin would retry\n"; }
function wp_safe_remote_post( $url, $args ) {
	$h = array(); foreach ( $args['headers'] as $k => $v ) { $h[] = "$k: $v"; }
	$c = curl_init( str_replace( 'https://localhost:8090', 'http://localhost:8090', $url ) );
	curl_setopt_array( $c, array( CURLOPT_POST => true, CURLOPT_POSTFIELDS => $args['body'], CURLOPT_HTTPHEADER => $h, CURLOPT_RETURNTRANSFER => true ) );
	$body = curl_exec( $c ); $code = curl_getinfo( $c, CURLINFO_HTTP_CODE ); curl_close( $c );
	$GLOBALS['last_body'] = $body;
	return array( 'code' => $code );
}
// The plugin's own constants (option names, defaults).
foreach ( file( "$PLUGIN/nyoni-app-bridge.php" ) as $line ) { if ( preg_match( "/^define\(/", $line ) ) { eval( str_replace( "__FILE__", "\"$PLUGIN/nyoni-app-bridge.php\"", $line ) ); } }
// The plugin insists on a public HTTPS server; it gets one, and the network stand-in below reaches the local server.
$GLOBALS['opts'] = array( NAB_OPT_SECRET => $SECRET, NAB_OPT_SERVER => 'https://localhost:8090' );

require "$PLUGIN/includes/helpers.php";
require "$PLUGIN/includes/class-nab-jwt.php";
require "$PLUGIN/includes/class-nab-bridge.php";
require "$PLUGIN/includes/class-nab-checkout.php";

$fail = 0;
function check( $name, $ok, $extra = '' ) { global $fail; echo ( $ok ? 'PASS ' : 'FAIL ' ) . $name . ( $extra ? " ($extra)" : '' ) . "\n"; if ( ! $ok ) { $fail++; } }

// 1. Test connection.
check( 'ping signed by the plugin is accepted', NAB_Bridge::send( 'ping', array( 'site' => 'https://nyonicouture.com', 'wc' => '11.1.2', 'plugin' => '1.0.1' ) ), $GLOBALS['last_body'] );

// 2. A catalogue batch in the plugin's exact shape (variation image, unmanaged stock, empty attributes).
$product = array( 'id' => 82, 'slug' => 'nathan', 'name' => 'Midnight Navy Three Piece Suit', 'permalink' => 'https://nyonicouture.com/product/three-piece-suit/nathan/',
	'status' => 'publish', 'type' => 'variable', 'currency' => 'USD', 'price' => '895', 'regularPrice' => '895', 'salePrice' => '', 'categories' => array( 'Suits' ),
	'images' => array( 'https://nyonicouture.com/wp-content/uploads/nathan.jpg' ), 'stockStatus' => 'instock', 'stockQuantity' => null,
	'variations' => array(
		array( 'id' => 91, 'sku' => '', 'image' => null, 'attributes' => array( 'pa_size' => '38US / 48EU' ), 'price' => '895', 'stockStatus' => 'instock', 'stockQuantity' => null ),
		array( 'id' => 92, 'sku' => '', 'image' => 'https://nyonicouture.com/n40.jpg', 'attributes' => array( 'pa_size' => '40US / 50EU' ), 'price' => '895', 'stockStatus' => 'outofstock', 'stockQuantity' => 0 ),
	) );
$club = array( 'id' => 500, 'slug' => 'nyoni-club', 'name' => 'Nyoni Club', 'permalink' => 'https://nyonicouture.com/product/nyoni-club/', 'status' => 'publish', 'type' => 'variable-subscription',
	'currency' => 'USD', 'price' => '99', 'regularPrice' => '99', 'salePrice' => '', 'categories' => array(), 'images' => array(), 'stockStatus' => 'instock', 'stockQuantity' => null,
	'variations' => array( array( 'id' => 501, 'sku' => '', 'image' => null, 'attributes' => array(), 'price' => '99', 'stockStatus' => 'instock', 'stockQuantity' => null ) ) );
check( 'catalogue batch accepted', NAB_Bridge::send( 'catalog.batch', array( 'batch' => 1, 'of' => 1, 'products' => array( $product, $club ) ) ), $GLOBALS['last_body'] );

// 3. Orders and Club status, as sent after a login.
$orders = array( array( 'id' => 6100, 'number' => '6100', 'status' => 'completed', 'currency' => 'USD', 'total' => '895.00', 'createdAt' => '2026-09-20T10:00:00Z', 'paidAt' => '2026-09-20T10:00:00Z',
	'customerId' => 777, 'billingEmail' => 'plugin@example.com', 'appRef' => null,
	'items' => array( array( 'productId' => 82, 'variationId' => 91, 'name' => 'Midnight Navy Three Piece Suit - 38US / 48EU', 'quantity' => 1, 'total' => '895', 'attributes' => array( 'pa_size' => '38US / 48EU' ) ),
		array( 'productId' => 900, 'variationId' => null, 'name' => 'Gift card', 'quantity' => 1, 'total' => '50', 'attributes' => array() ) ) ) );
check( 'customer.orders accepted', NAB_Bridge::send( 'customer.orders', array( 'customer' => array( 'id' => 777, 'email' => 'plugin@example.com', 'firstName' => 'Plugin', 'lastName' => 'Test', 'createdAt' => null ), 'orders' => $orders ) ), $GLOBALS['last_body'] );
check( 'membership.updated accepted', NAB_Bridge::send( 'membership.updated', array( 'customer' => array( 'id' => 777, 'email' => 'plugin@example.com' ), 'status' => 'active', 'startedAt' => '2026-09-01T00:00:00Z', 'expiresAt' => '2027-09-01T00:00:00Z', 'orderId' => null, 'subscriptionId' => 55 ) ), $GLOBALS['last_body'] );

// 4. A login token made by the plugin's JWT code with the claims class-nab-login.php issues.
$now = time(); $state = 'harness_state_' . bin2hex( random_bytes( 6 ) );
$token = NAB_JWT::encode( array( 'iss' => 'http://localhost:8300', 'aud' => 'nyoni-app', 'sub' => '777', 'email' => 'plugin@example.com', 'given_name' => 'Plugin', 'family_name' => 'Test',
	'state' => $state, 'iat' => $now, 'exp' => $now + 120, 'jti' => nab_uuid4() ), $SECRET );
$dev = json_decode( file_get_contents( "$API/v1/devices", false, stream_context_create( array( 'http' => array( 'method' => 'POST' ) ) ) ), true )['token'];
$ctx = fn( $body ) => stream_context_create( array( 'http' => array( 'method' => 'POST', 'ignore_errors' => true, 'header' => "Authorization: Device $dev\r\nContent-Type: application/json\r\n", 'content' => json_encode( $body ) ) ) );
$signin = json_decode( file_get_contents( "$API/v1/auth/nyoni", false, $ctx( array( 'token' => $token, 'state' => $state ) ) ), true );
check( 'login token from the plugin signs in', isset( $signin['sessionToken'] ), json_encode( $signin['error'] ?? '' ) );
$again = json_decode( file_get_contents( "$API/v1/auth/nyoni", false, $ctx( array( 'token' => $token, 'state' => $state ) ) ), true );
check( 'the same token is refused the second time', ( $again['error']['code'] ?? '' ) === 'unauthorized' );
$me = json_decode( file_get_contents( "$API/v1/me", false, stream_context_create( array( 'http' => array( 'header' => 'Authorization: Member ' . ( $signin['sessionToken'] ?? '' ) ) ) ) ), true );
check( 'purchases and Club status reach the member', ( $me['club']['active'] ?? false ) && count( $me['orders'][0]['items'] ?? array() ) === 2 && $me['orders'][0]['items'][0]['productId'] === 'p-nathan', json_encode( $me['orders'][0]['items'][0] ?? null ) );

// 5. The server's checkout link verifies with the plugin's own check.
$catalog = json_decode( file_get_contents( "$API/v1/catalog" ), true );
foreach ( $catalog as $p ) { if ( $p['id'] === 'p-nathan' ) { foreach ( $p['variants'] as $v ) { if ( $v['size']['label'] === '38US / 48EU' ) { $variant = $v['id']; } } } }
$co = json_decode( file_get_contents( "$API/v1/checkout", false, $ctx( array( 'lines' => array( array( 'productId' => 'p-nathan', 'variantId' => $variant, 'quantity' => 1 ) ) ) ) ), true );
check( 'server builds a checkout link', isset( $co['url'] ), json_encode( $co ) );
parse_str( parse_url( $co['url'] ?? '', PHP_URL_QUERY ) ?? '', $q );
check( 'checkout link has the variation and a valid ref', ( $q['products'] ?? '' ) === '91:1' && preg_match( '/^[A-Za-z0-9._-]{1,200}$/', $q['nyoni_app'] ?? '' ), $co['url'] ?? '' );
// The signed fallback, as the server builds it in WOO_CHECKOUT_MODE=signed (same function the tests cover).
$sig = rtrim( strtr( base64_encode( hash_hmac( 'sha256', 'items=91:1&nyoni_app=' . $q['nyoni_app'], $SECRET, true ) ), '+/', '-_' ), '=' );
$node = trim( shell_exec( 'cd ' . escapeshellarg( $SERVER ) . ' && NYONI_BRIDGE_SECRET=' . escapeshellarg( $SECRET ) . ' DATABASE_URL=postgres://x/y node --import tsx -e ' . escapeshellarg( "import('./src/woo/signing.ts').then(m=>console.log(m.signCheckout('91:1'," . json_encode( $q['nyoni_app'] ) . ')))' ) . ' 2>&1' ) );
check( "server's signed fallback passes the plugin's verify_link", NAB_Checkout::verify_link( '91:1', $q['nyoni_app'], $node ), $node === $sig ? '' : "node=$node" );

echo $fail ? "\n$fail failed\n" : "\nAll plugin checks passed\n";
exit( $fail ? 1 : 0 );
