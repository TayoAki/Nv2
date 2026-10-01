import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

/*
 * The store link, tested against fixtures shaped like the Nyoni App Bridge plugin's events and
 * WooCommerce's REST v3 webhooks. Secrets here are test-only.
 */
const BRIDGE_SECRET = 'a'.repeat(32) + '0123456789abcdef0123456789abcdef';
const WEBHOOK_SECRET = 'test-webhook-secret';
process.env.DATABASE_URL ??= 'postgres://postgres@localhost:55432/nyoni_test?host=/tmp';
process.env.NYONI_BRIDGE_SECRET = BRIDGE_SECRET;
process.env.WOO_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.STORE_URL = 'https://nyonicouture.com';
process.env.DEVICES_PER_HOUR = '1000';

const { pool, migrate } = await import('../src/db');
const { createApp } = await import('../src/app');

const app = createApp();
const hmac = (secret: string, data: string) => createHmac('sha256', secret).update(data).digest();

/** Signs and sends a bridge event exactly as the plugin's PHP does (secret as a text key). */
async function bridge(type: string, data: unknown, opts: { eventId?: string; timestamp?: number; secret?: string } = {}) {
  const body = JSON.stringify({ type, sentAt: new Date().toISOString(), data });
  const ts = String(opts.timestamp ?? Math.floor(Date.now() / 1000));
  return app.request('/v1/woo/bridge', {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      'x-nyoni-timestamp': ts,
      'x-nyoni-signature': hmac(opts.secret ?? BRIDGE_SECRET, `${ts}.${body}`).toString('base64'),
      'x-nyoni-event-id': opts.eventId ?? randomUUID(),
    },
  });
}

async function webhook(topic: string, payload: unknown, secret = WEBHOOK_SECRET) {
  const body = JSON.stringify(payload);
  return app.request('/v1/woo/webhooks', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', 'x-wc-webhook-topic': topic, 'x-wc-webhook-signature': hmac(secret, body).toString('base64') },
  });
}

const b64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
function loginToken(claims: Record<string, unknown>, secret = BRIDGE_SECRET) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url({ alg: 'HS256', typ: 'JWT' });
  const body = b64url({ iss: 'https://nyonicouture.com', aud: 'nyoni-app', sub: '123', email: 'ada@example.com', given_name: 'Ada', family_name: 'Mensah', iat: now, exp: now + 120, jti: randomUUID(), ...claims });
  return `${head}.${body}.${hmac(secret, `${head}.${body}`).toString('base64url')}`;
}

async function newDevice() {
  const res = await app.request('/v1/devices', { method: 'POST', headers: { 'x-forwarded-for': '198.51.100.20' } });
  return (await res.json()).token as string;
}
const asDevice = (device: string, path: string, init: RequestInit = {}) =>
  app.request(path, { ...init, headers: { authorization: `Device ${device}`, 'content-type': 'application/json', ...(init.headers ?? {}) } });

const NATHAN = {
  id: 82,
  slug: 'nathan',
  name: 'Midnight Navy Three Piece Suit',
  permalink: 'https://nyonicouture.com/product/three-piece-suit/nathan/',
  status: 'publish',
  type: 'variable',
  currency: 'USD',
  price: '850.00',
  regularPrice: '895.00',
  salePrice: '850.00',
  categories: ['Suits'],
  images: ['https://nyonicouture.com/wp-content/uploads/nathan-1.jpg'],
  stockStatus: 'instock',
  stockQuantity: null,
  variations: [
    { id: 91, sku: 'NATHAN-38', attributes: { pa_size: '38US / 48EU' }, price: '850.00', stockStatus: 'instock', stockQuantity: 3, image: null },
    { id: 92, sku: 'NATHAN-40', attributes: { pa_size: '40US / 50EU' }, price: '850.00', stockStatus: 'outofstock', stockQuantity: 0, image: 'https://nyonicouture.com/n40.jpg' },
  ],
};

const STATE = 'state_abcdefghijklmnop';

before(async () => {
  await pool.query('drop schema public cascade; create schema public;');
  await migrate();
});
after(async () => {
  await pool.end();
});

