import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { z } from 'zod';

import { sessionFor, signIn, signOut, type StaffSession } from './auth';
import { currentCatalog, resetInventory, updateInventory } from './catalog';
import { pool } from './db';
import { env } from './env';
import { errorBody, HttpError } from './errors';

type Env = { Variables: { staff: StaffSession; token: string } };

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
  app.use('/v1/*', bodyLimit({ maxSize: 64 * 1024 }));

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
  return app;
}
