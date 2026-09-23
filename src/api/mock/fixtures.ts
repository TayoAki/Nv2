import type {
  ColorInfo,
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

/**
 * The demo member's closet: real Nyoni capsule pieces with their photos. Suits stay whole
 * (one item, one photo). The capsule has no shirts, so outfits leave the shirt to the render,
 * which fills in a plain white shirt.
 */
const CLOSET_PRODUCTS = [
  'p-nathan',
  'p-grayson',
  'p-navy-aztec-blazer',
  'p-vicenzo',
  'p-thomson-blazer',
  'p-taupe-flat-front-tailored-dress-pants',
  'p-walnut-tweed-pant',
  'p-midnight-glen-plaid-pant',
  'p-classic-side-adjuster-dress-pants',
  'p-kenzie',
  'p-chalcedony',
  'p-antwerp-wing-tip',
  'p-chelsea-ii',
  'p-silvano-2',
  'p-venez-2',
  'p-black-belt-2',
];

const WARDROBE_CATEGORY: Record<Product['category'], WardrobeCategory> = {
  suits: 'jackets',
  tuxedos: 'jackets',
  jackets: 'jackets',
  waistcoats: 'waistcoats',
  shirts: 'shirts',
  trousers: 'trousers',
  shoes: 'shoes',
  accessories: 'accessories',
};

export const wardrobeId = (productId: string) => `w-${productId.replace(/^p-/, '')}`;

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function buildWardrobe(now: number): WardrobeItem[] {
  const catalog = buildCapsuleCatalog();
  return CLOSET_PRODUCTS.map((productId, index) => {
    const product = catalog.find((p) => p.id === productId);
    if (!product) throw new Error(`Closet fixture ${productId} is not in the capsule`);
    const [piece] = product.pieces;
    const created = new Date(now - (index + 1) * 36e5).toISOString();
    return {
      id: wardrobeId(productId),
      name: product.title,
      category: WARDROBE_CATEGORY[product.category],
      kind: product.kind,
      color: product.color,
      pattern: capitalize(piece.pattern),
      brand: product.vendor,
      size: null,
      availability: 'ready',
      archived: false,
      favorite: false,
      ownership: 'owned',
      provenance: 'demo',
      capsuleKey: piece.key,
      image: product.images[0],
      photos: product.images,
      tryOnEligible: product.tryOn.eligible,
      createdAt: created,
      updatedAt: created,
    };
  });
}

export function buildOutfits(now: number): Outfit[] {
  const at = (hoursAgo: number) => new Date(now - hoursAgo * 36e5).toISOString();
  const owned = (productId: string) => ({ kind: 'owned' as const, itemId: wardrobeId(productId) });
  return [
    {
      id: 'o-dinner-look',
      title: 'Your dinner look',
      occasion: 'dinner',
      explanation: 'Navy and taupe keep it polished.',
      items: [owned('p-navy-aztec-blazer'), owned('p-taupe-flat-front-tailored-dress-pants'), owned('p-antwerp-wing-tip')],
      complement: { productId: 'p-belagio-2' },
      saved: false,
      ownedOnly: false,
      createdAt: at(0.2),
    },
    {
      id: 'o-dinner-in-navy',
      title: 'Dinner in navy',
      occasion: 'dinner',
      explanation: 'Tonal navy with a quiet square keeps it sharp.',
      items: [owned('p-nathan'), owned('p-chelsea-ii'), owned('p-silvano-2')],
      complement: null,
      saved: true,
      ownedOnly: true,
      createdAt: at(30),
    },
    {
      id: 'o-weekend-refined',
      title: 'Weekend refined',
      occasion: 'everyday',
      explanation: 'Burnt ochre warms the midnight check.',
      items: [
        owned('p-thomson-blazer'),
        owned('p-midnight-glen-plaid-pant'),
        owned('p-antwerp-wing-tip'),
        owned('p-venez-2'),
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
