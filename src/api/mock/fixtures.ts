import type {
  ColorInfo,
  GarmentKind,
  Look,
  Money,
  Occasion,
  Outfit,
  Product,
  ProductCategory,
  StockStatus,
  StylistMessage,
  StyleProfile,
  TryOnEligibility,
  WardrobeCategory,
  WardrobeItem,
} from '../types';

/*
 * Illustrative fixtures only. Product names, prices, wardrobe contents and chat content are
 * sample data from the design concepts, not store records or customer data. The $895 Berry Peak
 * price is the plan's research snapshot, not a live price.
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

const SIZES = {
  jacket: [
    ['38', '38 US / 48 EU'],
    ['40', '40 US / 50 EU'],
    ['42', '42 US / 52 EU'],
    ['44', '44 US / 54 EU'],
  ],
  trousers: [
    ['30', '30 waist'],
    ['32', '32 waist'],
    ['34', '34 waist'],
    ['36', '36 waist'],
  ],
  shirt: [
    ['15', '15 collar'],
    ['15.5', '15.5 collar'],
    ['16', '16 collar'],
    ['16.5', '16.5 collar'],
  ],
  shoes: [
    ['8', 'US 8'],
    ['9', 'US 9'],
    ['10', 'US 10'],
    ['11', 'US 11'],
  ],
  one: [['OS', 'One size']],
} as const;

type ProductSeed = {
  slug: string;
  title: string;
  category: ProductCategory;
  kind: GarmentKind;
  color: ColorInfo;
  price: number;
  occasions: Occasion[];
  sizes: keyof typeof SIZES;
  tryOn: TryOnEligibility;
  description: string;
  featured?: boolean;
  /** Per-size stock overrides; everything else is in stock. */
  stock?: Record<string, { status: StockStatus; count: number }>;
};