describe('bridge events', () => {
  it('tells the app sign-in is on and checkout waits for the catalogue', async () => {
    assert.deepEqual(await (await app.request('/v1/store/status')).json(), { signIn: true, checkout: false, storeUrl: 'https://nyonicouture.com' });
  });

  it('answers Test connection', async () => {
    const res = await bridge('ping', { site: 'https://nyonicouture.com', wc: '11.1.2', plugin: '1.0.1' });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).received, 'ping');
  });

  it('refuses a wrong signature, an old timestamp and a hex-decoded key', async () => {
    assert.equal((await bridge('ping', {}, { secret: 'wrong' })).status, 401);
    assert.equal((await bridge('ping', {}, { timestamp: Math.floor(Date.now() / 1000) - 400 })).status, 401);
    // The plugin uses the hex text as the key; signing with the decoded bytes must not pass.
    const decoded = Buffer.from(BRIDGE_SECRET, 'hex');
    const body = JSON.stringify({ type: 'ping', data: {} });
    const ts = String(Math.floor(Date.now() / 1000));
    const res = await app.request('/v1/woo/bridge', {
      method: 'POST',
      body,
      headers: { 'x-nyoni-timestamp': ts, 'x-nyoni-event-id': randomUUID(), 'x-nyoni-signature': createHmac('sha256', decoded).update(`${ts}.${body}`).digest('base64') },
    });
    assert.equal(res.status, 401);
  });

  it('ignores a repeated event id', async () => {
    const eventId = randomUUID();
    assert.equal((await bridge('ping', {}, { eventId })).status, 200);
    assert.equal((await (await bridge('ping', {}, { eventId })).json()).duplicate, true);
  });

  it('takes the catalogue and shows store stock and prices in the app catalog', async () => {
    const res = await bridge('catalog.batch', { batch: 1, of: 1, products: [NATHAN] });
    assert.equal((await res.json()).saved, 1);
    assert.equal((await (await app.request('/v1/store/status')).json()).checkout, true);
    const catalog = await (await app.request('/v1/catalog')).json();
    const nathan = catalog.find((p: { id: string }) => p.id === 'p-nathan');
    assert.equal(nathan.sizeSource, 'store');
    assert.equal(nathan.price.amountMinor, 85000);
    assert.deepEqual(
      nathan.variants.map((v: { size: { label: string }; stockCount: number }) => [v.size.label, v.stockCount]),
      [['38US / 48EU', 3], ['40US / 50EU', 0]],
    );
  });

  it('accepts event types it doesn’t know yet', async () => {
    assert.equal((await (await bridge('something.new', {})).json()).ignored, true);
  });
});

