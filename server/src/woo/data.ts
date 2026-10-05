import type { PoolClient } from 'pg';

import { pool } from '../db';

/**
 * Store data as the server keeps it. Two sources send it in different shapes: the plugin's
 * bridge events (camelCase, variations inline) and WooCommerce's REST v3 webhooks (snake_case,
 * variation ids only). Both are normalised here. No addresses, phone numbers or payment details
 * are kept, and order emails are dropped.
 */

export type StoreVariation = {
  id: number;
  attributes: Record<string, string>;
  price: string;
  stockStatus: string;
  stockQuantity: number | null;
  image: string | null;
};

export type StoreProduct = {
  id: number;
  slug: string;
  name: string;
  permalink: string;
  status: string;
  type: string;
  price: string;
  stockStatus: string;
  stockQuantity: number | null;
  categories: string[];
  images: string[];
  /** Ids from the store, in its order. A webhook sends ids only; details come from the plugin. */
  variationIds: number[];
  variations: StoreVariation[];
};

export type StoreOrderItem = {
  productId: number;
  variationId: number;
  name: string;
  quantity: number;
  total: string;
  attributes: Record<string, string>;
};

export type StoreOrder = {
  id: number;
  number: string;
  status: string;
  currency: string;
  total: string;
  createdAt: string | null;
  paidAt: string | null;
  customerId: number;
  appRef: string | null;
  items: StoreOrderItem[];
};

