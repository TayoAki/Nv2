<?php
/**
 * Settings screen: WooCommerce -> Nyoni App (spec 4.1).
 * Visible only to users with manage_woocommerce.
 *
 * @package NyoniAppBridge
 */

defined( 'ABSPATH' ) || exit;

class NAB_Settings {

	const PAGE  = 'nyoni-app-bridge';
	const GROUP = 'nab_group';

	public static function init(): void {
		add_filter( 'option_page_capability_nab_group', static fn() => 'manage_woocommerce' );
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_init', array( __CLASS__, 'register' ) );
		add_action( 'admin_post_nab_test', array( __CLASS__, 'handle_test' ) );
		add_action( 'admin_post_nab_sync', array( __CLASS__, 'handle_sync' ) );
		add_action( 'admin_post_nab_regen', array( __CLASS__, 'handle_regen' ) );
		add_action( 'admin_post_nab_webhooks', array( __CLASS__, 'handle_webhooks' ) );
	}

	public static function menu(): void {
		add_submenu_page(
			'woocommerce',
			__( 'Nyoni App', 'nyoni-app-bridge' ),
			__( 'Nyoni App', 'nyoni-app-bridge' ),
			'manage_woocommerce',
			self::PAGE,
			array( __CLASS__, 'render' )
		);
	}

	public static function register(): void {
		register_setting( self::GROUP, NAB_OPT_SERVER, array( 'sanitize_callback' => array( __CLASS__, 'sanitize_server' ) ) );
		register_setting( self::GROUP, NAB_OPT_RETURNS, array( 'sanitize_callback' => 'sanitize_textarea_field' ) );
		register_setting( self::GROUP, NAB_OPT_CLUB_IDS, array( 'sanitize_callback' => 'sanitize_text_field' ) );
		register_setting( self::GROUP, NAB_OPT_CLUB_DAYS, array( 'sanitize_callback' => static fn( $value ) => max( 1, min( 36500, absint( $value ) ) ) ) );
	}

	public static function sanitize_server( $value ): string {
		$value = untrailingslashit( esc_url_raw( (string) $value ) );
		if ( nab_valid_server_url( $value ) ) { return $value; }
		add_settings_error( NAB_OPT_SERVER, 'nab_https', 'Enter a public HTTPS URL without credentials, query parameters or fragments.' );
		return nab_server_url();
	}

