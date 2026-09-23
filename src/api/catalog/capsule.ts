import type { Product } from '../types';
import {
  buildCapsuleCatalog as buildFromRows,
  type CapsuleRow,
  type ImageLookup,
  type InventoryOverride,
} from '../../../shared/catalog/capsule';
import capsuleRows from '../../../shared/catalog/nyoni-capsule.json';
import { capsuleImages } from './capsuleImages';

export { applyInventory, sizeCodes, stockStatus, type InventoryOverride } from '../../../shared/catalog/capsule';

/** The capsule's photos are bundled with the app (assets/collection), keyed by capsule key. */
const imageFor: ImageLookup = (key, alt) => {
  const asset = capsuleImages[key];
  return asset ? { asset, alt } : undefined;
};

/** The capsule catalog with the app's bundled photos. */
export function buildCapsuleCatalog(inventory: Record<string, InventoryOverride> = {}): Product[] {
  return buildFromRows(capsuleRows as CapsuleRow[], { inventory, imageFor });
}

/** Adds bundled photos to products that come from the server, which sends none. */
export function withBundledImages(product: Product): Product {
  const pieces = product.pieces.map((piece) => ({ ...piece, image: piece.image ?? imageFor(piece.key, piece.name) }));
  const cover = pieces[0]?.image;
  return { ...product, pieces, images: product.images.length || !cover ? product.images : [{ ...cover, alt: product.title }] };
}
