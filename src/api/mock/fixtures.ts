import type {
  ColorInfo,
  GarmentKind,
  Look,
  Money,
  Outfit,
  Product,
  StylistMessage,
  StyleProfile,
  WardrobeCategory,
  WardrobeItem,
} from '../types';
import { buildCapsuleCatalog, type InventoryOverride } from '../catalog/capsule';

/*
 * Demo fixtures. Products come from the real Nyoni capsule export; the wardrobe, looks and chat
 * content are sample data from the design concepts, not customer data.
 */

export const usd = (dollars: number): Money => ({ amountMinor: Math.round(dollars * 100), currency: 'USD' });

export const COLORS = {
  berry: { name: 'Berry', hex: '#5E1F2C' },
  midnight: { name: 'Midnight', hex: '#1B2233' },
  navy: { name: 'Navy', hex: '#1F2A44' },
  ivory: { name: 'Ivory', hex: '#EFE8DA' },
  charcoal: { name: 'Charcoal', hex: '#3A3B3F' },
  onyx: { name: 'Onyx', hex: '#141416' },
  burgundy: { name: 'Burgundy', hex: '#5A1A28' },
  cognac: { name: 'Cognac', hex: '#7A4527' },
  brown: { name: 'Brown', hex: '#5A3522' },
  white: { name: 'White', hex: '#F4F2EE' },
  grey: { name: 'Grey', hex: '#7C7B78' },
  camel: { name: 'Camel', hex: '#B08A5B' },
  black: { name: 'Black', hex: '#101012' },
  tortoise: { name: 'Tortoise', hex: '#4B3423' },
} satisfies Record<string, ColorInfo>;

/** Colors offered when reviewing imported clothes. */
export const COLOR_OPTIONS: ColorInfo[] = [
  COLORS.navy,
  COLORS.midnight,
  COLORS.black,
  COLORS.charcoal,
  COLORS.grey,
  COLORS.white,
  COLORS.ivory,
  COLORS.camel,
  COLORS.brown,
  COLORS.cognac,
  COLORS.berry,
  COLORS.burgundy,
  { name: 'Green', hex: '#3D4A3A' },
  { name: 'Blue', hex: '#3E5C83' },
];

export const PATTERN_OPTIONS = ['Solid', 'Pinstripe', 'Check', 'Herringbone', 'Textured', 'Polka dot', 'Patterned'];

/** The catalog is the real Nyoni capsule (src/api/catalog) with any admin-panel edits applied. */
export function buildCatalog(inventory: Record<string, InventoryOverride> = {}): Product[] {
  return buildCapsuleCatalog(inventory);
}

const WARDROBE_SEEDS: {
  key: string;
  name: string;
  category: WardrobeCategory;
  kind: GarmentKind;
  color: ColorInfo;
  pattern: string;
  tryOnEligible: boolean;
}[] = [
  { key: 'navy-blazer', name: 'Navy Blazer', category: 'jackets', kind: 'jacket', color: COLORS.navy, pattern: 'Solid', tryOnEligible: true },
  { key: 'ivory-shirt', name: 'Ivory Shirt', category: 'shirts', kind: 'shirt', color: COLORS.ivory, pattern: 'Solid', tryOnEligible: true },
  { key: 'charcoal-trousers', name: 'Charcoal Trousers', category: 'trousers', kind: 'trousers', color: COLORS.charcoal, pattern: 'Solid', tryOnEligible: true },
  { key: 'brown-loafers', name: 'Brown Loafers', category: 'shoes', kind: 'shoes', color: COLORS.brown, pattern: 'Solid', tryOnEligible: false },
  { key: 'ivory-knit', name: 'Ivory Knit', category: 'knitwear', kind: 'knitwear', color: { name: 'Ivory', hex: '#E6DCC6' }, pattern: 'Textured', tryOnEligible: true },
  { key: 'white-sneakers', name: 'White Sneakers', category: 'shoes', kind: 'shoes', color: COLORS.white, pattern: 'Solid', tryOnEligible: false },
  { key: 'leather-belt', name: 'Leather Belt', category: 'accessories', kind: 'accessory', color: COLORS.brown, pattern: 'Solid', tryOnEligible: false },
  { key: 'sunglasses', name: 'Sunglasses', category: 'accessories', kind: 'accessory', color: COLORS.tortoise, pattern: 'Patterned', tryOnEligible: false },
  { key: 'navy-pocket-square', name: 'Pocket Square', category: 'accessories', kind: 'accessory', color: COLORS.navy, pattern: 'Polka dot', tryOnEligible: false },
  { key: 'grey-flannel-trousers', name: 'Grey Flannel Trousers', category: 'trousers', kind: 'trousers', color: COLORS.grey, pattern: 'Solid', tryOnEligible: true },
  { key: 'white-oxford-shirt', name: 'White Oxford Shirt', category: 'shirts', kind: 'shirt', color: COLORS.white, pattern: 'Solid', tryOnEligible: true },
  { key: 'camel-overcoat', name: 'Camel Overcoat', category: 'jackets', kind: 'jacket', color: COLORS.camel, pattern: 'Solid', tryOnEligible: true },
];