describe('WooCommerce webhooks', () => {
  it('answers the unsigned ping WooCommerce sends when a webhook is saved', async () => {
    const res = await app.request('/v1/woo/webhooks', { method: 'POST', body: 'webhook_id=17', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    assert.equal(res.status, 200);
  });

  it('refuses a bad signature', async () => {
    assert.equal((await webhook('product.updated', { id: 82 }, 'nope')).status, 401);
  });

  it('updates a variation’s stock and keeps the product’s other sizes', async () => {
    const res = await webhook('product.updated', {
      id: 91,
      parent_id: 82,
      type: 'variation',
      price: '850.00',
      stock_status: 'instock',
      stock_quantity: 1,
      attributes: [{ id: 1, name: 'Size', slug: 'pa_size', option: '38US / 48EU' }],
      image: { src: 'https://nyonicouture.com/n38.jpg' },
    });
    assert.equal(res.status, 200);
    const nathan = (await (await app.request('/v1/catalog')).json()).find((p: { id: string }) => p.id === 'p-nathan');
    assert.deepEqual(nathan.variants.map((v: { stockCount: number }) => v.stockCount), [1, 0]);
  });

  it('keeps variation details when a product webhook lists only ids, and skips older deliveries', async () => {
    const product = { id: 82, slug: 'nathan', name: 'Midnight Navy Three Piece Suit', permalink: NATHAN.permalink, status: 'publish', type: 'variable', price: '895.00', stock_status: 'instock', stock_quantity: null, categories: [{ name: 'Suits' }], images: [{ src: 'x' }], variations: [91, 92] };
    await webhook('product.updated', { ...product, date_modified_gmt: '2026-10-01T12:00:00' });
    await webhook('product.updated', { ...product, price: '700.00', date_modified_gmt: '2026-10-01T11:00:00' });
    const nathan = (await (await app.request('/v1/catalog')).json()).find((p: { id: string }) => p.id === 'p-nathan');
    assert.equal(nathan.price.amountMinor, 89500);
    assert.equal(nathan.variants.length, 2);
  });
});

describe('sign in with Nyoni', () => {
  it('turns a login token into a member session, once', async () => {
    const device = await newDevice();
    const token = loginToken({ state: STATE });
    const res = await asDevice(device, '/v1/auth/nyoni', { method: 'POST', body: JSON.stringify({ token, state: STATE }) });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.member.member.firstName, 'Ada');
    const me = await app.request('/v1/me', { headers: { authorization: `Member ${body.sessionToken}` } });
    assert.equal(me.status, 200);
    const again = await asDevice(device, '/v1/auth/nyoni', { method: 'POST', body: JSON.stringify({ token, state: STATE }) });
    assert.equal(again.status, 401);
    assert.match((await again.json()).error.message, /already used/);
  });

  it('refuses an expired token, the wrong state, audience or issuer, and another algorithm', async () => {
    const device = await newDevice();
    const now = Math.floor(Date.now() / 1000);
    const cases = [
      loginToken({ state: STATE, iat: now - 300, exp: now - 180 }),
      loginToken({ state: 'other_state_abcdefgh' }),
      loginToken({ state: STATE, aud: 'someone-else' }),
      loginToken({ state: STATE, iss: 'https://evil.example' }),
      loginToken({ state: STATE }, 'wrong-secret'),
      `${b64url({ alg: 'none' })}.${b64url({ sub: '123', state: STATE })}.`,
    ];
    for (const token of cases) {
      const res = await asDevice(device, '/v1/auth/nyoni', { method: 'POST', body: JSON.stringify({ token, state: STATE }) });
      assert.equal(res.status, 401, token.slice(0, 40));
    }
  });

  it('shows the member’s purchases from the store and their Club status', async () => {
    await bridge('customer.orders', {
      customer: { id: 123, email: 'ada@example.com', firstName: 'Ada', lastName: 'Mensah', createdAt: '2026-01-01T00:00:00Z' },
      orders: [
        { id: 4567, number: '4567', status: 'completed', currency: 'USD', total: '850.00', createdAt: '2026-09-01T10:00:00Z', paidAt: '2026-09-01T10:01:00Z', customerId: 123, billingEmail: 'ada@example.com', appRef: null, items: [{ productId: 82, variationId: 91, name: 'Midnight Navy Three Piece Suit - 38US / 48EU', quantity: 1, total: '850.00', attributes: { pa_size: '38US / 48EU' } }] },
        { id: 4568, number: '4568', status: 'refunded', currency: 'USD', total: '10.00', createdAt: '2026-09-02T10:00:00Z', paidAt: null, customerId: 123, billingEmail: 'ada@example.com', appRef: null, items: [] },
      ],
    });
    await bridge('membership.updated', { customer: { id: 123, email: 'ada@example.com' }, status: 'active', startedAt: '2026-09-01T00:00:00Z', expiresAt: '2099-09-01T00:00:00Z', orderId: 4570, subscriptionId: null });
    const device = await newDevice();
    const { sessionToken } = await (await asDevice(device, '/v1/auth/nyoni', { method: 'POST', body: JSON.stringify({ token: loginToken({ state: STATE }), state: STATE }) })).json();
    const me = await (await app.request('/v1/me', { headers: { authorization: `Member ${sessionToken}` } })).json();
    assert.equal(me.club.active, true);
    assert.equal(me.orders.length, 1, 'refunded orders are left out');
    assert.deepEqual(me.orders[0].items[0], { name: 'Midnight Navy Three Piece Suit - 38US / 48EU', quantity: 1, productId: 'p-nathan', size: '38US / 48EU', image: 'https://nyonicouture.com/n38.jpg' });
    const stored = await pool.query("select data from woo_orders where id = 4567");
    assert.equal(JSON.stringify(stored.rows[0].data).includes('ada@example.com'), false, 'order emails are not kept');
  });

  it('erases the member when the store deletes the account', async () => {
    await bridge('account.deleted', { customer: { id: 123, email: 'ada@example.com' }, requestedAt: new Date().toISOString() });
    const { rows } = await pool.query('select (select count(*) from members) as m, (select count(*) from woo_orders where customer_id = 123) as o');
    assert.equal(Number(rows[0].m), 0);
    assert.equal(Number(rows[0].o), 0);
  });

  it('deletes from the app and queues the store account for staff', async () => {
    const device = await newDevice();
    const { sessionToken } = await (await asDevice(device, '/v1/auth/nyoni', { method: 'POST', body: JSON.stringify({ token: loginToken({ state: STATE, sub: '555' }), state: STATE }) })).json();
    assert.equal((await app.request('/v1/me', { method: 'DELETE', headers: { authorization: `Member ${sessionToken}` } })).status, 204);
    assert.equal((await app.request('/v1/me', { headers: { authorization: `Member ${sessionToken}` } })).status, 401);
    const { rows } = await pool.query("select source, completed_at from account_deletions where woo_customer_id = 555");
    assert.equal(rows[0].source, 'app');
    assert.equal(rows[0].completed_at, null);
  });
});

describe('checkout', () => {
  it('builds the store checkout link and confirms only when the order webhook says it’s paid', async () => {
    const device = await newDevice();
    const catalog = await (await app.request('/v1/catalog')).json();
    const nathan = catalog.find((p: { id: string }) => p.id === 'p-nathan');
    const size38 = nathan.variants.find((v: { size: { label: string } }) => v.size.label === '38US / 48EU');
    const res = await asDevice(device, '/v1/checkout', { method: 'POST', body: JSON.stringify({ lines: [{ productId: 'p-nathan', variantId: size38.id, quantity: 1 }] }) });
    assert.equal(res.status, 201);
    const { ref, url } = await res.json();
    assert.match(ref, /^[A-Za-z0-9._-]{1,200}$/);
    assert.equal(url, `https://nyonicouture.com/checkout-link/?products=91:1&nyoni_app=${ref}`);

    const status = async () => (await asDevice(device, `/v1/checkout/${ref}`)).json();
    assert.equal((await status()).status, 'waiting');
    const order = { id: 5000, number: '5000', status: 'pending', currency: 'USD', total: '850.00', customer_id: 0, date_created_gmt: '2026-10-01T12:00:00', date_modified_gmt: '2026-10-01T12:00:00', line_items: [{ product_id: 82, variation_id: 91, name: 'Nathan', quantity: 1, total: '850.00', meta_data: [{ key: 'pa_size', value: '38us-48eu', display_key: 'Size', display_value: '38US / 48EU' }] }], meta_data: [{ key: 'nyoni_app_ref', value: ref }], billing: { email: 'x@example.com', address_1: '1 Road' } };
    await webhook('order.created', order);
    assert.equal((await status()).status, 'pending');
    await webhook('order.updated', { ...order, status: 'processing', date_paid_gmt: '2026-10-01T12:01:00', date_modified_gmt: '2026-10-01T12:01:00' });
    const paid = await status();
    assert.equal(paid.status, 'paid');
    assert.equal(paid.orderNumber, '5000');
    const stored = JSON.stringify((await pool.query('select data from woo_orders where id = 5000')).rows[0].data);
    assert.equal(stored.includes('1 Road') || stored.includes('x@example.com'), false, 'addresses and emails are not kept');
  });

  it('refuses a size the store has sold out', async () => {
    const device = await newDevice();
    const nathan = (await (await app.request('/v1/catalog')).json()).find((p: { id: string }) => p.id === 'p-nathan');
    const size40 = nathan.variants.find((v: { size: { label: string } }) => v.size.label === '40US / 50EU');
    const res = await asDevice(device, '/v1/checkout', { method: 'POST', body: JSON.stringify({ lines: [{ productId: 'p-nathan', variantId: size40.id, quantity: 1 }] }) });
    assert.equal(res.status, 409);
  });

  it('says so when a product isn’t linked to the store yet', async () => {
    const device = await newDevice();
    const other = (await (await app.request('/v1/catalog')).json()).find((p: { id: string; sizeSource: string }) => p.id !== 'p-nathan' && p.sizeSource !== 'placeholder');
    const res = await asDevice(device, '/v1/checkout', { method: 'POST', body: JSON.stringify({ lines: [{ productId: other.id, variantId: other.variants[0].id, quantity: 1 }] }) });
    assert.equal(res.status, 503);
  });

  it('builds the signed fallback link the plugin checks', async () => {
    const { signCheckout } = await import('../src/woo/signing');
    const expected = createHmac('sha256', BRIDGE_SECRET).update('items=91:1&nyoni_app=na_x').digest('base64url');
    assert.equal(signCheckout('91:1', 'na_x'), expected);
  });
});
