import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { z } from 'zod';

import { aiProvider } from './ai';
import { sessionFor, signIn, signOut, type StaffSession } from './auth';
import { deleteBlob, getBlob, putBlob } from './blobs';
import { currentCatalog, resetInventory, updateInventory } from './catalog';
import { pool } from './db';
import { createDevice, requireDevice, type Device } from './devices';
import { env } from './env';
import { errorBody, HttpError } from './errors';
import { framingOf, normalizeImage } from './images';
import { createImport, importView } from './ingest';
import { checkScanPhoto, measureBody } from './measurements';
import { checkoutStatus, createCheckout, deleteMember, memberView, requireMember, signInWithStore, signOutMember, type Member } from './members';
import { createRenderBatch, keepRenderBatch, renderBatchView } from './renders';
import { createReport, listReports, markReviewed } from './reports';
import { allowStylistMessage, recommend, stylistRequestSchema } from './stylist';
import { storeRoutes } from './woo/routes';

type Env = { Variables: { staff: StaffSession; token: string; device: Device; member: Member } };

const bearer = (c: Context) => c.req.header('authorization')?.match(/^Bearer (.+)$/)?.[1] ?? null;

/** Best-effort client key for sign-in throttling (Railway's proxy sets X-Forwarded-For). */
const clientKey = (c: Context) => c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

