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
import { createRenderBatch, keepRenderBatch, renderBatchView } from './renders';
import { recommend, stylistRequestSchema } from './stylist';

type Env = { Variables: { staff: StaffSession; token: string; device: Device } };

const bearer = (c: Context) => c.req.header('authorization')?.match(/^Bearer (.+)$/)?.[1] ?? null;

/** Best-effort client key for sign-in throttling (Railway's proxy sets X-Forwarded-For). */
const clientKey = (c: Context) => c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

export function createApp() {
  const app = new Hono<Env>();

  app.use(secureHeaders());
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
      maxSize: c.req.path === '/v1/uploads' ? 12 * 1024 * 1024 : 256 * 1024,
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

  app.route('/v1/admin', admin);

  /* AI: which provider is live, so the app can label simulated results and pick its stylist. */
  app.get('/v1/ai/status', (c) => {
    const provider = aiProvider();
    return c.json({ provider: provider.name, features: { renders: true, imports: true, stylist: !!provider.chat } });
  });

  /* Shopper devices */
  app.post('/v1/devices', async (c) => c.json(await createDevice(), 201));

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

  shopper.post('/imports', async (c) => c.json(await createImport(c.get('device').id, await c.req.json().catch(() => null)), 202));
  shopper.get('/imports/:id', async (c) => c.json(await importView(c.get('device').id, c.req.param('id'))));

  shopper.post('/stylist', async (c) => {
    const parsed = stylistRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw new HttpError('validation', 'Ask your stylist something first.');
    return c.json(await recommend(parsed.data));
  });

  app.route('/v1', shopper);
  return app;
}
