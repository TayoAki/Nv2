import type { ResolvedOutfit } from '@/api';
import type { CollagePiece } from '@/components/media/OutfitCollage';

/** Collage pieces for an outfit, using each item's own stored photo. Removed items are skipped. */
export function outfitPieces(outfit: ResolvedOutfit): CollagePiece[] {
  return outfit.resolvedItems.flatMap((resolved, index): CollagePiece[] => {
    if (resolved.status === 'missing') return [];
    if ('item' in resolved) {
      const { item } = resolved;
      return [{ key: `${index}-${item.id}`, kind: item.kind, colorHex: item.color?.hex, image: item.image, name: item.name }];
    }
    const { product } = resolved;
    return [
      {
        key: `${index}-${product.id}`,
        kind: product.kind,
        colorHex: product.color.hex,
        image: product.images[0],
        name: product.title,
      },
    ];
  });
}

export function itemName(resolved: ResolvedOutfit['resolvedItems'][number]): string {
  if (resolved.status === 'missing') return resolved.name;
  return 'item' in resolved ? resolved.item.name : resolved.product.title;
}
