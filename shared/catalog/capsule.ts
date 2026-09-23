import type {
  ColorInfo,
  GarmentKind,
  InventorySize,
  MediaImage,
  Money,
  Occasion,
  Product,
  ProductCategory,
  ProductPiece,
  StockStatus,
  TryOnEligibility,
  Variant,
} from '../../src/api/types';

/*
 * Shared by the app (src/api/catalog) and the server (server/). Pure: no image assets, file
 * access or platform code, so both can build the same catalog from nyoni-capsule.json.
 */

/**
 * The Nyoni capsule: real products from nyonicouture.com, one row per wearable piece
 * (nyoni-capsule.json / .csv). Suits have one row per part (jacket, trousers, waistcoat)
 * sharing `sold_as`, and only the suit carries a price.
 *
 * `sizes_available` lists the sizes in stock. Where it's empty, the product gets sample
 * sizes (`sizesAreSamples`) until the store sync supplies them.
 */

export type CapsuleRow = {
  key: string;
  group: string;
  name: string;
  category: 'outerwear' | 'bottom' | 'vest' | 'shoes' | 'accessory';
  subcategory: string;
  colour: string;
  /** Up to three hex values measured from the photo, most dominant first. */
  hex_measured: string;
  pattern: string;
  material: string;
  formality: 'formal' | 'smart-casual' | 'casual';
  fit: string;
  season: string;
  in_stock: boolean;
  /** Pipe-separated store size labels, e.g. "36US / 46EU | 38US / 48EU". Empty when not listed. */
  sizes_available: string;
  price_usd: number | '';
  sold_as: string;
  sold_as_price_usd: number | '';
  brand: string;
  product_url: string;
  image: string;
  description: string;
};

const FEATURED = new Set(['p-nathan', 'p-navy-aztec-blazer']);

/**
 * Sizes, stock and price set in the admin panel. They replace the export's values until the
 * WooCommerce sync takes over stock.
 */
export type InventoryOverride = { price: Money; sizes: InventorySize[]; updatedAt: string };

/** Units per size when the export only says "in stock". */
const DEFAULT_STOCK = 8;

/** Placeholder sizes for products whose export lists none; editable in the admin panel. */
const SAMPLE_SIZES: Record<'jacket' | 'waist' | 'shoes' | 'one', [string, string][]> = {
  jacket: [
    ['38', '38 US / 48 EU'],
    ['40', '40 US / 50 EU'],
    ['42', '42 US / 52 EU'],
    ['44', '44 US / 54 EU'],
  ],
  waist: [
    ['30', '30 waist'],
    ['32', '32 waist'],
    ['34', '34 waist'],
    ['36', '36 waist'],
  ],
  shoes: [
    ['8', 'US 8'],
    ['9', 'US 9'],
    ['10', 'US 10'],
    ['11', 'US 11'],
  ],
  one: [['OS', 'One size']],
};

const PIECE_KIND: Record<CapsuleRow['category'], GarmentKind> = {
  outerwear: 'jacket',
  bottom: 'trousers',
  vest: 'waistcoat',
  shoes: 'shoes',
  accessory: 'accessory',
};

const usd = (dollars: number): Money => ({ amountMinor: Math.round(dollars * 100), currency: 'USD' });

const titleCase = (text: string) => text.replace(/\b\w/g, (c) => c.toUpperCase());

function productId(rows: CapsuleRow[]): string {
  const [first] = rows;
  const base = first.group === 'Suits' ? first.key.replace(/-(jacket|trousers|vest)$/, '') : first.key;
  return `p-${base.replace(/^nyoni-/, '')}`;
}

function productCategory(row: CapsuleRow): ProductCategory {
  switch (row.group) {
    case 'Suits':
      return row.product_url.includes('/tuxedo/') ? 'tuxedos' : 'suits';
    case 'Blazers':
      return 'jackets';
    case 'Vests':
      return 'waistcoats';
    case 'Trousers':
      return 'trousers';
    case 'Boots':
      return 'shoes';
    default:
      return 'accessories';
  }
}

/** Occasions derived from formality and the product copy; refine with the Nyoni team. */
function occasionsFor(rows: CapsuleRow[], title: string): Occasion[] {
  const text = `${title} ${rows.map((r) => `${r.name} ${r.description}`).join(' ')}`;
  if (/tux/i.test(title)) return ['black-tie', 'wedding'];
  const set = new Set<Occasion>(
    rows[0].formality === 'formal' ? ['business', 'wedding', 'dinner'] : ['dinner', 'business', 'everyday'],
  );
  if (/black tie|evening/i.test(text)) set.add('black-tie');
  if (/wedding/i.test(text)) set.add('wedding');
  return [...set];
}

/** Store size labels as [code, label]: "36US / 46EU" → ["36", "36 US / 46 EU"]. */
function listedSizes(row: CapsuleRow): [string, string][] {
  return row.sizes_available
    .split('|')
    .map((size) => size.trim())
    .filter(Boolean)
    .map((size) => {
      const code = size.match(/^[\d.]+/)?.[0] ?? size;
      if (/^[\d.]+$/.test(size)) return [code, `Size ${size}`];
      return [code, size.replace(/(\d)(US|EU|cm)\b/g, '$1 $2')];
    });
}

