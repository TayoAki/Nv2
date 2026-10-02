import type { Product } from '../../../src/api/types';
import { applyInventory } from '../../../shared/catalog/capsule';
import { permalinkPath, storeProductsByPath, type StoreProduct, type StoreVariation } from './data';

/**
 * Live stock and prices from the store. Catalog products are matched to store products by their
 * product page, and sizes to variations by label ("42US / 52EU" matches "42 US / 52 EU").
 */

/** Units shown for a size the store says is in stock without counting it. */
const UNCOUNTED_STOCK = 8;

export const normalizeSize = (label: string) => label.toLowerCase().replace(/[\s.]+/g, '');

/** The size a variation sells: its size attribute, or its only attribute. */
export function sizeOf(variation: StoreVariation): string | null {
  const entries = Object.entries(variation.attributes);
  const size = entries.find(([key]) => /size/i.test(key)) ?? (entries.length === 1 ? entries[0] : undefined);
  return size?.[1] ?? null;
}

/** Sold in sizes: "variable", or a plugin type like "variable-subscription". */
export const hasVariations = (product: StoreProduct) => product.type.startsWith('variable') || product.variations.length > 0;

export function variationForSize(product: StoreProduct, label: string) {
  const wanted = normalizeSize(label);
  return product.variations.find((v) => {
    const size = sizeOf(v);
    return size !== null && normalizeSize(size) === wanted;
  });
}

const units = (status: string, quantity: number | null) =>
  status === 'outofstock' ? 0 : quantity === null ? UNCOUNTED_STOCK : Math.max(0, quantity);

const cents = (price: string) => Math.round(Number(price) * 100);

/** The catalog product with the store's sizes, stock and price. */
export function withStoreData(product: Product, store: StoreProduct): Product {
  const live = store.status === 'publish';
  const sizes =
    hasVariations(store)
      ? store.variations
          .map((v) => ({ label: sizeOf(v), stockCount: live ? units(v.stockStatus, v.stockQuantity) : 0 }))
          .filter((size): size is { label: string; stockCount: number } => !!size.label)
      : [{ label: product.variants[0]?.size.label ?? 'One size', stockCount: live ? units(store.stockStatus, store.stockQuantity) : 0 }];
  const price = cents(store.price);
  // A product the plugin hasn't sent sizes for yet keeps the export's sizes.
  if (sizes.length === 0 || !(price > 0)) return product;
  return {
    ...applyInventory(product, { price: { amountMinor: price, currency: 'USD' }, sizes, updatedAt: new Date().toISOString() }),
    sizeSource: 'store',
  };
}

export async function applyStoreData(products: Product[]): Promise<Product[]> {
  const paths = products.map((p) => (p.storeUrl ? permalinkPath(p.storeUrl) : '')).filter(Boolean);
  const store = await storeProductsByPath(paths);
  if (store.size === 0) return products;
  return products.map((p) => {
    const match = p.storeUrl ? store.get(permalinkPath(p.storeUrl)) : undefined;
    return match ? withStoreData(p, match) : p;
  });
}

/** For the log after a catalogue export: how many app products the store's products cover. */
export async function catalogMatchSummary() {
  const { currentCatalogWithoutStore } = await import('../catalog');
  const products = await currentCatalogWithoutStore();
  const store = await storeProductsByPath(products.map((p) => (p.storeUrl ? permalinkPath(p.storeUrl) : '')).filter(Boolean));
  const missing = products.filter((p) => !p.storeUrl || !store.has(permalinkPath(p.storeUrl))).map((p) => p.id);
  const sizes = products.filter((p) => p.storeUrl && store.has(permalinkPath(p.storeUrl)) && withStoreData(p, store.get(permalinkPath(p.storeUrl))!) !== p).length;
  return `Store catalogue matches ${products.length - missing.length} of ${products.length} app products (${sizes} with store sizes and prices)${missing.length ? `; not found: ${missing.join(', ')}` : ''}`;
}