const PRODUCT_SEEDS: ProductSeed[] = [
  {
    slug: 'midnight-wool-suit-jacket',
    title: 'Midnight Wool Suit Jacket',
    category: 'jackets',
    kind: 'jacket',
    color: COLORS.midnight,
    price: 595,
    occasions: ['business', 'wedding', 'dinner'],
    sizes: 'jacket',
    featured: true,
    tryOn: { eligible: true, category: 'tops' },
    description: 'A single-breasted jacket in midnight wool with notch lapels and a clean, structured shoulder.',
  },
  {
    slug: 'midnight-wool-trousers',
    title: 'Midnight Wool Trousers',
    category: 'trousers',
    kind: 'trousers',
    color: COLORS.midnight,
    price: 295,
    occasions: ['business', 'wedding'],
    sizes: 'trousers',
    featured: true,
    tryOn: { eligible: true, category: 'bottoms' },
    description: 'Flat-front trousers in midnight wool, cut to pair with the matching suit jacket.',
  },
  {
    slug: 'berry-peak-two-piece-suit',
    title: 'Berry Peak Two Piece Suit',
    category: 'suits',
    kind: 'suit',
    color: COLORS.berry,
    price: 895,
    occasions: ['wedding', 'dinner'],
    sizes: 'jacket',
    tryOn: {
      eligible: true,
      category: 'tops',
      scopeNote: 'Jacket only. The matching trousers are not part of this preview.',
    },
    description: 'A two-piece suit in deep berry with notch lapels and matching trousers. No waistcoat.',
    stock: { '42': { status: 'low_stock', count: 1 }, '44': { status: 'out_of_stock', count: 0 } },
  },
  {
    slug: 'navy-blazer',
    title: 'Navy Blazer',
    category: 'jackets',
    kind: 'jacket',
    color: COLORS.navy,
    price: 545,
    occasions: ['business', 'dinner', 'everyday'],
    sizes: 'jacket',
    tryOn: { eligible: true, category: 'tops' },
    description: 'An unstructured navy blazer that moves from the office to dinner.',
  },
  {
    slug: 'ivory-shirt',
    title: 'Ivory Shirt',
    category: 'shirts',
    kind: 'shirt',
    color: COLORS.ivory,
    price: 145,
    occasions: ['business', 'wedding', 'dinner', 'everyday'],
    sizes: 'shirt',
    tryOn: { eligible: true, category: 'tops' },
    description: 'A crisp ivory cotton shirt with a spread collar.',
  },
  {
    slug: 'charcoal-trousers',
    title: 'Charcoal Trousers',
    category: 'trousers',
    kind: 'trousers',
    color: COLORS.charcoal,
    price: 245,
    occasions: ['business', 'everyday'],
    sizes: 'trousers',
    tryOn: { eligible: true, category: 'bottoms' },
    description: 'Charcoal wool trousers with a gentle taper.',
  },
  {
    slug: 'ivory-dinner-jacket',
    title: 'Ivory Dinner Jacket',
    category: 'tuxedos',
    kind: 'jacket',
    color: { name: 'Ivory', hex: '#E9E0CE' },
    price: 695,
    occasions: ['black-tie', 'wedding'],
    sizes: 'jacket',
    tryOn: { eligible: true, category: 'tops' },
    description: 'A shawl-collar dinner jacket in ivory for warm-weather black tie.',
  },
  {
    slug: 'onyx-shawl-tuxedo',
    title: 'Onyx Shawl Tuxedo',
    category: 'tuxedos',
    kind: 'suit',
    color: COLORS.onyx,
    price: 1150,
    occasions: ['black-tie', 'wedding'],
    sizes: 'jacket',
    tryOn: { eligible: false, reasonIfIneligible: "Try-on isn't available for this piece yet." },
    description: 'A black shawl-lapel tuxedo with satin facings and side-striped trousers.',
  },
  {
    slug: 'pleated-tuxedo-shirt',
    title: 'Pleated Tuxedo Shirt',
    category: 'shirts',
    kind: 'shirt',
    color: COLORS.white,
    price: 175,
    occasions: ['black-tie'],
    sizes: 'shirt',
    tryOn: { eligible: true, category: 'tops' },
    description: 'A white formal shirt with a pleated bib and turndown collar.',
  },
  {
    slug: 'cognac-leather-loafers',
    title: 'Cognac Leather Loafers',
    category: 'shoes',
    kind: 'shoes',
    color: COLORS.cognac,
    price: 325,
    occasions: ['business', 'dinner', 'wedding'],
    sizes: 'shoes',
    tryOn: { eligible: false, reasonIfIneligible: "Shoes can't be previewed yet." },
    description: 'Penny loafers in polished cognac leather.',
  },
  {
    slug: 'black-patent-oxfords',
    title: 'Black Patent Oxfords',
    category: 'shoes',
    kind: 'shoes',
    color: COLORS.black,
    price: 365,
    occasions: ['black-tie'],
    sizes: 'shoes',
    tryOn: { eligible: false, reasonIfIneligible: "Shoes can't be previewed yet." },
    description: 'Formal oxfords in black patent leather.',
  },
  {
    slug: 'burgundy-pocket-square',
    title: 'Burgundy Pocket Square',
    category: 'accessories',
    kind: 'accessory',
    color: COLORS.burgundy,
    price: 45,
    occasions: ['wedding', 'dinner', 'black-tie', 'business'],
    sizes: 'one',
    tryOn: { eligible: false, reasonIfIneligible: "Accessories can't be previewed." },
    description: 'A silk pocket square in deep burgundy. A refined touch for evening.',
  },
  {
    slug: 'black-silk-bow-tie',
    title: 'Black Silk Bow Tie',
    category: 'accessories',
    kind: 'accessory',
    color: COLORS.black,
    price: 65,
    occasions: ['black-tie'],
    sizes: 'one',
    tryOn: { eligible: false, reasonIfIneligible: "Accessories can't be previewed." },
    description: 'A self-tie bow tie in black silk.',
  },
];

export function buildCatalog(): Product[] {
  return PRODUCT_SEEDS.map((seed) => {
    const id = `p-${seed.slug}`;
    return {
      id,
      slug: seed.slug,
      title: seed.title,
      vendor: 'Nyoni Couture',
      category: seed.category,
      kind: seed.kind,
      occasions: seed.occasions,
      description: seed.description,
      color: seed.color,
      images: [],
      price: usd(seed.price),
      featured: seed.featured ?? false,
      isIllustrative: true,
      tryOn: seed.tryOn,
      variants: SIZES[seed.sizes].map(([code, label]) => {
        const stock = seed.stock?.[code];
        return {
          id: `${id}-${code}`,
          productId: id,
          size: { code, label },
          color: seed.color,
          price: usd(seed.price),
          stock: stock?.status ?? 'in_stock',
          stockCount: stock?.count ?? 8,
        };
      }),
    };
  });
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
      complement: { productId: 'p-burgundy-pocket-square' },
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
      garment: { kind: 'product', productId: 'p-navy-blazer' },
      garmentTitle: 'Navy Blazer',
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
      id: 'l-demo-berry',
      jobId: 'j-demo-berry',
      garment: { kind: 'product', productId: 'p-berry-peak-two-piece-suit' },
      garmentTitle: 'Berry Peak Two Piece Suit',
      garmentKind: 'suit',
      garmentColor: COLORS.berry,
      scopeNote: 'Jacket only. The matching trousers are not part of this preview.',
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
