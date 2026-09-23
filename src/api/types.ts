/**
 * Domain types for the Nyoni Couture app, following the plan's entities (sections 06 and 14).
 * The store stays authoritative for products, prices, stock, orders and money.
 */

/** ISO 4217 currency code. */
export type CurrencyCode = string;

/** Money in integer minor units (cents), never floats. */
export type Money = { amountMinor: number; currency: CurrencyCode };

export type Occasion = 'wedding' | 'business' | 'black-tie' | 'dinner' | 'everyday';

export type GarmentKind =
  | 'jacket'
  | 'suit'
  | 'waistcoat'
  | 'shirt'
  | 'trousers'
  | 'shoes'
  | 'knitwear'
  | 'accessory';

/**
 * An image reference. `uri` is a remote or local file URL; `asset` is a bundled image
 * (a `require()` result). Items without either render a garment illustration placeholder.
 */
export type MediaImage = { uri?: string; asset?: number; alt: string; width?: number; height?: number };

export type ColorInfo = { name: string; hex: string };

/* ----------------------------------------------------------------- Catalog (store authoritative) */

export type ProductCategory =
  | 'suits'
  | 'tuxedos'
  | 'jackets'
  | 'waistcoats'
  | 'shirts'
  | 'trousers'
  | 'shoes'
  | 'accessories';

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

export type Variant = {
  id: string;
  productId: string;
  size: { code: string; label: string };
  color: ColorInfo;
  price: Money;
  stock: StockStatus;
  /** Units left when stock is low; used to cap quantity. */
  stockCount: number;
};

/** Try-on eligibility is modeled separately from purchase availability (plan section 08). */
export type TryOnEligibility = {
  eligible: boolean;
  /** Provider category, for example FASHN "tops" / "bottoms" / "one-pieces". */
  category?: 'tops' | 'bottoms' | 'one-pieces';
  /** Scope disclosure shown on the preview, e.g. jacket-only rendering of a suit. */
  scopeNote?: string;
  reasonIfIneligible?: string;
};

/**
 * One wearable piece. A suit is one product but two or three pieces (jacket, trousers,
 * waistcoat), each with its own cut-out, so pieces can be styled and rendered separately.
 */
export type ProductPiece = {
  key: string;
  name: string;
  kind: GarmentKind;
  color: ColorInfo;
  pattern: string;
  material: string;
  formality: 'formal' | 'smart-casual' | 'casual';
  fit: string | null;
  seasons: string[];
  /** Cut-out on a transparent background, once the image pass has run. */
  image?: MediaImage;
};

export type Product = {
  id: string;
  slug: string;
  title: string;
  vendor: string;
  category: ProductCategory;
  kind: GarmentKind;
  occasions: Occasion[];
  description: string;
  color: ColorInfo;
  images: MediaImage[];
  /** Display price (lowest variant price). */
  price: Money;
  variants: Variant[];
  tryOn: TryOnEligibility;
  featured: boolean;
  /** Demo fixture: shows "Illustrative product" and "Sample price" labels. */
  isIllustrative: boolean;
  /** Pieces the product is made of: one for most products, two or three for suits. */
  pieces: ProductPiece[];
  /** Sizes and stock are placeholders until the store sync supplies real variants. */
  sizesAreSamples: boolean;
  /** The product page on nyonicouture.com. */
  storeUrl?: string;
  /** Set when the price moved since the shopper last saw it. */
  previousPrice?: Money;
  /** Removed from sale (kept so saved looks and outfits can explain what happened). */
  discontinued?: boolean;
};

export type ProductQuery = {
  occasion?: Occasion;
  category?: ProductCategory;
  search?: string;
  featured?: boolean;
  tryOnEligible?: boolean;
};

/* ----------------------------------------------------------------------------- Photos & try-on */

export type PersonPhoto = {
  id: string;
  /** Device-local preview of the private upload. Never logged or sent to analytics. */
  localUri: string;
  consentVersion: string;
  createdAt: string;
  expiresAt: string;
};

export type TryOnJobState =
  | 'validating'
  | 'queued'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'expired';

export type TryOnFailureCode =
  | 'quality'
  | 'timeout'
  | 'quota_reached'
  | 'service_unavailable'
  | 'multiple_people'
  | 'photo_expired';

export type GarmentRef = { kind: 'product'; productId: string } | { kind: 'closet'; itemId: string };

export type TryOnJob = {
  id: string;
  photoId: string;
  garment: GarmentRef;
  garmentTitle: string;
  garmentKind: GarmentKind;
  garmentColor: ColorInfo;
  state: TryOnJobState;
  failureCode?: TryOnFailureCode;
  /** True once the job runs longer than expected ("still processing"). */
  slow: boolean;
  lookId?: string;
  createdAt: string;
  updatedAt: string;
};

/** An AI preview result. Stored privately and labeled "AI preview" everywhere it appears. */
export type Look = {
  id: string;
  jobId: string;
  garment: GarmentRef;
  garmentTitle: string;
  garmentKind: GarmentKind;
  garmentColor: ColorInfo;
  /** Generated image. Undefined in demo mode, where no provider is connected. */
  resultImage?: MediaImage;
  originalPhotoUri?: string;
  scopeNote?: string;
  saved: boolean;
  reported: boolean;
  status: 'active' | 'expired';
  garmentAvailable: boolean;
  createdAt: string;
  expiresAt: string;
  isDemo: boolean;
};

/* ------------------------------------------------------------------------------ Bag & checkout */

