import { createHash, randomBytes } from 'node:crypto';

import type { Context, Next } from 'hono';
import { z } from 'zod';

import { currentCatalog } from './catalog';
import { pool } from './db';
import { env } from './env';
import { HttpError } from './errors';
import { eraseCustomer, permalinkPath, storeProductsById, storeProductsByPath, type StoreOrder } from './woo/data';
import { sizeOf, variationForSize } from './woo/catalog';
import { signCheckout, verifyLoginToken } from './woo/signing';

/**
 * Members: shoppers signed in with their nyonicouture.com account. The store's login page
 * hands the app a two-minute token (Nyoni App Bridge plugin); the server checks it once and
 * returns an app session. Orders and Club status arrive from the store separately.
 */

export type Member = { id: string; wooCustomerId: number; email: string | null; firstName: string | null; lastName: string | null };

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export const signInSchema = z.object({
  token: z.string().min(20).max(4000),
  state: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/),
});

export async function signInWithStore(input: unknown, deviceId: string | null) {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) throw new HttpError('validation', 'This sign-in link is incomplete. Sign in again.');
  const claims = verifyLoginToken(parsed.data.token, parsed.data.state);

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('delete from used_login_tokens where expires_at < now() - interval \'1 day\'');
    // Single use: a second request with the same token id is refused.
    const used = await client.query('insert into used_login_tokens (jti, expires_at) values ($1, to_timestamp($2)) on conflict do nothing', [claims.jti, claims.exp]);
    if (used.rowCount === 0) throw new HttpError('unauthorized', 'This sign-in link was already used. Sign in again.');
    const { rows } = await client.query<{ id: string }>(
      `insert into members (woo_customer_id, email, first_name, last_name, last_sign_in_at) values ($1, $2, $3, $4, now())
       on conflict (woo_customer_id) do update set email = excluded.email, first_name = excluded.first_name,
         last_name = excluded.last_name, last_sign_in_at = now()
       returning id`,
      [Number(claims.sub), claims.email ?? null, claims.given_name ?? null, claims.family_name ?? null],
    );
    const memberId = rows[0].id;
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + env.memberSessionDays * 86_400_000);
    await client.query('insert into member_sessions (token_hash, member_id, expires_at) values ($1, $2, $3)', [hash(token), memberId, expiresAt]);
    if (deviceId) await client.query('update devices set member_id = $2 where id = $1', [deviceId, memberId]);
    await client.query('commit');
    return { sessionToken: token, expiresAt: expiresAt.toISOString(), member: await memberView(memberId) };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function memberFor(token: string | null): Promise<Member | null> {
  if (!token) return null;
  const { rows } = await pool.query<{ id: string; woo_customer_id: string; email: string | null; first_name: string | null; last_name: string | null }>(
    `select m.id, m.woo_customer_id, m.email, m.first_name, m.last_name from member_sessions s
     join members m on m.id = s.member_id where s.token_hash = $1 and s.expires_at > now()`,
    [hash(token)],
  );
  const row = rows[0];
  return row ? { id: row.id, wooCustomerId: Number(row.woo_customer_id), email: row.email, firstName: row.first_name, lastName: row.last_name } : null;
}

/** Requires `Authorization: Member <token>`. */
export async function requireMember(c: Context, next: Next) {
  const token = c.req.header('authorization')?.match(/^Member (.+)$/)?.[1] ?? null;
  const member = await memberFor(token);
  if (!member) throw new HttpError('unauthorized', 'Sign in with your Nyoni account again.');
  c.set('member', member);
  c.set('token', token);
  c.header('Cache-Control', 'no-store');
  await next();
}

export async function signOutMember(token: string) {
  await pool.query('delete from member_sessions where token_hash = $1', [hash(token)]);
}

const PAID = new Set(['processing', 'completed']);
const GONE = new Set(['cancelled', 'refunded', 'failed', 'trash', 'checkout-draft']);

/** The member's profile, Club status and purchases, with each item matched to the app's catalog. */
export async function memberView(memberId: string) {
  const { rows } = await pool.query<{ woo_customer_id: string; email: string | null; first_name: string | null; last_name: string | null }>(
    'select woo_customer_id, email, first_name, last_name from members where id = $1',
    [memberId],
  );
  const member = rows[0];
  if (!member) throw new HttpError('unauthorized', 'Sign in with your Nyoni account again.');
  const customerId = Number(member.woo_customer_id);

  const membership = (
    await pool.query<{ status: string; started_at: Date | null; expires_at: Date | null }>(
      'select status, started_at, expires_at from memberships where woo_customer_id = $1',
      [customerId],
    )
  ).rows[0];
  const clubActive =
    !!membership && (membership.status === 'active' || membership.status === 'pending_cancel') && (!membership.expires_at || membership.expires_at > new Date());

  const orders = (await pool.query<{ data: StoreOrder }>("select data from woo_orders where customer_id = $1 order by (data->>'createdAt') desc nulls last limit 50", [customerId])).rows.map((r) => r.data);
  const storeProducts = await storeProductsById([...new Set(orders.flatMap((o) => o.items.map((i) => i.productId)))]);
  const catalog = await currentCatalog();
  const byPath = new Map(catalog.filter((p) => p.storeUrl).map((p) => [permalinkPath(p.storeUrl!), p]));

  return {
    member: { email: member.email, firstName: member.first_name, lastName: member.last_name },
    club: membership
      ? { active: clubActive, status: membership.status, startedAt: membership.started_at?.toISOString() ?? null, expiresAt: membership.expires_at?.toISOString() ?? null }
      : { active: false, status: 'none', startedAt: null, expiresAt: null },
    orders: orders
      .filter((order) => !GONE.has(order.status))
      .map((order) => ({
        id: order.id,
        number: order.number,
        status: order.status,
        paid: PAID.has(order.status),
        createdAt: order.createdAt,
        total: order.total,
        currency: order.currency,
        items: order.items.map((item) => {
          const store = storeProducts.get(item.productId);
          const variation = store?.variations.find((v) => v.id === item.variationId);
          const product = store ? byPath.get(permalinkPath(store.permalink)) : undefined;
          return {
            name: item.name,
            quantity: item.quantity,
            /** The app catalog's product, when the piece is one the app knows. */
            productId: product?.id ?? null,
            size: (variation && sizeOf(variation)) ?? Object.values(item.attributes)[0] ?? null,
            image: variation?.image ?? store?.images[0] ?? null,
          };
        }),
      })),
  };
}