export const wardrobeId = (key: string) => `w-${key}`;

export function buildWardrobe(now: number): WardrobeItem[] {
  return WARDROBE_SEEDS.map((seed, index) => {
    // Newest first, so the four concept pieces lead the grid.
    const created = new Date(now - (index + 1) * 36e5).toISOString();
    return {
      id: wardrobeId(seed.key),
      name: seed.name,
      category: seed.category,
      kind: seed.kind,
      color: seed.color,
      pattern: seed.pattern,
      brand: null,
      size: null,
      availability: 'ready',
      archived: false,
      favorite: false,
      ownership: 'owned',
      provenance: 'demo',
      photos: [],
      tryOnEligible: seed.tryOnEligible,
      createdAt: created,
      updatedAt: created,
    };
  });
}

export function buildOutfits(now: number): Outfit[] {
  const at = (hoursAgo: number) => new Date(now - hoursAgo * 36e5).toISOString();
  const owned = (key: string) => ({ kind: 'owned' as const, itemId: wardrobeId(key) });
  return [
    {
      id: 'o-dinner-look',
      title: 'Your dinner look',
      occasion: 'dinner',
      explanation: 'Navy and ivory keep it polished.',
      items: [owned('navy-blazer'), owned('ivory-shirt'), owned('charcoal-trousers'), owned('brown-loafers')],
      complement: { productId: 'p-venez-2' },
      saved: false,
      ownedOnly: false,
      createdAt: at(0.2),
    },
    {
      id: 'o-dinner-in-navy',
      title: 'Dinner in navy',
      occasion: 'dinner',
      explanation: 'Navy and ivory keep it polished.',
      items: [
        owned('navy-blazer'),
        owned('ivory-shirt'),
        owned('charcoal-trousers'),
        owned('brown-loafers'),
        owned('navy-pocket-square'),
      ],
      complement: null,
      saved: true,
      ownedOnly: true,
      createdAt: at(30),
    },
    {
      id: 'o-weekend-refined',
      title: 'Weekend refined',
      occasion: 'everyday',
      explanation: 'Soft ivory layers relax the charcoal.',
      items: [
        owned('ivory-shirt'),
        owned('charcoal-trousers'),
        owned('ivory-knit'),
        owned('white-sneakers'),
        owned('leather-belt'),
        owned('sunglasses'),
      ],
      complement: null,
      saved: true,
      ownedOnly: true,
      createdAt: at(52),
    },
  ];
}

export function buildThread(now: number): StylistMessage[] {
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 6e4).toISOString();
  return [
    { id: 'm-1', role: 'user', text: 'Style my navy blazer for dinner.', createdAt: at(12) },
    {
      id: 'm-2',
      role: 'assistant',
      text: 'Try these pieces from your closet.',
      createdAt: at(12),
      outfitId: 'o-dinner-look',
      status: 'ok',
    },
  ];
}

export function buildDemoLooks(now: number): Look[] {
  const day = 864e5;
  return [
    {
      id: 'l-demo-navy',
      jobId: 'j-demo-navy',
      garment: { kind: 'product', productId: 'p-navy-aztec-blazer' },
      garmentTitle: 'Indigo Jacquard Tailored Blazer',
      garmentKind: 'jacket',
      garmentColor: COLORS.navy,
      saved: true,
      reported: false,
      status: 'active',
      garmentAvailable: true,
      createdAt: new Date(now - 9 * day).toISOString(),
      expiresAt: new Date(now + 21 * day).toISOString(),
      isDemo: true,
    },
    {
      id: 'l-demo-charcoal',
      jobId: 'j-demo-charcoal',
      garment: { kind: 'product', productId: 'p-grayson' },
      garmentTitle: 'Charcoal Three Piece Suit',
      garmentKind: 'suit',
      garmentColor: { name: 'Charcoal', hex: '#3A3A3A' },
      saved: true,
      reported: false,
      status: 'expired',
      garmentAvailable: true,
      createdAt: new Date(now - 34 * day).toISOString(),
      expiresAt: new Date(now - 4 * day).toISOString(),
      isDemo: true,
    },
  ];
}

export function defaultStyleProfile(now: number): StyleProfile {
  return {
    occasions: ['business', 'dinner'],
    styleDirection: 'classic',
    budget: null,
    ownedFirst: true,
    city: null,
    updatedAt: new Date(now).toISOString(),
  };
}