export type BagNotice =
  | { type: 'price_changed'; previous: Money }
  | { type: 'quantity_reduced'; previousQuantity: number }
  | { type: 'unavailable' };

export type BagLine = {
  id: string;
  productId: string;
  variantId: string;
  title: string;
  kind: GarmentKind;
  color: ColorInfo;
  sizeLabel: string;
  image?: MediaImage;
  quantity: number;
  maxQuantity: number;
  unitPrice: Money;
  lineTotal: Money;
  isIllustrative: boolean;
  /** Changes since the shopper last accepted this line; empty when nothing changed. */
  notices: BagNotice[];
};

export type Bag = {
  lines: BagLine[];
  itemCount: number;
  subtotal: Money;
  /** True when price or stock changed and the shopper must accept before checkout. */
  needsReview: boolean;
};

export type CheckoutHandoff = {
  attemptId: string;
  /** Single-use store URL. Null in demo mode, where the store checkout is simulated. */
  url: string | null;
  expiresAt: string;
  summary: { lines: BagLine[]; subtotal: Money };
};

export type OrderStatus = 'pending' | 'paid' | 'failed' | 'cancelled';

export type OrderReceipt = {
  id: string;
  reference: string;
  status: OrderStatus;
  lines: BagLine[];
  subtotal: Money;
  createdAt: string;
  verifiedAt?: string;
  isDemo: boolean;
  addToClosetOptIn: boolean;
};

/* ------------------------------------------------------------------------------------- Closet */

export type WardrobeCategory =
  | 'jackets'
  | 'waistcoats'
  | 'shirts'
  | 'knitwear'
  | 'trousers'
  | 'shoes'
  | 'accessories';

export type Availability = 'ready' | 'unavailable';

export type WardrobeItem = {
  id: string;
  name: string;
  category: WardrobeCategory;
  kind: GarmentKind;
  color: ColorInfo | null;
  pattern: string | null;
  brand: string | null;
  size: string | null;
  availability: Availability;
  archived: boolean;
  favorite: boolean;
  /** "Owned" only for confirmed items; "Ordered" until delivery is confirmed (plan section 12). */
  ownership: 'owned' | 'ordered';
  provenance: 'photo_import' | 'manual' | 'order' | 'demo';
  image?: MediaImage;
  photos: MediaImage[];
  tryOnEligible: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ImportSuggestion = {
  category: WardrobeCategory | null;
  color: ColorInfo | null;
  pattern: string | null;
};

export type ImportDraft = {
  id: string;
  photos: MediaImage[];
  bestPhotoIndex: number;
  suggestion: ImportSuggestion;
  confidence: 'high' | 'low';
  duplicateOfItemId?: string;
  status: 'ready' | 'saved' | 'discarded';
};

export type WardrobeImport = {
  id: string;
  drafts: ImportDraft[];
  failedPhotoCount: number;
  manual: boolean;
  createdAt: string;
};

export type LocalPhoto = {
  uri: string;
  width?: number;
  height?: number;
  fileSize?: number;
  mimeType?: string;
};

/* ---------------------------------------------------------------------------- Stylist & outfits */

/** Owned IDs and store IDs are distinct typed references (plan section 14). */
export type OutfitItemRef = { kind: 'owned'; itemId: string } | { kind: 'store'; productId: string };

export type Outfit = {
  id: string;
  title: string;
  occasion: string;
  explanation: string;
  items: OutfitItemRef[];
  /** Optional "Complete it with Nyoni" store suggestion. */
  complement: { productId: string } | null;
  saved: boolean;
  ownedOnly: boolean;
  /** The piece the shopper asked about, kept for follow-ups like "More relaxed". */
  focusItemId?: string;
  createdAt: string;
};

export type ResolvedOutfitItem =
  | { ref: OutfitItemRef; status: 'ok'; item: WardrobeItem }
  | { ref: OutfitItemRef; status: 'ok'; product: Product }
  | { ref: OutfitItemRef; status: 'missing'; name: string }
  | { ref: OutfitItemRef; status: 'unavailable'; item: WardrobeItem };

export type ResolvedOutfit = Outfit & {
  resolvedItems: ResolvedOutfitItem[];
  complementProduct: Product | null;
  /** Store suggestion that went out of stock or off sale since it was recommended. */
  complementStale: boolean;
};

export type StylistMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  outfitId?: string;
  /** A store product the stylist pointed to when the closet had no match. */
  suggestedProductId?: string;
  status?: 'ok' | 'sparse_closet' | 'no_match';
};

export type StylistThread = { messages: StylistMessage[] };

export type StyleDirection = 'classic' | 'relaxed' | 'statement';

/** Explicit preferences only; nothing is inferred from photos. */
export type StyleProfile = {
  occasions: Occasion[];
  styleDirection: StyleDirection;
  budget: Money | null;
  ownedFirst: boolean;
  city: string | null;
  updatedAt: string;
};

/* ---------------------------------------------------------------------------- Account & privacy */

export type Session =
  | { kind: 'guest'; guestId: string }
  | { kind: 'account'; guestId: string; email: string };

export type SignInLinkResult = { sentTo: string; mode: 'sign_in' | 'recover'; expiresAt: string };

export type PrivacyOverview = {
  tryOnPhotos: PersonPhoto[];
  savedPreviewCount: number;
  closetPhotoCount: number;
  stylistMessageCount: number;
  reuseTryOnPhoto: boolean;
  accountDeletion: 'none' | 'pending';
};
