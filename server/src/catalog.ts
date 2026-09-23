import { readFileSync } from 'node:fs';

import { z } from 'zod';

import {
  buildCapsuleCatalog,
  type CapsuleRow,
  type InventoryOverride,
} from '../../shared/catalog/capsule';
import type { Product } from '../../src/api/types';
import { pool } from './db';
import { HttpError } from './errors';

const rows = JSON.parse(
  readFileSync(new URL('../../shared/catalog/nyoni-capsule.json', import.meta.url), 'utf8'),
) as CapsuleRow[];

/** The export without edits; used to check product ids and to reset. */
const baseCatalog = buildCapsuleCatalog(rows);
const baseIds = new Set(baseCatalog.map((product) => product.id));

type InventoryRow = { product_id: string; price_minor: number; currency: string; sizes: InventoryOverride['sizes']; updated_at: Date };

async function overrides(): Promise<Record<string, InventoryOverride>> {
  const { rows: saved } = await pool.query<InventoryRow>('select * from inventory');
  return Object.fromEntries(
    saved.map((row) => [
      row.product_id,
      {
        price: { amountMinor: row.price_minor, currency: 'USD' as const },
        sizes: row.sizes,
        updatedAt: row.updated_at.toISOString(),
      },
    ]),
  );
}

/** The live catalog: the capsule export with staff edits applied. Images come from the app bundle. */
export async function currentCatalog(): Promise<Product[]> {
  return buildCapsuleCatalog(rows, { inventory: await overrides() });
}

export async function currentProduct(productId: string): Promise<Product> {
  const product = (await currentCatalog()).find((p) => p.id === productId);
  if (!product) throw new HttpError('not_found', 'This product is no longer in the catalog.');
  return product;
}

export const inventoryUpdateSchema = z.object({
  price: z.object({
    amountMinor: z.number().int().min(1).max(10_000_000),
    currency: z.literal('USD'),
  }),
  sizes: z
    .array(
      z.object({
        label: z.string().trim().min(1, 'Every size needs a label.').max(40),
        stockCount: z.number().int().min(0).max(999),
      }),
    )
    .min(1, 'Add at least one size.')
    .max(40),
});

export async function updateInventory(productId: string, input: unknown, staffId: string): Promise<Product> {
  if (!baseIds.has(productId)) throw new HttpError('not_found', 'This product is no longer in the catalog.');
  const parsed = inventoryUpdateSchema.safeParse(input);
  if (!parsed.success) throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'Check the sizes and price.');
  const { price, sizes } = parsed.data;
  const labels = sizes.map((size) => size.label.toLowerCase());
  if (new Set(labels).size !== labels.length) throw new HttpError('validation', 'Two sizes have the same label.');

  const client = await pool.connect();
  try {
    await client.query('begin');
    const before = await client.query('select price_minor, sizes from inventory where product_id = $1 for update', [productId]);
    await client.query(
      `insert into inventory (product_id, price_minor, currency, sizes, updated_at, updated_by)
       values ($1, $2, $3, $4, now(), $5)
       on conflict (product_id) do update
         set price_minor = excluded.price_minor, currency = excluded.currency, sizes = excluded.sizes,
             updated_at = now(), updated_by = excluded.updated_by`,
      [productId, price.amountMinor, price.currency, JSON.stringify(sizes), staffId],
    );
    await client.query(
      'insert into inventory_audit (product_id, staff_id, action, before, after) values ($1, $2, $3, $4, $5)',
      [productId, staffId, 'update', before.rows[0] ? JSON.stringify(before.rows[0]) : null, JSON.stringify({ price_minor: price.amountMinor, sizes })],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  return currentProduct(productId);
}

export async function resetInventory(productId: string, staffId: string): Promise<Product> {
  if (!baseIds.has(productId)) throw new HttpError('not_found', 'This product is no longer in the catalog.');
  const removed = await pool.query('delete from inventory where product_id = $1 returning price_minor, sizes', [productId]);
  await pool.query('insert into inventory_audit (product_id, staff_id, action, before) values ($1, $2, $3, $4)', [
    productId,
    staffId,
    'reset',
    removed.rows[0] ? JSON.stringify(removed.rows[0]) : null,
  ]);
  return currentProduct(productId);
}