	private static function guard(): void {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_die( esc_html__( 'You do not have permission to do that.', 'nyoni-app-bridge' ) );
		}
	}

	private static function back(): void {
		wp_safe_redirect( admin_url( 'admin.php?page=' . self::PAGE ) );
		exit;
	}

	public static function handle_test(): void {
		self::guard();
		check_admin_referer( 'nab_test' );
		$ok = NAB_Events::ping();
		set_transient(
			'nab_notice_' . get_current_user_id(),
			$ok
				? array( 'ok', __( 'Connected — the app server accepted the ping.', 'nyoni-app-bridge' ) )
				: array( 'err', __( 'The ping did not succeed. Check the server URL and secret, then see the log below.', 'nyoni-app-bridge' ) ),
			60
		);
		self::back();
	}

	public static function handle_sync(): void {
		self::guard();
		check_admin_referer( 'nab_sync' );
		$count = NAB_Catalog::send_all();
		set_transient(
			'nab_notice_' . get_current_user_id(),
			array( 'ok', sprintf( /* translators: %d: product count. */ __( 'Queued %d products for delivery in batches of 50. They send in the background.', 'nyoni-app-bridge' ), $count ) ),
			60
		);
		self::back();
	}

	public static function handle_webhooks(): void {
		self::guard();
		check_admin_referer( 'nab_webhooks' );
		$result = NAB_Webhooks::ensure();
		set_transient(
			'nab_notice_' . get_current_user_id(),
			array( 'ok', sprintf( /* translators: 1: created count, 2: updated count. */ __( 'App webhooks ready: %1$d created, %2$d updated. They are signed with the bridge secret.', 'nyoni-app-bridge' ), $result['created'], $result['updated'] ) ),
			60
		);
		self::back();
	}

	public static function handle_regen(): void {
		self::guard();
		check_admin_referer( 'nab_regen' );
		update_option( NAB_OPT_SECRET, bin2hex( random_bytes( 32 ) ), false );
		NAB_Webhooks::resign(); // The app's webhooks are signed with the same secret.
		update_option( 'nyoni_app_secret_unseen', get_current_user_id(), false );
		set_transient(
			'nab_notice_' . get_current_user_id(),
			array( 'warn', __( 'New bridge secret generated. Copy it into Railway (NYONI_BRIDGE_SECRET) — the old value stops working immediately.', 'nyoni-app-bridge' ) ),
			60
		);
		self::back();
	}

	public static function render(): void {
		self::guard();
		$notice = get_transient( 'nab_notice_' . get_current_user_id() );
		delete_transient( 'nab_notice_' . get_current_user_id() );
		nocache_headers();
		header( 'Referrer-Policy: no-referrer' );
		$show_secret = get_option( 'nyoni_app_secret_unseen', false );
		$show_secret = 'first' === $show_secret || ( $show_secret && (int) $show_secret === get_current_user_id() );
		if ( $show_secret ) { delete_option( 'nyoni_app_secret_unseen' ); }
		$progress = NAB_Catalog::progress();
		$log = get_option( NAB_OPT_LOG, array() );
		$log = is_array( $log ) ? array_reverse( $log ) : array();
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'Nyoni App Bridge', 'nyoni-app-bridge' ); ?></h1>
			<p style="max-width:60em;color:#50575e"><?php esc_html_e( 'This store sends signed updates out to the Nyoni app server. Nothing calls back into the store.', 'nyoni-app-bridge' ); ?></p>

			<?php if ( is_array( $notice ) ) : ?>
				<div class="notice notice-<?php echo esc_attr( 'ok' === $notice[0] ? 'success' : ( 'warn' === $notice[0] ? 'warning' : 'error' ) ); ?> is-dismissible"><p><?php echo esc_html( $notice[1] ); ?></p></div>
			<?php endif; ?>

			<h2 class="title"><?php esc_html_e( 'Connection', 'nyoni-app-bridge' ); ?></h2>
			<form method="post" action="options.php">
				<?php settings_fields( self::GROUP ); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><label for="nab_server"><?php esc_html_e( 'App server URL', 'nyoni-app-bridge' ); ?></label></th>
						<td><input name="<?php echo esc_attr( NAB_OPT_SERVER ); ?>" id="nab_server" type="url" class="regular-text code" value="<?php echo esc_attr( get_option( NAB_OPT_SERVER, NAB_DEFAULT_SERVER ) ); ?>"><p class="description"><?php esc_html_e( 'No trailing slash.', 'nyoni-app-bridge' ); ?></p></td>
					</tr>
					<tr>
						<th scope="row"><label for="nab_returns"><?php esc_html_e( 'Allowed return URLs', 'nyoni-app-bridge' ); ?></label></th>
						<td><textarea name="<?php echo esc_attr( NAB_OPT_RETURNS ); ?>" id="nab_returns" rows="3" class="large-text code"><?php echo esc_textarea( get_option( NAB_OPT_RETURNS, NAB_DEFAULT_RETURNS ) ); ?></textarea><p class="description"><?php esc_html_e( 'One prefix per line. The app’s sign-in "return" must start with one of these.', 'nyoni-app-bridge' ); ?></p></td>
					</tr>
					<tr>
						<th scope="row"><label for="nab_club"><?php esc_html_e( 'Club product IDs', 'nyoni-app-bridge' ); ?></label></th>
						<td><input name="<?php echo esc_attr( NAB_OPT_CLUB_IDS ); ?>" id="nab_club" type="text" class="regular-text code" value="<?php echo esc_attr( get_option( NAB_OPT_CLUB_IDS, '' ) ); ?>"><p class="description"><?php esc_html_e( 'Product or subscription IDs that grant Nyoni Club. Comma-separated.', 'nyoni-app-bridge' ); ?></p></td>
					</tr>
					<tr>
						<th scope="row"><label for="nab_days"><?php esc_html_e( 'Club length (days)', 'nyoni-app-bridge' ); ?></label></th>
						<td><input name="<?php echo esc_attr( NAB_OPT_CLUB_DAYS ); ?>" id="nab_days" type="number" min="1" class="small-text" value="<?php echo esc_attr( (string) get_option( NAB_OPT_CLUB_DAYS, 365 ) ); ?>"><p class="description"><?php esc_html_e( 'Used only when WooCommerce Subscriptions is not installed.', 'nyoni-app-bridge' ); ?></p></td>
					</tr>
				</table>
				<?php submit_button( __( 'Save settings', 'nyoni-app-bridge' ) ); ?>
			</form>

			<h2 class="title"><?php esc_html_e( 'Bridge secret', 'nyoni-app-bridge' ); ?></h2>
			<p style="max-width:60em;color:#50575e"><?php esc_html_e( 'Copy this into Railway as NYONI_BRIDGE_SECRET. Keep it private — never paste it into chat or email.', 'nyoni-app-bridge' ); ?></p>
			<?php if ( $show_secret ) : ?>
			<p><strong>Shown once. Save this value securely before leaving this page.</strong></p>
			<p><input type="text" autocomplete="off" class="large-text code" readonly value="<?php echo esc_attr( nab_secret() ); ?>" onclick="this.select()"></p>
			<?php else : ?><p>Secret is configured and hidden. Regenerate it if you need a new copy.</p><?php endif; ?>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" onsubmit="return confirm('<?php echo esc_js( __( 'Generate a new secret? The old one stops working immediately and must be updated in Railway.', 'nyoni-app-bridge' ) ); ?>');">
				<input type="hidden" name="action" value="nab_regen">
				<?php wp_nonce_field( 'nab_regen' ); ?>
				<?php submit_button( __( 'Regenerate secret', 'nyoni-app-bridge' ), 'secondary', 'submit', false ); ?>
			</form>

			<h2 class="title"><?php esc_html_e( 'Actions', 'nyoni-app-bridge' ); ?></h2>
			<p>
				<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="display:inline">
					<input type="hidden" name="action" value="nab_test">
					<?php wp_nonce_field( 'nab_test' ); ?>
					<?php submit_button( __( 'Test connection', 'nyoni-app-bridge' ), 'secondary', 'submit', false ); ?>
				</form>
				&nbsp;
				<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="display:inline">
					<input type="hidden" name="action" value="nab_sync">
					<?php wp_nonce_field( 'nab_sync' ); ?>
					<?php submit_button( __( 'Send catalogue to app', 'nyoni-app-bridge' ), 'primary', 'submit', false ); ?>
				</form>
			</p>

			<h2 class="title"><?php esc_html_e( 'WooCommerce webhooks', 'nyoni-app-bridge' ); ?></h2>
			<?php $hooks = NAB_Webhooks::active_count(); ?>
			<p style="max-width:60em;color:#50575e"><?php echo esc_html( sprintf( /* translators: %d: active webhook count. */ __( '%d of 5 app webhooks are active (products and orders, sent by WooCommerce to the app server). The button creates any that are missing and updates the rest.', 'nyoni-app-bridge' ), $hooks ) ); ?></p>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="nab_webhooks">
				<?php wp_nonce_field( 'nab_webhooks' ); ?>
				<?php submit_button( 5 === $hooks ? __( 'Update app webhooks', 'nyoni-app-bridge' ) : __( 'Create app webhooks', 'nyoni-app-bridge' ), 5 === $hooks ? 'secondary' : 'primary', 'submit', false ); ?>
			</form>

			<?php if ( $progress ) : ?><p aria-live="polite"><?php echo esc_html( sprintf( 'Catalogue: %d products in %d batches; %d accepted, %d pending (%d retrying), %d failed. Refresh to update.', $progress['products'], $progress['batches'], $progress['accepted'], $progress['pending'], $progress['retrying'], $progress['failed'] ) ); ?></p><?php endif; ?>

			<h2 class="title"><?php esc_html_e( 'Recent events', 'nyoni-app-bridge' ); ?></h2>
			<table class="widefat striped" style="max-width:60em">
				<thead><tr>
					<th><?php esc_html_e( 'Time (UTC)', 'nyoni-app-bridge' ); ?></th>
					<th><?php esc_html_e( 'Event', 'nyoni-app-bridge' ); ?></th>
					<th><?php esc_html_e( 'Status', 'nyoni-app-bridge' ); ?></th>
					<th><?php esc_html_e( 'Detail', 'nyoni-app-bridge' ); ?></th>
				</tr></thead>
				<tbody>
				<?php if ( empty( $log ) ) : ?>
					<tr><td colspan="4"><?php esc_html_e( 'No events yet.', 'nyoni-app-bridge' ); ?></td></tr>
				<?php else : ?>
					<?php foreach ( $log as $row ) : ?>
						<tr>
							<td class="code"><?php echo esc_html( $row['time'] ?? '' ); ?></td>
							<td class="code"><?php echo esc_html( $row['type'] ?? '' ); ?></td>
							<td><?php echo esc_html( $row['status'] ?? '' ); ?></td>
							<td><?php echo esc_html( $row['error'] ?? '' ); ?></td>
						</tr>
					<?php endforeach; ?>
				<?php endif; ?>
				</tbody>
			</table>
		</div>
		<?php
	}
}