function sizesFor(kind: GarmentKind, row: CapsuleRow): { sizes: [string, string][]; samples: boolean } {
  if (row.subcategory === 'pocket square') return { sizes: SAMPLE_SIZES.one, samples: false };
  const listed = listedSizes(row);
  if (listed.length) return { sizes: listed, samples: false };
  if (kind === 'shoes') return { sizes: SAMPLE_SIZES.shoes, samples: true };
  if (kind === 'trousers' || row.subcategory === 'belt') return { sizes: SAMPLE_SIZES.waist, samples: true };
  return { sizes: SAMPLE_SIZES.jacket, samples: true };
}

export function stockStatus(count: number): StockStatus {
  return count <= 0 ? 'out_of_stock' : count <= 2 ? 'low_stock' : 'in_stock';
}

/**
 * Short codes for size chips: the leading number ("36" from "36 US / 46 EU") when it's
 * unique in the list, otherwise a slug of the whole label.
 */
export function sizeCodes(labels: string[]): string[] {
  const leading = labels.map((label) => label.match(/^[\d.]+/)?.[0] ?? null);
  return labels.map((label, index) => {
    const lead = leading[index];
    if (lead && leading.filter((other) => other === lead).length === 1) return lead;
    return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `size-${index + 1}`;
  });
}

/** Applies admin edits to a catalog product. */
export function applyInventory(product: Product, override: InventoryOverride): Product {
  const codes = sizeCodes(override.sizes.map((size) => size.label));
  return {
    ...product,
    price: override.price,
    sizeSource: 'admin',
    variants: override.sizes.map((size, index) => ({
      id: `${product.id}-${codes[index]}`,
      productId: product.id,
      size: { code: codes[index], label: size.label },
      color: product.color,
      price: override.price,
      stock: stockStatus(size.stockCount),
      stockCount: size.stockCount,
    })),
  };
}

function tryOnFor(kind: GarmentKind): TryOnEligibility {
  switch (kind) {
    case 'suit':
    case 'jacket':
    case 'waistcoat':
      return { eligible: true, category: 'tops' };
    case 'trousers':
      return { eligible: true, category: 'bottoms' };
    case 'shoes':
      return { eligible: false, reasonIfIneligible: "Boots can't be previewed on their own yet." };
    default:
      return { eligible: false, reasonIfIneligible: "Accessories can't be previewed on their own." };
  }
}

/** Looks up a piece's photo by capsule key. The app passes its bundled images; the server passes none. */
export type ImageLookup = (key: string, alt: string) => MediaImage | undefined;

function swatches(row: CapsuleRow): string[] {
  return row.hex_measured.split(/\s+/).filter((hex) => /^#[0-9a-f]{6}$/i.test(hex));
}

function toPiece(row: CapsuleRow, imageFor: ImageLookup): ProductPiece {
  return {
    key: row.key,
    name: row.name,
    kind: PIECE_KIND[row.category],
    color: { name: titleCase(row.colour), hex: swatches(row)[0] },
    swatches: swatches(row),
    pattern: row.pattern,
    material: row.material,
    formality: row.formality,
    fit: row.fit || null,
    seasons: row.season.split(/\s+/).filter(Boolean),
    image: imageFor(row.key, row.name),
  };
}

export function buildCapsuleCatalog(
  capsuleRows: CapsuleRow[],
  { inventory = {}, imageFor = () => undefined }: { inventory?: Record<string, InventoryOverride>; imageFor?: ImageLookup } = {},
): Product[] {
  const byProduct = new Map<string, CapsuleRow[]>();
  for (const row of capsuleRows) {
    byProduct.set(row.product_url, [...(byProduct.get(row.product_url) ?? []), row]);
  }

  const products = [...byProduct.values()].map((rows): Product => {
    const [first] = rows;
    const id = productId(rows);
    const isSuit = first.group === 'Suits';
    const title = isSuit ? first.sold_as : first.name;
    // Suit parts have no price of their own; the suit's price sits in sold_as_price_usd.
    const dollars = Number(first.price_usd || first.sold_as_price_usd);
    const pieces = rows.map((row) => toPiece(row, imageFor));
    const kind: GarmentKind = isSuit ? 'suit' : pieces[0].kind;
    const color: ColorInfo = pieces[0].color;
    // Suit parts share the house photo of the whole suit, so the product shows it once.
    const images = pieces[0].image ? [pieces[0].image] : [];

    const { sizes, samples } = sizesFor(kind, first);
    const inStock = rows.every((row) => row.in_stock);
    const variants: Variant[] = sizes.map(([code, label]) => ({
      id: `${id}-${code}`,
      productId: id,
      size: { code, label },
      color,
      price: usd(dollars),
      stock: inStock ? 'in_stock' : 'out_of_stock',
      stockCount: inStock ? DEFAULT_STOCK : 0,
    }));

    return {
      id,
      slug: id.slice(2),
      title,
      vendor: first.brand,
      category: productCategory(first),
      kind,
      occasions: occasionsFor(rows, title),
      description: first.description,
      color,
      images: images.map((image) => ({ ...image, alt: title })),
      price: usd(dollars),
      variants,
      tryOn: tryOnFor(kind),
      featured: FEATURED.has(id),
      isIllustrative: false,
      pieces,
      sizeSource: samples ? 'placeholder' : 'store',
      storeUrl: first.product_url,
    };
  });
  return products.map((product) => (inventory[product.id] ? applyInventory(product, inventory[product.id]) : product));
}
