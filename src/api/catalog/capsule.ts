import type {
  ColorInfo,
  GarmentKind,
  MediaImage,
  Money,
  Occasion,
  Product,
  ProductCategory,
  ProductPiece,
  StockStatus,
  TryOnEligibility,
  Variant,
} from '../types';
import { capsuleImages } from './capsuleImages';
import capsuleRows from './nyoni-capsule.json';

/**
 * The Nyoni capsule: real products from nyonicouture.com, one row per wearable piece
 * (nyoni-capsule.json / .csv). Suits have one row per part (jacket, trousers, waistcoat)
 * sharing `sold_as`, and only the suit carries a price.
 *
 * Sizes and stock are not in the export yet, so every product gets sample sizes
 * (`sizesAreSamples`) until the store sync supplies real variants.
 */

export type CapsuleRow = {
  key: string;
  group: string;
  name: string;
  category: 'outerwear' | 'bottom' | 'vest' | 'shoes' | 'accessory';
  subcategory: string;
  colour: string;
  colour_hex: string;
  pattern: string;
  material: string;
  formality: 'formal' | 'smart-casual' | 'casual';
  fit: string;
  season: string;
  price_usd: number | '';
  sold_as: string;
  sold_as_price_usd: number | '';
  brand: string;
  product_url: string;
  image: string;
  description: string;
};

/**
 * Corrections where a row's attribute contradicts its own description (for example a
 * windowpane jacket exported as "solid"). Colour matching relies on these, so they're
 * applied here and listed for the Nyoni team to confirm. Delete an entry to use the
 * export's value.
 */
const CORRECTIONS: Record<string, Partial<Pick<CapsuleRow, 'pattern' | 'material' | 'season'>>> = {
  'nyoni-evano-windowpane-jacket': { pattern: 'windowpane' },
  'nyoni-evano-windowpane-trousers': { pattern: 'windowpane' },
  'nyoni-evano-windowpane-vest': { pattern: 'windowpane' },
  'nyoni-perseo-jacket': { pattern: 'herringbone' },
  'nyoni-perseo-trousers': { pattern: 'herringbone' },
  'nyoni-vicenzo': { pattern: 'melange' },
  'nyoni-james-blazer': { pattern: 'glen check' },
  'nyoni-thomson-blazer': { season: 'spring summer autumn winter' },
  'nyoni-ivoire-blazer-2': { season: 'spring summer autumn winter' },
  'nyoni-hematite': { pattern: 'windowpane' },
  'nyoni-gabbro': { pattern: 'marbled' },
  'nyoni-monaco-cap-toe': { material: 'calfskin' },
  'nyoni-silvano-2': { pattern: 'foliate print' },
  'nyoni-belagio-2': { pattern: 'paisley' },
  'nyoni-venez-2': { pattern: 'baroque print' },
  'nyoni-serenata-2': { pattern: 'stripe' },
  'nyoni-black-belt-2': { material: 'calfskin' },
};

const FEATURED = new Set(['p-nathan', 'p-navy-aztec-blazer']);

/** Sample stock so the low-stock and sold-out states stay visible in the demo. */
const SAMPLE_STOCK: Record<string, Record<string, { status: StockStatus; count: number }>> = {
  'p-nathan': { '42': { status: 'low_stock', count: 1 }, '44': { status: 'out_of_stock', count: 0 } },
};

const SIZES: Record<'jacket' | 'waist' | 'shoes' | 'one', [string, string][]> = {
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

function applyCorrections(row: CapsuleRow): CapsuleRow {
  return { ...row, ...CORRECTIONS[row.key] };
}

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

function sizesFor(kind: GarmentKind, row: CapsuleRow): [string, string][] {
  if (row.subcategory === 'pocket square') return SIZES.one;
  if (kind === 'shoes') return SIZES.shoes;
  if (kind === 'trousers' || row.subcategory === 'belt') return SIZES.waist;
  return SIZES.jacket;
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

function imageFor(row: CapsuleRow): MediaImage | undefined {
  const asset = capsuleImages[row.key];
  return asset ? { asset, alt: row.name } : undefined;
}

function toPiece(row: CapsuleRow): ProductPiece {
  return {
    key: row.key,
    name: row.name,
    kind: PIECE_KIND[row.category],
    color: { name: titleCase(row.colour), hex: row.colour_hex },
    pattern: row.pattern,
    material: row.material,
    formality: row.formality,
    fit: row.fit || null,
    seasons: row.season.split(/\s+/).filter(Boolean),
    image: imageFor(row),
  };
}

export function buildCapsuleCatalog(): Product[] {
  const byProduct = new Map<string, CapsuleRow[]>();
  for (const raw of capsuleRows as CapsuleRow[]) {
    const row = applyCorrections(raw);
    byProduct.set(row.product_url, [...(byProduct.get(row.product_url) ?? []), row]);
  }

  return [...byProduct.values()].map((rows) => {
    const [first] = rows;
    const id = productId(rows);
    const isSuit = first.group === 'Suits';
    const title = isSuit ? first.sold_as : first.name;
    // Suit parts have no price of their own; the suit's price sits in sold_as_price_usd.
    const dollars = Number(first.price_usd || first.sold_as_price_usd);
    const pieces = rows.map(toPiece);
    const kind: GarmentKind = isSuit ? 'suit' : pieces[0].kind;
    const color: ColorInfo = pieces[0].color;
    const seen = new Set<number>();
    const images = pieces
      .map((piece) => piece.image)
      .filter((image): image is MediaImage => !!image?.asset && !seen.has(image.asset) && !!seen.add(image.asset));

    const variants: Variant[] = sizesFor(kind, first).map(([code, label]) => {
      const stock = SAMPLE_STOCK[id]?.[code];
      return {
        id: `${id}-${code}`,
        productId: id,
        size: { code, label },
        color,
        price: usd(dollars),
        stock: stock?.status ?? 'in_stock',
        stockCount: stock?.count ?? 8,
      };
    });

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
      sizesAreSamples: true,
      storeUrl: first.product_url,
    };
  });
}