export function createApp() {
  const app = new Hono<Env>();

  // Images are read by the web app on another origin (the web and API services are separate),
  // so resources may be embedded cross-origin. The blob ids themselves are the permission.
  app.use(secureHeaders({ crossOriginResourcePolicy: 'cross-origin' }));
  app.use(
    '/v1/*',
    cors({
      origin: env.corsOrigins.includes('*') ? '*' : env.corsOrigins,
      allowHeaders: ['Authorization', 'Content-Type'],
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      maxAge: 600,
    }),
  );
  // Photos up to 12 MB; every other request is small JSON.
  app.use('/v1/*', (c, next) =>
    bodyLimit({
      // Photos up to 12 MB each (two for measurements); every other request is small JSON.
      // Store events carry catalogue batches of 50 products with their variations.
      maxSize: c.req.path === '/v1/uploads' ? 12 * 1024 * 1024 : c.req.path === '/v1/measurements' ? 25 * 1024 * 1024 : c.req.path === '/v1/measurements/check' ? 13 * 1024 * 1024 : c.req.path.startsWith('/v1/woo/') ? 8 * 1024 * 1024 : 256 * 1024,
      onError: (ctx) => ctx.json(errorBody('validation', 'That photo is too large. Use one under 12 MB.'), 413),
    })(c, next),
  );

  app.onError((error, c) => {
    if (error instanceof HttpError) return c.json(errorBody(error.code, error.message), error.status);
    console.error(error);
    return c.json(errorBody('server', 'Something went wrong. Please try again.'), 500);
  });
  app.notFound((c) => c.json(errorBody('not_found', 'Not found.'), 404));

  app.get('/health', async (c) => {
    await pool.query('select 1');
    return c.json({ ok: true });
  });

  /* Catalog: public. Not cached, so a staff edit (price, stock) is what the next shopper sees. */
  app.get('/v1/catalog', async (c) => {
    c.header('Cache-Control', 'no-cache');
    return c.json(await currentCatalog());
  });

  /* Staff sessions */
  const signInSchema = z.object({ email: z.string().max(200), password: z.string().max(200) });

  app.post('/v1/admin/sessions', async (c) => {
    const parsed = signInSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw new HttpError('validation', 'Enter your email and password.');
    return c.json(await signIn(parsed.data.email, parsed.data.password, clientKey(c)), 201);
  });

  const admin = new Hono<Env>();
  admin.use(async (c, next) => {
    const token = bearer(c);
    const staff = await sessionFor(token);
    if (!staff || !token) throw new HttpError('unauthorized', 'Sign in to the store admin to continue.');
    c.set('staff', staff);
    c.set('token', token);
    c.header('Cache-Control', 'no-store');
    await next();
  });

  admin.get('/session', (c) => {
    const { email, expiresAt } = c.get('staff');
    return c.json({ email, expiresAt });
  });
  admin.delete('/session', async (c) => {
    await signOut(c.get('token'));
    return c.body(null, 204);
  });
  admin.get('/products', async (c) => c.json(await currentCatalog()));
  admin.put('/products/:id/inventory', async (c) => {
    const body = await c.req.json().catch(() => null);
    return c.json(await updateInventory(c.req.param('id'), body, c.get('staff').staffId));
  });
  admin.delete('/products/:id/inventory', async (c) =>
    c.json(await resetInventory(c.req.param('id'), c.get('staff').staffId)),
  );

  admin.get('/reports', async (c) => c.json(await listReports()));

  /** The store link at a glance: what has arrived, and accounts waiting to be erased on the store. */
  admin.get('/store', async (c) => {
    const counts = await pool.query<{ products: string; variations: string; orders: string; members: string }>(
      `select (select count(*) from woo_products) as products,
              (select coalesce(sum(jsonb_array_length(data->'variations')), 0) from woo_products) as variations,
              (select count(*) from woo_orders) as orders,
              (select count(*) from members) as members`,
    );
    const events = await pool.query<{ type: string; received_at: Date }>('select type, received_at from woo_events order by received_at desc limit 20');
    const deletions = await pool.query<{ id: string; woo_customer_id: string; requested_at: Date }>(
      "select id, woo_customer_id, requested_at from account_deletions where completed_at is null order by requested_at",
    );
    const row = counts.rows[0];
    return c.json({
      configured: { bridge: !!env.bridgeSecret, webhooks: !!env.wooWebhookSecret, checkoutMode: env.checkoutMode },
      counts: { products: Number(row.products), variations: Number(row.variations), orders: Number(row.orders), members: Number(row.members) },
      recentEvents: events.rows.map((e) => ({ type: e.type, receivedAt: e.received_at.toISOString() })),
      pendingDeletions: deletions.rows.map((d) => ({ id: d.id, customerId: Number(d.woo_customer_id), requestedAt: d.requested_at.toISOString() })),
    });
  });
  admin.put('/account-deletions/:id/done', async (c) => {
    await pool.query('update account_deletions set completed_at = now() where id = $1 and completed_at is null', [c.req.param('id')]);
    return c.body(null, 204);
  });
  admin.put('/reports/:id/reviewed', async (c) => c.json(await markReviewed(c.req.param('id'))));

  app.route('/v1/admin', admin);

  /* AI: which provider is live, so the app can label simulated results and pick its stylist. */
  app.get('/v1/ai/status', (c) => {
    const provider = aiProvider();
    return c.json({ provider: provider.name, features: { renders: true, imports: true, stylist: !!provider.chat, measurements: !!(env.measureUrl && env.measureToken) } });
  });

  /* The store link: signed events from the plugin and WooCommerce. */
  app.route('/v1/woo', storeRoutes());

  /* Members (signed in with their nyonicouture.com account) */
  const members = new Hono<Env>();
  members.use(requireMember);
  members.get('/', async (c) => c.json(await memberView(c.get('member').id)));
  members.delete('/session', async (c) => {
    await signOutMember(c.get('token'));
    return c.body(null, 204);
  });
  /** "Delete my account": the app server's copy at once; the store account is queued for staff. */
  members.delete('/', async (c) => {
    await deleteMember(c.get('member'));
    return c.body(null, 204);
  });
  app.route('/v1/me', members);

  /* Shopper devices */
  app.post('/v1/devices', async (c) => c.json(await createDevice(clientKey(c)), 201));

  /* Images: the long random id is the permission to read. */
  app.get('/v1/blobs/:id', async (c) => {
    const blob = await getBlob(c.req.param('id'));
    if (!blob) throw new HttpError('not_found', 'This image has expired.');
    c.header('Content-Type', blob.contentType);
    c.header('Cache-Control', 'private, max-age=3600');
    return c.body(new Uint8Array(blob.buffer));
  });

  const shopper = new Hono<Env>();
  shopper.use(requireDevice);
  shopper.get('/device', (c) => c.json({ credits: c.get('device').credits }));
  /** "Delete my data": the device and everything stored for it (photos, renders, imports). */
  shopper.delete('/device', async (c) => {
    await pool.query('delete from devices where id = $1', [c.get('device').id]);
    return c.body(null, 204);
  });

  /** Raw image bytes. `?kind=person` for a try-on photo, `?kind=closet` for clothes to import. */
  shopper.post('/uploads', async (c) => {
    const kind = c.req.query('kind');
    if (kind !== 'person' && kind !== 'closet') throw new HttpError('validation', 'Say what the photo is for.');
    const raw = Buffer.from(await c.req.arrayBuffer());
    if (raw.length === 0) throw new HttpError('validation', 'The photo was empty. Choose it again.');
    const image = await normalizeImage(raw);
    const blobId = await putBlob(c.get('device').id, kind, image);
    return c.json({ blobId, url: `/v1/blobs/${blobId}`, width: image.width, height: image.height, framing: framingOf(image.width, image.height) }, 201);
  });
  shopper.delete('/blobs/:id', async (c) => {
    await deleteBlob(c.get('device').id, c.req.param('id'));
    return c.body(null, 204);
  });

  shopper.post('/renders', async (c) => c.json(await createRenderBatch(c.get('device').id, await c.req.json().catch(() => null)), 202));
  shopper.get('/renders/:id', async (c) => c.json(await renderBatchView(c.get('device').id, c.req.param('id'))));
  shopper.post('/renders/:id/keep', async (c) => c.json(await keepRenderBatch(c.get('device').id, c.req.param('id'))));

  /** Exchanges the store's login token for a member session, linking this device. */
  shopper.post('/auth/nyoni', async (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json(await signInWithStore(await c.req.json().catch(() => null), c.get('device').id), 201);
  });

  /** Checks the bag against the live catalog and returns the store's checkout link. */
  shopper.post('/checkout', async (c) => c.json(await createCheckout(c.get('device').id, await c.req.json().catch(() => null)), 201));
  shopper.get('/checkout/:ref', async (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json(await checkoutStatus(c.get('device').id, c.req.param('ref')));
  });

  shopper.post('/reports', async (c) => c.json(await createReport(c.get('device').id, await c.req.json().catch(() => null)), 201));

  shopper.post('/imports', async (c) => c.json(await createImport(c.get('device').id, await c.req.json().catch(() => null)), 202));
  shopper.get('/imports/:id', async (c) => c.json(await importView(c.get('device').id, c.req.param('id'))));

  shopper.post('/stylist', async (c) => {
    if (!allowStylistMessage(c.get('device').id)) {
      throw new HttpError('quota', "You've sent a lot of messages. Your stylist will be back in a little while.");
    }
    const parsed = stylistRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw new HttpError('validation', 'Ask your stylist something first.');
    return c.json(await recommend(parsed.data));
  });

  /** Front and side photos (multipart) and height; returns measurements. Photos aren't stored. */
  shopper.post('/measurements', async (c) => {
    const form = await c.req.parseBody().catch(() => null);
    if (!form) throw new HttpError('validation', 'Add a front photo and a side photo.');
    c.header('Cache-Control', 'no-store');
    return c.json(await measureBody(c.get('device').id, form));
  });

  /** One scan photo (multipart: photo, view): is the pose right? The photo isn't kept. */
  shopper.post('/measurements/check', async (c) => {
    const form = await c.req.parseBody().catch(() => null);
    if (!form) throw new HttpError('validation', 'Take the photo again.');
    c.header('Cache-Control', 'no-store');
    return c.json(await checkScanPhoto(c.get('device').id, form));
  });

  app.route('/v1', shopper);
  return app;
}
