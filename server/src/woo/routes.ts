import { Hono } from 'hono';

import { pool } from '../db';
import { HttpError } from '../errors';
import {
  deleteProduct,
  eraseCustomer,
  modifiedOf,
  orderFrom,
  productFrom,
  saveCustomer,
  saveMembership,
  saveOrder,
  saveProduct,
  saveVariation,
} from './data';
import { verifyBridgeEvent, verifyWebhook } from './signing';
import { catalogMatchSummary } from './catalog';

/**
 * What the store sends: bridge events from the Nyoni App Bridge plugin, and WooCommerce's own
 * webhooks for products and orders. Both are signed; neither needs the server to call the store.
 */
export function storeRoutes() {
  const app = new Hono();

  app.post('/bridge', async (c) => {
    const raw = await c.req.text();
    verifyBridgeEvent(raw, c.req.header('x-nyoni-timestamp'), c.req.header('x-nyoni-signature'));
    const eventId = c.req.header('x-nyoni-event-id') ?? '';
    if (!/^[A-Za-z0-9-]{8,80}$/.test(eventId)) throw new HttpError('validation', 'Missing event id.');
    const seen = await pool.query('select 1 from woo_events where event_id = $1', [eventId]);
    if (seen.rowCount) return c.json({ ok: true, duplicate: true });

    let event: { type?: unknown; data?: unknown };
    try {
      event = JSON.parse(raw);
    } catch {
      throw new HttpError('validation', 'The body isn’t JSON.');
    }
    const type = typeof event.type === 'string' ? event.type : '';
    const data = (event.data && typeof event.data === 'object' ? event.data : {}) as Record<string, unknown>;
    let reply: Record<string, unknown> = { ok: true };

    switch (type) {
      case 'ping':
        reply = { ok: true, server: 'nyoni-app', received: 'ping' };
        break;
      case 'catalog.batch': {
        const products = Array.isArray(data.products) ? data.products : [];
        for (const product of products) await saveProduct(productFrom(product), null);
        reply = { ok: true, saved: products.length, batch: data.batch ?? null, of: data.of ?? null };
        console.log(`Store catalogue batch ${String(data.batch ?? '?')}/${String(data.of ?? '?')}: ${products.length} products`);
        if (data.batch !== undefined && data.batch === data.of) console.log(await catalogMatchSummary());
        break;
      }
      case 'customer.orders': {
        await saveCustomer(data.customer);
        const orders = Array.isArray(data.orders) ? data.orders : [];
        for (const order of orders) await saveOrder(orderFrom(order), null);
        reply = { ok: true, saved: orders.length };
        break;
      }
      case 'membership.updated':
        await saveMembership(data);
        break;
      case 'account.deleted': {
        const id = Number((data.customer as { id?: unknown } | undefined)?.id);
        if (Number.isInteger(id) && id > 0) await eraseCustomer(id, 'store');
        break;
      }
      default:
        // A newer plugin may send events this server doesn't know yet; accept and skip them.
        console.warn(`Ignored store event type ${type.slice(0, 40)}`);
        reply = { ok: true, ignored: true };
    }
    await pool.query('insert into woo_events (event_id, type) values ($1, $2) on conflict do nothing', [eventId, type.slice(0, 40) || 'unknown']);
    return c.json(reply);
  });

  app.post('/webhooks', async (c) => {
    const raw = await c.req.text();
    // WooCommerce checks a new webhook's URL with an unsigned "webhook_id=…" ping.
    if (/^webhook_id=\d+$/.test(raw.trim())) return c.json({ ok: true });
    verifyWebhook(raw, c.req.header('x-wc-webhook-signature'));
    const topic = c.req.header('x-wc-webhook-topic') ?? '';
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new HttpError('validation', 'The body isn’t JSON.');
    }
    const [resource, action] = topic.split('.');
    console.log(`Store webhook ${topic.slice(0, 40)} ${Number(body.id) || ''}`);
    if (resource === 'product') {
      if (action === 'deleted') await deleteProduct(Number(body.id));
      else if (body.type === 'variation' || Number(body.parent_id) > 0) await saveVariation(body);
      else await saveProduct(productFrom(body), modifiedOf(body));
    } else if (resource === 'order') {
      if (action === 'deleted') await pool.query('delete from woo_orders where id = $1', [Number(body.id)]);
      else await saveOrder(orderFrom(body), modifiedOf(body));
    }
    return c.json({ ok: true });
  });

  return app;
}