/** "Delete my account" in the app: the app server's copy now; staff erase the store account. */
export async function deleteMember(member: Member) {
  await eraseCustomer(member.wooCustomerId, 'app');
}

/* ---------------------------------------------------------------------------------- checkout */

export const checkoutSchema = z.object({
  lines: z
    .array(z.object({ productId: z.string().max(80), variantId: z.string().max(120), quantity: z.number().int().min(1).max(10) }))
    .min(1)
    .max(30),
});

/**
 * Re-checks the bag against the live catalog, then builds the store checkout link with a new
 * `nyoni_app` reference. The order that comes back through the webhook carries the reference,
 * which is how the app learns the store confirmed it.
 */
export async function createCheckout(deviceId: string, input: unknown) {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) throw new HttpError('validation', 'Your bag is empty.');
  const catalog = await currentCatalog();
  const resolved = parsed.data.lines.map((line) => {
    const product = catalog.find((p) => p.id === line.productId);
    const variant = product?.variants.find((v) => v.id === line.variantId);
    if (!product || !variant || product.discontinued) throw new HttpError('conflict', `${product?.title ?? 'A piece in your bag'} is no longer available.`);
    if (variant.stockCount < line.quantity) throw new HttpError('conflict', `${product.title} in ${variant.size.label} has only ${variant.stockCount} left.`);
    return { line, product, variant };
  });

  const store = await storeProductsByPath(resolved.map(({ product }) => (product.storeUrl ? permalinkPath(product.storeUrl) : '')).filter(Boolean));
  const items = resolved.map(({ line, product, variant }) => {
    const match = product.storeUrl ? store.get(permalinkPath(product.storeUrl)) : undefined;
    if (!match) throw new HttpError('unavailable', 'Checkout in the app isn’t connected to the store yet. Finish on nyonicouture.com.');
    const storeId = match.type === 'variable' ? variationForSize(match, variant.size.label)?.id : match.id;
    if (!storeId) throw new HttpError('conflict', `${product.title} in ${variant.size.label} isn’t sold on the store right now.`);
    return { id: storeId, quantity: line.quantity, line, priceMinor: variant.price.amountMinor };
  });

  // Same store item twice (two bag lines for one size) becomes one quantity.
  const merged = new Map<number, number>();
  for (const item of items) merged.set(item.id, (merged.get(item.id) ?? 0) + item.quantity);
  const list = [...merged].map(([id, qty]) => `${id}:${qty}`).join(',');

  const ref = `na_${randomBytes(18).toString('base64url')}`;
  await pool.query('insert into checkouts (ref, device_id, lines) values ($1, $2, $3)', [ref, deviceId, JSON.stringify(items.map(({ id, quantity, line, priceMinor }) => ({ storeId: id, quantity, productId: line.productId, variantId: line.variantId, priceMinor })))]);
  const url =
    env.checkoutMode === 'signed'
      ? `${env.storeUrl}/nyoni-checkout/?items=${list}&nyoni_app=${ref}&sig=${signCheckout(list, ref)}`
      : `${env.storeUrl}/checkout-link/?products=${list}&nyoni_app=${ref}`;
  return { ref, url, totalMinor: items.reduce((sum, item) => sum + item.priceMinor * item.quantity, 0) };
}

/** What the store says about the order made from a checkout link. Only the store confirms. */
export async function checkoutStatus(deviceId: string, ref: string) {
  const known = await pool.query('select 1 from checkouts where ref = $1 and device_id = $2', [ref, deviceId]);
  if (known.rowCount === 0) throw new HttpError('not_found', 'This checkout has expired.');
  const { rows } = await pool.query<{ data: StoreOrder }>('select data from woo_orders where app_ref = $1 order by updated_at desc limit 1', [ref]);
  const order = rows[0]?.data;
  if (!order) return { status: 'waiting' as const, orderNumber: null };
  const status = PAID.has(order.status)
    ? ('paid' as const)
    : order.status === 'refunded'
      ? ('refunded' as const)
      : GONE.has(order.status)
        ? ('cancelled' as const)
        : ('pending' as const);
  return { status, orderNumber: order.number, total: order.total, currency: order.currency };
}
