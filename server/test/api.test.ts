import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

// Test configuration must be set before the server modules read it.
process.env.DATABASE_URL ??= 'postgres://postgres@localhost:55432/nyoni_test?host=/tmp';
process.env.ADMIN_EMAIL = 'staff@example.com';
process.env.ADMIN_PASSWORD = 'correct-horse-battery';

const { pool, migrate } = await import('../src/db');
const { ensureBootstrapAdmin, prepareAuth } = await import('../src/auth');
const { createApp } = await import('../src/app');

const app = createApp();
const call = (path: string, init: RequestInit & { token?: string; client?: string } = {}) => {
  const headers = new Headers(init.headers);
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  if (init.body) headers.set('content-type', 'application/json');
  headers.set('x-forwarded-for', init.client ?? '203.0.113.7');
  return app.request(path, { ...init, headers });
};
const signIn = async (password = 'correct-horse-battery', email = 'staff@example.com', client?: string) =>
  call('/v1/admin/sessions', { method: 'POST', body: JSON.stringify({ email, password }), client });

before(async () => {
  await pool.query('drop schema public cascade; create schema public;');
  await migrate();
  await prepareAuth();
  await ensureBootstrapAdmin();
});
after(async () => {
  await pool.end();
});

describe('catalog', () => {
  it('serves the 31 capsule products without images', async () => {
    const res = await call('/v1/catalog');
    assert.equal(res.status, 200);
    const products = await res.json();
    assert.equal(products.length, 31);
    const nathan = products.find((p: { id: string }) => p.id === 'p-nathan');
    assert.equal(nathan.price.amountMinor, 89500);
    assert.equal(nathan.pieces.length, 3);
    assert.deepEqual(nathan.images, []);
  });
});

describe('staff sessions', () => {
  it('rejects admin calls without a session', async () => {
    const res = await call('/v1/admin/products');
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error.code, 'unauthorized');
  });

  it('rejects a wrong password and accepts the right one', async () => {
    assert.equal((await signIn('wrong-password-1')).status, 401);
    const res = await signIn();
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(body.token.length > 30);
    assert.equal(body.session.email, 'staff@example.com');
    const session = await call('/v1/admin/session', { token: body.token });
    assert.equal(session.status, 200);
  });

  it('stores only a hash of the session token', async () => {
    const { token } = await (await signIn()).json();
    const { rows } = await pool.query('select token_hash from staff_sessions');
    assert.ok(rows.every((row) => row.token_hash !== token));
  });

  it('pauses sign-in after five failures for an email', async () => {
    for (let i = 0; i < 5; i += 1) await signIn('nope-nope-nope', 'locked@example.com', '198.51.100.9');
    const res = await signIn('nope-nope-nope', 'locked@example.com', '198.51.100.9');
    assert.equal(res.status, 429);
    assert.match((await res.json()).error.message, /Too many attempts/);
  });

  it('signs out', async () => {
    const { token } = await (await signIn()).json();
    assert.equal((await call('/v1/admin/session', { method: 'DELETE', token })).status, 204);
    assert.equal((await call('/v1/admin/session', { token })).status, 401);
  });
});

describe('inventory', () => {
  let token = '';
  before(async () => {
    token = (await (await signIn()).json()).token;
  });

  it('validates updates', async () => {
    const put = (body: unknown) =>
      call('/v1/admin/products/p-chalcedony/inventory', { method: 'PUT', token, body: JSON.stringify(body) });
    const price = { amountMinor: 22500, currency: 'USD' };
    assert.equal((await put({ price, sizes: [] })).status, 400);
    assert.equal((await put({ price, sizes: [{ label: 'M', stockCount: -1 }] })).status, 400);
    const dup = await put({ price, sizes: [{ label: 'M', stockCount: 1 }, { label: 'm', stockCount: 2 }] });
    assert.equal((await dup.json()).error.message, 'Two sizes have the same label.');
    const missing = await call('/v1/admin/products/p-nope/inventory', {
      method: 'PUT',
      token,
      body: JSON.stringify({ price, sizes: [{ label: 'M', stockCount: 1 }] }),
    });
    assert.equal(missing.status, 404);
  });

  it('applies edits to the public catalog and resets them', async () => {
    const res = await call('/v1/admin/products/p-chalcedony/inventory', {
      method: 'PUT',
      token,
      body: JSON.stringify({
        price: { amountMinor: 24000, currency: 'USD' },
        sizes: [
          { label: '38US / 48EU', stockCount: 4 },
          { label: '40US / 50EU', stockCount: 1 },
          { label: '42US / 52EU', stockCount: 0 },
        ],
      }),
    });
    assert.equal(res.status, 200);
    const updated = await res.json();
    assert.equal(updated.sizeSource, 'admin');
    assert.deepEqual(
      updated.variants.map((v: { size: { code: string }; stock: string }) => [v.size.code, v.stock]),
      [['38', 'in_stock'], ['40', 'low_stock'], ['42', 'out_of_stock']],
    );

    const catalog = await (await call('/v1/catalog')).json();
    assert.equal(catalog.find((p: { id: string }) => p.id === 'p-chalcedony').price.amountMinor, 24000);

    const audit = await pool.query('select action from inventory_audit where product_id = $1', ['p-chalcedony']);
    assert.deepEqual(audit.rows.map((row) => row.action), ['update']);

    const reset = await call('/v1/admin/products/p-chalcedony/inventory', { method: 'DELETE', token });
    const restored = await reset.json();
    assert.equal(restored.sizeSource, 'placeholder');
    assert.equal(restored.price.amountMinor, 22500);
  });
});