type Json = Record<string, unknown>;
const obj = (value: unknown): Json => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {});
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const str = (value: unknown) => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '');
const int = (value: unknown) => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};
const intOrNull = (value: unknown) => (value === null || value === undefined || value === '' ? null : int(value));
const iso = (value: unknown) => {
  const text = str(value);
  if (!text) return null;
  // REST "_gmt" dates have no zone; they are UTC.
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(text) ? text : `${text}Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/** The path of a product page, so `https://nyonicouture.com/product/x/` matches however it's written. */
export function permalinkPath(url: string) {
  try {
    return new URL(url).pathname.replace(/\/+$/, '').toLowerCase();
  } catch {
    return url.replace(/^https?:\/\/[^/]+/, '').replace(/\/+$/, '').toLowerCase();
  }
}

/** REST attributes are `[{ name, option }]`; bridge attributes are `{ pa_size: "…" }`. */
function attributesOf(value: unknown): Record<string, string> {
  if (Array.isArray(value)) {
    return Object.fromEntries(value.map((a) => [str(obj(a).slug) || str(obj(a).name), str(obj(a).option)]).filter(([k, v]) => k && v));
  }
  return Object.fromEntries(Object.entries(obj(value)).map(([k, v]) => [k, str(v)]).filter(([, v]) => v));
}

function variationFrom(raw: unknown): StoreVariation {
  const v = obj(raw);
  const image = v.image;
  return {
    id: int(v.id),
    attributes: attributesOf(v.attributes),
    price: str(v.price),
    stockStatus: str(v.stockStatus ?? v.stock_status) || 'instock',
    stockQuantity: intOrNull(v.stockQuantity ?? v.stock_quantity),
    image: typeof image === 'string' ? image : str(obj(image).src) || null,
  };
}

/** A product from either source. */
export function productFrom(raw: unknown): StoreProduct {
  const p = obj(raw);
  const variationsRaw = arr(p.variations);
  const inline = variationsRaw.filter((v) => typeof v === 'object').map(variationFrom);
  return {
    id: int(p.id),
    slug: str(p.slug),
    name: str(p.name),
    permalink: str(p.permalink),
    status: str(p.status) || 'publish',
    type: str(p.type) || 'simple',
    price: str(p.price),
    stockStatus: str(p.stockStatus ?? p.stock_status) || 'instock',
    stockQuantity: intOrNull(p.stockQuantity ?? p.stock_quantity),
    categories: arr(p.categories).map((c) => (typeof c === 'string' ? c : str(obj(c).name))).filter(Boolean),
    images: arr(p.images).map((i) => (typeof i === 'string' ? i : str(obj(i).src))).filter(Boolean),
    variationIds: variationsRaw.map((v) => (typeof v === 'object' ? int(obj(v).id) : int(v))).filter((id) => id > 0),
    variations: inline,
  };
}

function metaValue(meta: unknown, key: string) {
  const found = arr(meta).map(obj).find((m) => m.key === key);
  return found ? str(found.value) || null : null;
}

/** An order from either source. */
export function orderFrom(raw: unknown): StoreOrder {
  const o = obj(raw);
  const rest = 'line_items' in o;
  const items = arr(rest ? o.line_items : o.items).map(obj);
  return {
    id: int(o.id),
    number: str(o.number) || str(o.id),
    status: str(o.status),
    currency: str(o.currency) || 'USD',
    total: str(o.total),
    createdAt: iso(rest ? (o.date_created_gmt ?? o.date_created) : o.createdAt),
    paidAt: iso(rest ? (o.date_paid_gmt ?? o.date_paid) : o.paidAt),
    customerId: int(rest ? o.customer_id : o.customerId),
    appRef: (rest ? metaValue(o.meta_data, 'nyoni_app_ref') : str(o.appRef) || null) || null,
    items: items.map((item) => ({
      productId: int(item.product_id ?? item.productId),
      variationId: int(item.variation_id ?? item.variationId),
      name: str(item.name),
      quantity: int(item.quantity),
      total: str(item.total),
      attributes: rest
        ? Object.fromEntries(
            arr(item.meta_data)
              .map(obj)
              .filter((m) => typeof m.key === 'string' && !String(m.key).startsWith('_'))
              // display_value is the label ("42US / 52EU"); value is the attribute slug.
              .map((m) => [str(m.display_key) || str(m.key), str(m.display_value) || str(m.value)])
              .filter(([, value]) => value),
          )
        : attributesOf(item.attributes),
    })),
  };
}

const modifiedOf = (raw: unknown) => iso(obj(raw).date_modified_gmt ?? obj(raw).date_modified ?? obj(raw).modifiedAt);

/**
 * Saves a product. A webhook (variation ids only) keeps the variation details the plugin sent
 * before; an older delivery never overwrites a newer one.
 */
export async function saveProduct(product: StoreProduct, modifiedAt: string | null, client: PoolClient | typeof pool = pool) {
  const existing = await client.query<{ data: StoreProduct; modified_at: Date | null }>('select data, modified_at from woo_products where id = $1', [product.id]);
  const before = existing.rows[0];
  if (before?.modified_at && modifiedAt && new Date(modifiedAt) < before.modified_at) return;
  let variations = product.variations;
  if (variations.length === 0 && product.variationIds.length && before) {
    const keep = new Set(product.variationIds);
    variations = before.data.variations.filter((v) => keep.has(v.id));
  }
  const data: StoreProduct = { ...product, variations };
  await client.query(
    `insert into woo_products (id, permalink_path, data, modified_at) values ($1, $2, $3, $4)
     on conflict (id) do update set permalink_path = excluded.permalink_path, data = excluded.data,
       modified_at = coalesce(excluded.modified_at, woo_products.modified_at), updated_at = now()`,
    [product.id, permalinkPath(product.permalink), data, modifiedAt],
  );
}

/** A webhook for one variation (REST type `variation`): updated inside its parent product. */
export async function saveVariation(raw: unknown) {
  const v = obj(raw);
  const parentId = int(v.parent_id);
  const variation = variationFrom(v);
  const { rows } = await pool.query<{ data: StoreProduct }>('select data from woo_products where id = $1', [parentId]);
  if (!rows[0]) return; // The parent arrives with the catalogue export.
  const data = rows[0].data;
  const others = data.variations.filter((other) => other.id !== variation.id);
  const variations = [...others, variation].sort((a, b) => data.variationIds.indexOf(a.id) - data.variationIds.indexOf(b.id));
  await pool.query('update woo_products set data = $2, updated_at = now() where id = $1', [parentId, { ...data, variations }]);
}

export async function deleteProduct(id: number) {
  await pool.query('delete from woo_products where id = $1', [id]);
}

/** Saves an order unless a newer copy is already stored. */
export async function saveOrder(order: StoreOrder, modifiedAt: string | null) {
  await pool.query(
    `insert into woo_orders (id, customer_id, app_ref, status, data, modified_at) values ($1, $2, $3, $4, $5, $6)
     on conflict (id) do update set customer_id = excluded.customer_id, app_ref = coalesce(excluded.app_ref, woo_orders.app_ref),
       status = excluded.status, data = excluded.data, modified_at = coalesce(excluded.modified_at, woo_orders.modified_at), updated_at = now()
     where woo_orders.modified_at is null or excluded.modified_at is null or excluded.modified_at >= woo_orders.modified_at`,
    [order.id, order.customerId || null, order.appRef, order.status, order, modifiedAt],
  );
}

export { modifiedOf };

export type MembershipStatus = 'active' | 'expired' | 'cancelled' | 'on_hold' | 'pending_cancel';

export async function saveMembership(raw: unknown) {
  const m = obj(raw);
  const customerId = int(obj(m.customer).id);
  if (!customerId) return;
  await pool.query(
    `insert into memberships (woo_customer_id, status, started_at, expires_at, order_id, subscription_id) values ($1, $2, $3, $4, $5, $6)
     on conflict (woo_customer_id) do update set status = excluded.status, started_at = excluded.started_at,
       expires_at = excluded.expires_at, order_id = excluded.order_id, subscription_id = excluded.subscription_id, updated_at = now()`,
    [customerId, str(m.status) || 'expired', iso(m.startedAt), iso(m.expiresAt), intOrNull(m.orderId), intOrNull(m.subscriptionId)],
  );
}

/** Updates a signed-in member's name and email from the store's customer record. */
export async function saveCustomer(raw: unknown) {
  const c = obj(raw);
  const id = int(c.id);
  if (!id) return;
  await pool.query('update members set email = coalesce($2, email), first_name = coalesce($3, first_name), last_name = coalesce($4, last_name) where woo_customer_id = $1', [
    id,
    str(c.email) || null,
    str(c.firstName) || null,
    str(c.lastName) || null,
  ]);
}

/**
 * Everything the app server holds for a store customer: member, sessions, orders and
 * membership. Devices stay (they belong to the phone) but are unlinked.
 */
export async function eraseCustomer(customerId: number, source: 'store' | 'app') {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('delete from members where woo_customer_id = $1', [customerId]);
    await client.query('delete from woo_orders where customer_id = $1', [customerId]);
    await client.query('delete from memberships where woo_customer_id = $1', [customerId]);
    // From the store, the account is already being erased there. From the app, staff erase it.
    await client.query('insert into account_deletions (woo_customer_id, source, completed_at) values ($1, $2, $3)', [
      customerId,
      source,
      source === 'store' ? new Date() : null,
    ]);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

/** Stock and price for catalog products, by product page path. */
export async function storeProductsByPath(paths: string[]): Promise<Map<string, StoreProduct>> {
  if (paths.length === 0) return new Map();
  const { rows } = await pool.query<{ permalink_path: string; data: StoreProduct }>(
    'select permalink_path, data from woo_products where permalink_path = any($1)',
    [paths],
  );
  return new Map(rows.map((row) => [row.permalink_path, row.data]));
}

export async function storeProductsById(ids: number[]): Promise<Map<number, StoreProduct>> {
  if (ids.length === 0) return new Map();
  const { rows } = await pool.query<{ id: string; data: StoreProduct }>('select id, data from woo_products where id = any($1)', [ids]);
  return new Map(rows.map((row) => [Number(row.id), row.data]));
}
