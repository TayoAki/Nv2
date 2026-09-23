import * as Crypto from 'expo-crypto';

import { useDevSettings } from '@/state/devSettings';

import type { ConfirmDraftInput, NyoniApi, SignInResult, StyleProfilePatch, WardrobeItemPatch } from '../client';
import { ApiError } from '../errors';
import type {
  Bag,
  BagLine,
  BagNotice,
  GarmentKind,
  GarmentRef,
  ImportDraft,
  ImportSuggestion,
  LocalPhoto,
  Look,
  OrderReceipt,
  PrivacyOverview,
  Product,
  ProductCategory,
  ResolvedOutfit,
  ResolvedOutfitItem,
  TryOnJob,
  TryOnJobState,
  WardrobeCategory,
  WardrobeImport,
  WardrobeItem,
} from '../types';

import { applyInventory, buildCapsuleCatalog } from '../catalog/capsule';
import { fetchCatalog, serverUrl } from '../server';
import { getDb, persist, persistNow, resetDb, type JobScenario, type MockDb, type StoredJob, type StoredReceipt } from './db';
import { COLORS } from './fixtures';
import { recommend } from './stylistEngine';

/* ------------------------------------------------------------------------------------ helpers */

const MINUTE = 6e4;
const DAY = 864e5;
/** Proposed retention (plan section 09): uploads and unsaved previews 24h, saved looks 30 days. */
const PHOTO_RETENTION = DAY;
const REUSED_PHOTO_RETENTION = 30 * DAY;
const UNSAVED_LOOK_RETENTION = DAY;
const SAVED_LOOK_RETENTION = 30 * DAY;
const HANDOFF_TTL = 15 * MINUTE;
const SIGN_IN_LINK_TTL = 15 * MINUTE;
/** Time the demo store takes to confirm payment; the app shows "pending" until then. */
const PAYMENT_VERIFICATION_MS = 2600;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const now = () => Date.now();
const iso = (time = now()) => new Date(time).toISOString();
const newId = (prefix: string) => `${prefix}-${Crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
const scenario = () => useDevSettings.getState().scenario;

/** Deep copy so cached query data never aliases the mutable demo database. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Simulated round trip. Throws a network error in the "offline" demo scenario. */
async function request(kind: 'read' | 'write' | 'ai' = 'read'): Promise<MockDb> {
  const current = scenario();
  const base = kind === 'read' ? 250 : kind === 'write' ? 350 : 700;
  await sleep((current === 'slow' && kind === 'ai' ? base * 3 : base) + Math.random() * 150);
  if (current === 'offline') {
    throw new ApiError('network', "You're offline. Check your connection and try again.");
  }
  const db = await getDb();
  await syncCatalog(db);
  return db;
}

/*
 * With a server configured, products, sizes, stock and prices come from it; the rest of the
 * demo backend (bag, try-on, closet, stylist) uses them from here. Refreshed at most every
 * 30 seconds, and right after a staff edit.
 */
const CATALOG_REFRESH_MS = 30_000;
let catalogFetchedAt = 0;
let catalogSync: Promise<void> | null = null;

export function invalidateCatalog() {
  catalogFetchedAt = 0;
}

async function syncCatalog(db: MockDb) {
  if (!serverUrl || Date.now() - catalogFetchedAt < CATALOG_REFRESH_MS) return;
  catalogSync ??= (async () => {
    try {
      const products = await fetchCatalog();
      const previous = new Map(db.products.map((product) => [product.id, product]));
      db.products = products.map((product) => {
        const old = previous.get(product.id);
        if (!old) return product;
        // Keep "the price has changed" visible on the product page after a staff price edit.
        if (old.price.amountMinor !== product.price.amountMinor) return { ...product, previousPrice: old.price };
        return old.previousPrice ? { ...product, previousPrice: old.previousPrice } : product;
      });
      catalogFetchedAt = Date.now();
      persist();
    } catch {
      // Server unreachable: keep shopping on the last catalog and try again shortly.
      catalogFetchedAt = Date.now() - CATALOG_REFRESH_MS + 5_000;
    } finally {
      catalogSync = null;
    }
  })();
  await catalogSync;
}

/*
 * Demo staff account. Only the in-app demo backend knows it; the live admin signs in against
 * the app server, and no staff credential ships in the app.
 */
const DEMO_STAFF = { email: 'staff@nyonicouture.com', password: 'nyoni-admin' };
const ADMIN_SESSION_TTL = 12 * 60 * 60 * 1000;
let adminFailures = 0;
let adminLockUntil = 0;

function activeAdminSession(db: MockDb) {
  const session = db.adminSession;
  return session && Date.parse(session.expiresAt) > now() ? session : null;
}

function requireAdmin(db: MockDb) {
  if (!activeAdminSession(db)) throw new ApiError('unauthorized', 'Sign in to the store admin to continue.');
}

function notFound(message: string): never {
  throw new ApiError('not_found', message);
}

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const CATEGORY_KIND: Record<WardrobeCategory, GarmentKind> = {
  jackets: 'jacket',
  waistcoats: 'waistcoat',
  shirts: 'shirt',
  knitwear: 'knitwear',
  trousers: 'trousers',
  shoes: 'shoes',
  accessories: 'accessory',
};

const PRODUCT_TO_WARDROBE: Record<ProductCategory, WardrobeCategory> = {
  suits: 'jackets',
  tuxedos: 'jackets',
  jackets: 'jackets',
  waistcoats: 'waistcoats',
  shirts: 'shirts',
  trousers: 'trousers',
  shoes: 'shoes',
  accessories: 'accessories',
};

/** Garment categories the try-on provider supports (plan section 07). */
const TRY_ON_CATEGORIES: WardrobeCategory[] = ['jackets', 'waistcoats', 'shirts', 'knitwear', 'trousers'];

/* ---------------------------------------------------------------------------------- catalog */

function findProduct(db: MockDb, id: string): Product {
  return db.products.find((p) => p.id === id || p.slug === id) ?? notFound('This piece is no longer available.');
}

function matchesSearch(product: Product, search: string): boolean {
  const haystack = [product.title, product.color.name, product.category, product.vendor, ...product.occasions]
    .join(' ')
    .toLowerCase();
  return search
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

/* ----------------------------------------------------------------------------------- try-on */

function resolveGarment(db: MockDb, ref: GarmentRef) {
  if (ref.kind === 'product') {
    const product = findProduct(db, ref.productId);
    return {
      title: product.title,
      kind: product.kind,
      color: product.color,
      scopeNote: product.tryOn.scopeNote,
      eligible: product.tryOn.eligible && !product.discontinued,
      reason: product.discontinued ? 'This piece is no longer sold.' : product.tryOn.reasonIfIneligible,
    };
  }
  const item =
    db.wardrobe.find((w) => w.id === ref.itemId) ?? notFound('This item is no longer in your closet.');
  return {
    title: item.name,
    kind: item.kind,
    color: item.color ?? { name: 'Unknown', hex: '#8A8175' },
    scopeNote: undefined,
    eligible: item.tryOnEligible,
    reason: "Shoes and accessories can't be previewed yet.",
  };
}

function computeJobState(job: StoredJob, time: number): { state: TryOnJobState; failureCode?: TryOnJob['failureCode']; slow: boolean } {
  if (job.cancelledAt) return { state: 'cancelled', slow: false };
  const elapsed = time - Date.parse(job.createdAt);
  const phase = (validating: number, queued: number, processing: number): TryOnJobState | null =>
    elapsed < validating ? 'validating' : elapsed < queued ? 'queued' : elapsed < processing ? 'processing' : null;

  const byScenario: Record<JobScenario, () => ReturnType<typeof computeJobState>> = {
    quota: () => ({ state: 'failed', failureCode: 'quota_reached', slow: false }),
    ai_failure: () => {
      const p = phase(1200, 2400, 5200);
      return p ? { state: p, slow: false } : { state: 'failed', failureCode: 'quality', slow: false };
    },
    slow: () => {
      const p = phase(1500, 4000, 34000);
      return p ? { state: p, slow: elapsed > 10000 } : { state: 'succeeded', slow: true };
    },
    timeout: () => {
      const p = phase(1500, 4000, 20000);
      return p ? { state: p, slow: elapsed > 10000 } : { state: 'failed', failureCode: 'timeout', slow: true };
    },
    normal: () => {
      const p = phase(1200, 2400, 6500);
      return p ? { state: p, slow: false } : { state: 'succeeded', slow: false };
    },
  };
  return byScenario[job.scenario]();
}

function jobView(db: MockDb, job: StoredJob): TryOnJob {
  const time = now();
  const { state, failureCode, slow } = computeJobState(job, time);
  if (state === 'succeeded' && !job.lookId) {
    const photo = db.photos.find((p) => p.id === job.photoId);
    const look: Look = {
      id: newId('l'),
      jobId: job.id,
      garment: job.garment,
      garmentTitle: job.garmentTitle,
      garmentKind: job.garmentKind,
      garmentColor: job.garmentColor,
      originalPhotoUri: photo?.localUri,
      scopeNote: job.scopeNote,
      saved: false,
      reported: false,
      status: 'active',
      garmentAvailable: true,
      createdAt: iso(time),
      expiresAt: iso(time + UNSAVED_LOOK_RETENTION),
      // No AI provider is connected in the demo build, so no image is generated.
      isDemo: true,
    };
    db.looks.push(look);
    job.lookId = look.id;
    persist();
  }
  return clone({
    id: job.id,
    photoId: job.photoId,
    garment: job.garment,
    garmentTitle: job.garmentTitle,
    garmentKind: job.garmentKind,
    garmentColor: job.garmentColor,
    state,
    failureCode,
    slow,
    lookId: job.lookId,
    createdAt: job.createdAt,
    updatedAt: iso(time),
  });
}

function isTerminal(state: TryOnJobState) {
  return state === 'succeeded' || state === 'failed' || state === 'cancelled' || state === 'expired';
}

function lookView(db: MockDb, look: Look): Look {
  const expired = Date.parse(look.expiresAt) < now();
  const garment = look.garment;
  const garmentAvailable =
    garment.kind === 'product'
      ? db.products.some((p) => p.id === garment.productId && !p.discontinued)
      : db.wardrobe.some((w) => w.id === garment.itemId);
  return clone({ ...look, status: expired ? 'expired' : 'active', garmentAvailable });
}

function activePhotos(db: MockDb) {
  const time = now();
  return db.photos.filter((photo) => {
    const created = Date.parse(photo.createdAt);
    const limit = db.reuseTryOnPhoto ? REUSED_PHOTO_RETENTION : PHOTO_RETENTION;
    return created + limit > time;
  });
}

function cancelJobsForPhotos(db: MockDb, photoIds: string[]) {
  const time = now();
  for (const job of db.jobs) {
    if (photoIds.includes(job.photoId) && !isTerminal(computeJobState(job, time).state)) {
      job.cancelledAt = iso(time);
    }
  }
}

/* -------------------------------------------------------------------------------------- bag */

function bagView(db: MockDb): Bag {
  const lines: BagLine[] = [];
  for (const stored of db.bag) {
    const product = db.products.find((p) => p.id === stored.productId);
    if (!product) continue;
    // A size removed from the store stays in the bag as unavailable, so it never vanishes silently.
    const variant = product.variants.find((v) => v.id === stored.variantId) ?? {
      id: stored.variantId,
      productId: product.id,
      size: { code: '', label: 'Size no longer offered' },
      color: product.color,
      price: stored.priceSeen,
      stock: 'out_of_stock' as const,
      stockCount: 0,
    };

    const notices: BagNotice[] = [];
    const unavailable = !!product.discontinued || variant.stock === 'out_of_stock';
    const maxQuantity = Math.max(1, Math.min(10, variant.stockCount));
    let quantity = stored.quantity;
    if (unavailable) {
      notices.push({ type: 'unavailable' });
    } else {
      if (quantity > maxQuantity) {
        notices.push({ type: 'quantity_reduced', previousQuantity: quantity });
        quantity = maxQuantity;
      }
      if (variant.price.amountMinor !== stored.priceSeen.amountMinor) {
        notices.push({ type: 'price_changed', previous: stored.priceSeen });
      }
    }

    lines.push({
      id: stored.id,
      productId: product.id,
      variantId: variant.id,
      title: product.title,
      kind: product.kind,
      color: variant.color,
      sizeLabel: variant.size.label,
      image: product.images[0],
      quantity,
      maxQuantity,
      unitPrice: variant.price,
      lineTotal: { amountMinor: variant.price.amountMinor * quantity, currency: variant.price.currency },
      isIllustrative: product.isIllustrative,
      notices,
    });
  }

  const purchasable = lines.filter((line) => !line.notices.some((n) => n.type === 'unavailable'));
  return clone({
    lines,
    itemCount: purchasable.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: {
      amountMinor: purchasable.reduce((sum, line) => sum + line.lineTotal.amountMinor, 0),
      currency: lines[0]?.unitPrice.currency ?? 'USD',
    },
    needsReview: lines.some((line) => line.notices.length > 0),
  });
}

/* --------------------------------------------------------------------------------- receipts */

function createOrderedItems(db: MockDb, receipt: StoredReceipt) {
  const time = iso();
  receipt.orderedItemIds = receipt.lines.map((line) => {
    const product = db.products.find((p) => p.id === line.productId);
    const category = product ? PRODUCT_TO_WARDROBE[product.category] : 'jackets';
    const item: WardrobeItem = {
      id: newId('w'),
      name: line.title,
      category,
      kind: CATEGORY_KIND[category] === 'jacket' && line.kind === 'suit' ? 'suit' : CATEGORY_KIND[category],
      color: line.color,
      pattern: null,
      brand: 'Nyoni Couture',
      size: line.sizeLabel,
      availability: 'ready',
      archived: false,
      favorite: false,
      ownership: 'ordered',
      provenance: 'order',
      photos: [],
      tryOnEligible: product?.tryOn.eligible ?? false,
      createdAt: time,
      updatedAt: time,
    };
    db.wardrobe.unshift(item);
    return item.id;
  });
}

function receiptView(db: MockDb, receipt: StoredReceipt): OrderReceipt {
  const elapsed = now() - Date.parse(receipt.createdAt);
  const verified = elapsed >= PAYMENT_VERIFICATION_MS;
  if (verified && !receipt.settled) {
    receipt.settled = true;
    if (receipt.outcome === 'paid') {
      // The store empties the cart once the order is placed.
      const orderedVariants = receipt.lines.map((line) => line.variantId);
      db.bag = db.bag.filter((line) => !orderedVariants.includes(line.variantId));
      if (receipt.addToClosetOptIn) createOrderedItems(db, receipt);
    }
    persist();
  }
  return clone({
    id: receipt.id,
    reference: receipt.reference,
    status: verified ? receipt.outcome : 'pending',
    lines: receipt.lines,
    subtotal: receipt.subtotal,
    createdAt: receipt.createdAt,
    verifiedAt:
      verified && receipt.outcome === 'paid'
        ? iso(Date.parse(receipt.createdAt) + PAYMENT_VERIFICATION_MS)
        : undefined,
    isDemo: true,
    addToClosetOptIn: receipt.addToClosetOptIn,
  });
}

/* ----------------------------------------------------------------------------------- closet */

const SUGGESTIONS: ImportSuggestion[] = [
  { category: 'jackets', color: COLORS.navy, pattern: 'Solid' },
  { category: 'shirts', color: COLORS.white, pattern: 'Solid' },
  { category: 'trousers', color: COLORS.charcoal, pattern: 'Solid' },
  { category: 'knitwear', color: COLORS.camel, pattern: 'Textured' },
  { category: 'shoes', color: COLORS.brown, pattern: 'Solid' },
];

function findImport(db: MockDb, id: string): WardrobeImport {
  return db.imports.find((imp) => imp.id === id) ?? notFound('This import has expired. Add your photos again.');
}

function findDraft(imp: WardrobeImport, draftId: string): ImportDraft {
  return imp.drafts.find((d) => d.id === draftId) ?? notFound('This item is no longer in the review.');
}

/* ---------------------------------------------------------------------------------- outfits */

function resolveOutfit(db: MockDb, outfitId: string): ResolvedOutfit {
  const outfit = db.outfits.find((o) => o.id === outfitId) ?? notFound('This outfit is no longer available.');
  const resolvedItems: ResolvedOutfitItem[] = outfit.items.map((ref) => {
    if (ref.kind === 'owned') {
      const item = db.wardrobe.find((w) => w.id === ref.itemId);
      if (!item) return { ref, status: 'missing', name: 'Removed item' };
      if (item.archived || item.availability !== 'ready') return { ref, status: 'unavailable', item };
      return { ref, status: 'ok', item };
    }
    const product = db.products.find((p) => p.id === ref.productId);
    return product && !product.discontinued
      ? { ref, status: 'ok', product }
      : { ref, status: 'missing', name: product?.title ?? 'Unavailable piece' };
  });
  const complementProduct = outfit.complement
    ? (db.products.find((p) => p.id === outfit.complement!.productId) ?? null)
    : null;
  const complementStale =
    !!outfit.complement &&
    (!complementProduct ||
      !!complementProduct.discontinued ||
      complementProduct.variants.every((v) => v.stock === 'out_of_stock'));
  return clone({ ...outfit, resolvedItems, complementProduct, complementStale });
}

/* ---------------------------------------------------------------------------------- privacy */

function privacyView(db: MockDb): PrivacyOverview {
  return clone({
    tryOnPhotos: activePhotos(db),
    savedPreviewCount: db.looks.filter((l) => l.saved && Date.parse(l.expiresAt) > now()).length,
    closetPhotoCount: db.wardrobe.reduce((sum, item) => sum + item.photos.length, 0),
    stylistMessageCount: db.thread.length,
    reuseTryOnPhoto: db.reuseTryOnPhoto,
    accountDeletion: db.accountDeletion,
  });
}

function providerCleanup(): 'done' | 'retrying' {
  return scenario() === 'ai_failure' ? 'retrying' : 'done';
}

/* ------------------------------------------------------------------------------ implementation */

export const mockApi: NyoniApi = {
  /* Catalog */
  async listProducts(query = {}) {
    const db = await request();
    const items = db.products.filter(
      (p) =>
        !p.discontinued &&
        (!query.featured || p.featured) &&
        (!query.occasion || p.occasions.includes(query.occasion)) &&
        (!query.category || p.category === query.category) &&
        (!query.tryOnEligible || p.tryOn.eligible) &&
        (!query.search?.trim() || matchesSearch(p, query.search)),
    );
    return clone(items);
  },

  async getProduct(id) {
    const db = await request();
    return clone(findProduct(db, id));
  },

  /* Admin panel: staff only. */
  async getAdminSession() {
    const db = await request();
    return clone(activeAdminSession(db));
  },

  async adminSignIn(email, password) {
    const db = await request('write');
    const lockedFor = adminLockUntil - now();
    if (lockedFor > 0) {
      throw new ApiError('unauthorized', `Too many attempts. Try again in ${Math.ceil(lockedFor / 1000)} seconds.`);
    }
    const normalized = email.trim().toLowerCase();
    if (normalized !== DEMO_STAFF.email || password !== DEMO_STAFF.password) {
      adminFailures += 1;
      if (adminFailures >= 5) {
        adminFailures = 0;
        adminLockUntil = now() + 30_000;
      }
      throw new ApiError('unauthorized', "That email and password don't match a staff account.");
    }
    adminFailures = 0;
    db.adminSession = { email: normalized, expiresAt: iso(now() + ADMIN_SESSION_TTL) };
    await persistNow();
    return clone(db.adminSession);
  },

  async adminSignOut() {
    const db = await request('write');
    db.adminSession = null;
    await persistNow();
  },

  async adminListProducts() {
    const db = await request();
    requireAdmin(db);
    return clone(db.products);
  },

  async updateInventory(productId, update) {
    const db = await request('write');
    requireAdmin(db);
    const index = db.products.findIndex((p) => p.id === productId);
    if (index === -1) notFound('This product is no longer in the catalog.');
    const sizes = update.sizes.map((size) => ({ label: size.label.trim(), stockCount: size.stockCount }));
    if (sizes.length === 0) throw new ApiError('validation', 'Add at least one size.');
    if (sizes.some((size) => !size.label)) throw new ApiError('validation', 'Every size needs a label.');
    const labels = sizes.map((size) => size.label.toLowerCase());
    if (new Set(labels).size !== labels.length) throw new ApiError('validation', 'Two sizes have the same label.');
    if (sizes.some((size) => !Number.isInteger(size.stockCount) || size.stockCount < 0 || size.stockCount > 999)) {
      throw new ApiError('validation', 'Stock must be a whole number from 0 to 999.');
    }
    const { amountMinor } = update.price;
    if (!Number.isInteger(amountMinor) || amountMinor <= 0 || amountMinor > 10_000_000) {
      throw new ApiError('validation', 'Enter a price between $0.01 and $100,000.');
    }
    const current = db.products[index];
    const override = { price: update.price, sizes, updatedAt: iso() };
    db.inventory[productId] = override;
    const next = applyInventory(current, override);
    if (current.price.amountMinor !== amountMinor) next.previousPrice = current.price;
    db.products[index] = next;
    persist();
    return clone(next);
  },

  async resetInventory(productId) {
    const db = await request('write');
    requireAdmin(db);
    const index = db.products.findIndex((p) => p.id === productId);
    const base = buildCapsuleCatalog().find((p) => p.id === productId);
    if (index === -1 || !base) notFound('This product is no longer in the catalog.');
    const current = db.products[index];
    delete db.inventory[productId];
    if (current.price.amountMinor !== base.price.amountMinor) base.previousPrice = current.price;
    db.products[index] = base;
    persist();
    return clone(base);
  },

  /* Photos */
  async uploadPhoto(photo, consentVersion) {
    const db = await request('write');
    if (photo.fileSize && photo.fileSize > MAX_UPLOAD_BYTES) {
      throw new ApiError('validation', 'This photo is larger than 10 MB. Choose a smaller photo.');
    }
    if (photo.mimeType && !/jpe?g|png|heic|heif|webp/i.test(photo.mimeType)) {
      throw new ApiError('validation', 'Use a JPEG, PNG or HEIC photo.');
    }
    const time = now();
    const record = {
      id: newId('ph'),
      localUri: photo.uri,
      consentVersion,
      createdAt: iso(time),
      expiresAt: iso(time + PHOTO_RETENTION),
    };
    db.photos.push(record);
    persist();
    return clone(record);
  },

  async listPhotos() {
    const db = await request();
    return clone(activePhotos(db));
  },

  async deletePhoto(id) {
    const db = await request('write');
    cancelJobsForPhotos(db, [id]);
    db.photos = db.photos.filter((p) => p.id !== id);
    persist();
    return { providerCleanup: providerCleanup() };
  },

  /* Try-on */
  async createTryOn({ photoId, garment, idempotencyKey }) {
    const db = await request('write');
    // Idempotency: retrying the same request never creates duplicate (billed) work.
    const existing = db.jobs.find((job) => job.idempotencyKey === idempotencyKey);
    if (existing) return jobView(db, existing);

    if (!activePhotos(db).some((p) => p.id === photoId)) {
      throw new ApiError('expired', 'Your photo has expired. Choose it again to create a preview.');
    }
    const resolved = resolveGarment(db, garment);
    if (!resolved.eligible) {
      throw new ApiError('validation', resolved.reason ?? "This piece can't be tried on yet.");
    }
    const current = scenario();
    const job: StoredJob = {
      id: newId('j'),
      photoId,
      garment,
      garmentTitle: resolved.title,
      garmentKind: resolved.kind,
      garmentColor: resolved.color,
      scopeNote: resolved.scopeNote,
      idempotencyKey,
      scenario: current === 'slow' || current === 'timeout' || current === 'ai_failure' || current === 'quota' ? current : 'normal',
      createdAt: iso(),
    };
    db.jobs.push(job);
    persist();
    return jobView(db, job);
  },

  async getTryOn(id) {
    const db = await request();
    const job = db.jobs.find((j) => j.id === id) ?? notFound('We couldn\'t find this preview.');
    return jobView(db, job);
  },

  async cancelTryOn(id) {
    const db = await request('write');
    const job = db.jobs.find((j) => j.id === id) ?? notFound('We couldn\'t find this preview.');
    if (!isTerminal(computeJobState(job, now()).state)) {
      job.cancelledAt = iso();
      persist();
    }
    return jobView(db, job);
  },

  async getActiveTryOns() {
    const db = await request();
    const time = now();
    return db.jobs
      .filter((job) => time - Date.parse(job.createdAt) < 60 * MINUTE)
      .map((job) => jobView(db, job))
      .filter((job) => !isTerminal(job.state) || job.state === 'succeeded')
      .reverse();
  },

  /* Looks */
  async getLook(id) {
    const db = await request();
    const look = db.looks.find((l) => l.id === id) ?? notFound('This preview was deleted.');
    return lookView(db, look);
  },

  async listSavedLooks() {
    const db = await request();
    return db.looks
      .filter((l) => l.saved)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((l) => lookView(db, l));
  },

  async setLookSaved(id, saved) {
    const db = await request('write');
    const look = db.looks.find((l) => l.id === id) ?? notFound('This preview was deleted.');
    if (Date.parse(look.expiresAt) < now()) {
      throw new ApiError('expired', 'This preview has expired. Create a new one to save it.');
    }
    look.saved = saved;
    look.expiresAt = iso(
      saved ? now() + SAVED_LOOK_RETENTION : Date.parse(look.createdAt) + UNSAVED_LOOK_RETENTION,
    );
    persist();
    return lookView(db, look);
  },

  async deleteLook(id) {
    const db = await request('write');
    db.looks = db.looks.filter((l) => l.id !== id);
    persist();
  },

  async reportLook(id) {
    const db = await request('write');
    const look = db.looks.find((l) => l.id === id) ?? notFound('This preview was deleted.');
    look.reported = true;
    persist();
    return lookView(db, look);
  },

  /* Bag */
  async getBag() {
    const db = await request();
    return bagView(db);
  },

  async addToBag({ productId, variantId, quantity }) {
    const db = await request('write');
    const product = findProduct(db, productId);
    const variant = product.variants.find((v) => v.id === variantId);
    if (!variant || variant.stock === 'out_of_stock' || product.discontinued) {
      throw new ApiError('conflict', 'This size is no longer available. Choose another size.');
    }
    const max = Math.min(10, variant.stockCount);
    const existing = db.bag.find((line) => line.variantId === variantId);
    const nextQuantity = (existing?.quantity ?? 0) + quantity;
    if (nextQuantity > max) {
      throw new ApiError(
        'conflict',
        max === 1 ? 'Only 1 left in this size, and it is already in your bag.' : `Only ${max} available in this size.`,
      );
    }
    if (existing) {
      existing.quantity = nextQuantity;
    } else {
      db.bag.push({ id: newId('b'), productId: product.id, variantId, quantity, priceSeen: variant.price });
    }
    persist();
    return bagView(db);
  },

  async updateBagLine(lineId, quantity) {
    const db = await request('write');
    const line = db.bag.find((l) => l.id === lineId) ?? notFound('This item is no longer in your bag.');
    const variant = findProduct(db, line.productId).variants.find((v) => v.id === line.variantId);
    const max = Math.min(10, variant?.stockCount ?? 0);
    if (quantity > max) throw new ApiError('conflict', `Only ${max} available in this size.`);
    line.quantity = Math.max(1, quantity);
    persist();
    return bagView(db);
  },

  async removeBagLine(lineId) {
    const db = await request('write');
    db.bag = db.bag.filter((line) => line.id !== lineId);
    persist();
    return bagView(db);
  },

  async acceptBagChanges() {
    const db = await request('write');
    db.bag = db.bag.flatMap((line) => {
      const product = db.products.find((p) => p.id === line.productId);
      const variant = product?.variants.find((v) => v.id === line.variantId);
      if (!product || !variant || product.discontinued || variant.stock === 'out_of_stock') return [];
      return [
        {
          ...line,
          quantity: Math.min(line.quantity, Math.max(1, Math.min(10, variant.stockCount))),
          priceSeen: variant.price,
        },
      ];
    });
    persist();
    return bagView(db);
  },

  /* Checkout */
  async createCheckoutHandoff() {
    const db = await request('write');
    const bag = bagView(db);
    if (bag.lines.length === 0) throw new ApiError('validation', 'Your bag is empty.');
    if (bag.needsReview) {
      throw new ApiError('conflict', 'Your bag changed. Review the updated prices and quantities before checkout.');
    }
    const time = now();
    const handoff = { attemptId: newId('co'), createdAt: iso(time), expiresAt: iso(time + HANDOFF_TTL), status: 'open' as const };
    db.handoffs.push(handoff);
    persist();
    return clone({
      attemptId: handoff.attemptId,
      url: null,
      expiresAt: handoff.expiresAt,
      summary: { lines: bag.lines, subtotal: bag.subtotal },
    });
  },

  async cancelCheckout(attemptId) {
    const db = await request('write');
    const handoff = db.handoffs.find((h) => h.attemptId === attemptId);
    if (handoff && handoff.status === 'open') {
      handoff.status = 'cancelled';
      persist();
    }
  },

  async submitDemoCheckout(attemptId) {
    const db = await request('write');
    const handoff = db.handoffs.find((h) => h.attemptId === attemptId) ?? notFound('This checkout could not be found.');
    if (handoff.status !== 'open') {
      throw new ApiError('conflict', 'This checkout was already used. Start again from your bag.');
    }
    if (Date.parse(handoff.expiresAt) < now()) {
      throw new ApiError('expired', 'This checkout session expired. Start again from your bag.');
    }
    handoff.status = 'used';
    const bag = bagView(db);
    const purchasable = bag.lines.filter((line) => line.notices.length === 0);
    db.orderCounter += 1;
    const receipt: StoredReceipt = {
      id: newId('r'),
      reference: `DEMO-${String(db.orderCounter).padStart(3, '0')}`,
      attemptId,
      lines: purchasable,
      subtotal: bag.subtotal,
      createdAt: iso(),
      outcome: scenario() === 'payment_failure' ? 'failed' : 'paid',
      settled: false,
      addToClosetOptIn: false,
      orderedItemIds: [],
    };
    db.receipts.push(receipt);
    persist();
    return receiptView(db, receipt);
  },

  async getReceipt(id) {
    const db = await request();
    const receipt =
      db.receipts.find((r) => r.id === id || r.reference === id) ??
      notFound("We couldn't find this order. If you were charged, contact Nyoni.");
    return receiptView(db, receipt);
  },

  async setReceiptClosetOptIn(id, optIn) {
    const db = await request('write');
    const receipt = db.receipts.find((r) => r.id === id) ?? notFound("We couldn't find this order.");
    receipt.addToClosetOptIn = optIn;
    if (receipt.settled && receipt.outcome === 'paid') {
      if (optIn && receipt.orderedItemIds.length === 0) {
        createOrderedItems(db, receipt);
      } else if (!optIn) {
        // Only remove entries that are still "Ordered"; confirmed pieces stay.
        db.wardrobe = db.wardrobe.filter(
          (item) => !(receipt.orderedItemIds.includes(item.id) && item.ownership === 'ordered'),
        );
        receipt.orderedItemIds = [];
      }
    }
    persist();
    return receiptView(db, receipt);
  },

  /* Wardrobe */
  async listWardrobe() {
    const db = await request();
    return clone([...db.wardrobe].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  },

  async getWardrobeItem(id) {
    const db = await request();
    return clone(db.wardrobe.find((w) => w.id === id) ?? notFound('This item is no longer in your closet.'));
  },

  async updateWardrobeItem(id, patch: WardrobeItemPatch) {
    const db = await request('write');
    const item = db.wardrobe.find((w) => w.id === id) ?? notFound('This item is no longer in your closet.');
    if (patch.name !== undefined && !patch.name.trim()) {
      throw new ApiError('validation', 'Give this piece a name.');
    }
    Object.assign(item, patch, {
      name: patch.name?.trim() ?? item.name,
      brand: patch.brand === undefined ? item.brand : patch.brand?.trim() || null,
      size: patch.size === undefined ? item.size : patch.size?.trim() || null,
      updatedAt: iso(),
    });
    if (patch.category) {
      item.kind = CATEGORY_KIND[patch.category];
      item.tryOnEligible = TRY_ON_CATEGORIES.includes(patch.category);
    }
    persist();
    return clone(item);
  },

  async deleteWardrobeItem(id) {
    const db = await request('write');
    db.wardrobe = db.wardrobe.filter((w) => w.id !== id);
    const affectedOutfitIds = db.outfits
      .filter((o) => o.items.some((ref) => ref.kind === 'owned' && ref.itemId === id))
      .map((o) => o.id);
    persist();
    return { affectedOutfitIds };
  },

  async createWardrobeImport(photos: LocalPhoto[], options = {}) {
    const db = await request('ai');
    const current = scenario();
    const time = iso();
    let drafts: ImportDraft[];
    let failedPhotoCount = 0;

    if (options.manual) {
      drafts = [
        {
          id: newId('d'),
          photos: [],
          bestPhotoIndex: 0,
          suggestion: { category: null, color: null, pattern: null },
          confidence: 'high',
          status: 'ready',
        },
      ];
    } else {
      if (photos.length === 0) throw new ApiError('validation', 'Choose at least one photo.');
      drafts = [];
      photos.forEach((photo, index) => {
        // "AI failures" scenario: the last photo in the batch can't be read.
        if (current === 'ai_failure' && index === photos.length - 1) {
          failedPhotoCount += 1;
          return;
        }
        const suggestion = SUGGESTIONS[(db.imports.length + index) % SUGGESTIONS.length];
        const duplicate = db.wardrobe.find((item) => item.photos.some((p) => p.uri === photo.uri));
        drafts.push({
          id: newId('d'),
          photos: [{ uri: photo.uri, alt: 'Your garment photo', width: photo.width, height: photo.height }],
          bestPhotoIndex: 0,
          suggestion,
          confidence: current === 'ai_failure' || hash(photo.uri) % 4 === 3 ? 'low' : 'high',
          duplicateOfItemId: duplicate?.id,
          status: 'ready',
        });
      });
    }

    const imp: WardrobeImport = { id: newId('imp'), drafts, failedPhotoCount, manual: !!options.manual, createdAt: time };
    db.imports.push(imp);
    persist();
    return clone(imp);
  },

  async getWardrobeImport(id) {
    const db = await request();
    return clone(findImport(db, id));
  },

  async addImportPhoto(importId, draftId, photo) {
    const db = await request('ai');
    const imp = findImport(db, importId);
    const draft = findDraft(imp, draftId);
    draft.photos.push({ uri: photo.uri, alt: 'Your garment photo', width: photo.width, height: photo.height });
    persist();
    return clone(imp);
  },

  async confirmImportDraft(importId, draftId, input: ConfirmDraftInput) {
    const db = await request('write');
    const imp = findImport(db, importId);
    const draft = findDraft(imp, draftId);
    if (draft.status !== 'ready') throw new ApiError('conflict', 'This item was already saved.');
    if (!input.name.trim()) throw new ApiError('validation', 'Give this piece a name.');
    const time = iso();
    const item: WardrobeItem = {
      id: newId('w'),
      name: input.name.trim(),
      category: input.category,
      kind: CATEGORY_KIND[input.category],
      color: input.color,
      pattern: input.pattern,
      brand: input.brand?.trim() || null,
      size: input.size?.trim() || null,
      availability: 'ready',
      archived: false,
      favorite: false,
      ownership: 'owned',
      provenance: imp.manual ? 'manual' : 'photo_import',
      image: draft.photos[input.bestPhotoIndex] ?? draft.photos[0],
      photos: draft.photos,
      // A closet photo is a thumbnail; it needs an eligible category and a photo to be a try-on reference.
      tryOnEligible: TRY_ON_CATEGORIES.includes(input.category) && draft.photos.length > 0,
      createdAt: time,
      updatedAt: time,
    };
    db.wardrobe.unshift(item);
    draft.status = 'saved';
    persist();
    return clone(item);
  },

  async discardImportDraft(importId, draftId) {
    const db = await request('write');
    const imp = findImport(db, importId);
    findDraft(imp, draftId).status = 'discarded';
    persist();
    return clone(imp);
  },

  /* Stylist */
  async getStylistThread() {
    const db = await request();
    return clone({ messages: db.thread });
  },

  async sendStylistMessage({ text, ownedOnly, focusItemId }) {
    const db = await request('ai');
    const trimmed = text.trim();
    if (!trimmed) throw new ApiError('validation', 'Ask your stylist something first.');
    if (scenario() === 'ai_failure') {
      throw new ApiError('model_failure', 'Your stylist is unavailable right now. Please try again in a moment.');
    }
    const lastOutfitId = [...db.thread].reverse().find((m) => m.outfitId)?.outfitId;
    const result = recommend({
      text: trimmed,
      ownedOnly,
      focusItemId,
      wardrobe: db.wardrobe,
      products: db.products,
      profile: db.styleProfile,
      previous: db.outfits.find((o) => o.id === lastOutfitId),
    });

    const time = iso();
    db.thread.push({ id: newId('m'), role: 'user', text: trimmed, createdAt: time });
    if (result.status === 'ok') {
      const outfit = { ...result.outfit, id: newId('o'), createdAt: time };
      db.outfits.push(outfit);
      db.thread.push({ id: newId('m'), role: 'assistant', text: result.reply, createdAt: time, outfitId: outfit.id, status: 'ok' });
    } else {
      db.thread.push({
        id: newId('m'),
        role: 'assistant',
        text: result.reply,
        createdAt: time,
        status: result.status,
        suggestedProductId: result.suggestedProductId,
      });
    }
    // Keep the thread bounded; the plan proposes 30-day chat retention.
    db.thread = db.thread.slice(-60);
    persist();
    return clone({ messages: db.thread });
  },

  async clearStylistHistory() {
    const db = await request('write');
    const threadOutfits = new Set(db.thread.map((m) => m.outfitId).filter(Boolean));
    db.outfits = db.outfits.filter((o) => o.saved || !threadOutfits.has(o.id));
    db.thread = [];
    persist();
  },

  /* Outfits */
  async getOutfit(id) {
    const db = await request();
    return resolveOutfit(db, id);
  },

  async listSavedOutfits() {
    const db = await request();
    return db.outfits
      .filter((o) => o.saved)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((o) => resolveOutfit(db, o.id));
  },

  async setOutfitSaved(id, saved) {
    const db = await request('write');
    const outfit = db.outfits.find((o) => o.id === id) ?? notFound('This outfit is no longer available.');
    outfit.saved = saved;
    persist();
    return resolveOutfit(db, id);
  },

  async swapOutfitItem(outfitId, index, itemId) {
    const db = await request('write');
    const outfit = db.outfits.find((o) => o.id === outfitId) ?? notFound('This outfit is no longer available.');
    const item = db.wardrobe.find((w) => w.id === itemId);
    if (!item || item.archived || item.availability !== 'ready') {
      throw new ApiError('conflict', 'That piece is not available right now.');
    }
    if (index < 0 || index >= outfit.items.length) throw new ApiError('validation', 'Choose a piece to swap.');
    outfit.items = outfit.items.map((ref, i) => (i === index ? { kind: 'owned', itemId } : ref));
    persist();
    return resolveOutfit(db, outfitId);
  },

  async deleteOutfit(id) {
    const db = await request('write');
    db.outfits = db.outfits.filter((o) => o.id !== id);
    persist();
  },

  /* Style profile */
  async getStyleProfile() {
    const db = await request();
    return clone(db.styleProfile);
  },

  async updateStyleProfile(patch: StyleProfilePatch) {
    const db = await request('write');
    const { budgetMinor, ...rest } = patch;
    if (budgetMinor !== undefined && budgetMinor !== null) {
      if (!Number.isInteger(budgetMinor) || budgetMinor < 0 || budgetMinor > 10_000_000) {
        throw new ApiError('validation', 'Enter a budget between $0 and $100,000, or leave it blank.');
      }
    }
    db.styleProfile = {
      ...db.styleProfile,
      ...rest,
      city: rest.city === undefined ? db.styleProfile.city : rest.city?.trim() || null,
      budget:
        budgetMinor === undefined
          ? db.styleProfile.budget
          : budgetMinor === null
            ? null
            : { amountMinor: budgetMinor, currency: 'USD' },
      updatedAt: iso(),
    };
    persist();
    return clone(db.styleProfile);
  },

  /* Account */
  async getSession() {
    const db = await request();
    return clone(db.session);
  },

  async requestSignInLink(email, mode) {
    const db = await request('write');
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized)) {
      throw new ApiError('validation', 'Enter a valid email address.');
    }
    const expiresAt = iso(now() + SIGN_IN_LINK_TTL);
    db.pendingSignIn = { email: normalized, mode, expiresAt };
    persist();
    return { sentTo: normalized, mode, expiresAt };
  },

  async completeDemoSignIn(): Promise<SignInResult> {
    const db = await request('write');
    const pending = db.pendingSignIn;
    if (!pending || Date.parse(pending.expiresAt) < now()) {
      db.pendingSignIn = null;
      persist();
      throw new ApiError('expired', 'That sign-in link has expired. We can send you a new one.');
    }
    db.pendingSignIn = null;
    db.session = { kind: 'account', guestId: db.session.guestId, email: pending.email };
    const guestItemCount = db.wardrobe.length;
    // Demo hook: an address containing "existing" behaves like an account that already has a closet.
    const accountHasData = pending.email.includes('existing');
    db.pendingMigration = guestItemCount > 0 ? { accountHasData } : null;
    persist();
    return clone({ session: db.session, guestItemCount, accountHasData });
  },

  async resolveGuestMigration() {
    const db = await request('write');
    // Guest data only moves through this explicit, verified step (plan section 12).
    db.pendingMigration = null;
    persist();
    return clone(db.session);
  },

  async signOut() {
    const db = await request('write');
    db.session = { kind: 'guest', guestId: newId('guest') };
    persist();
    return clone(db.session);
  },

  /* Privacy */
  async getPrivacyOverview() {
    const db = await request();
    return privacyView(db);
  },

  async setReuseTryOnPhoto(enabled) {
    const db = await request('write');
    db.reuseTryOnPhoto = enabled;
    persist();
    return privacyView(db);
  },

  async deleteAllPhotos() {
    const db = await request('write');
    cancelJobsForPhotos(
      db,
      db.photos.map((p) => p.id),
    );
    db.photos = [];
    persist();
    return { providerCleanup: providerCleanup() };
  },

  async requestAccountDeletion() {
    const db = await request('write');
    db.accountDeletion = 'pending';
    persist();
    return privacyView(db);
  },
};

/* ------------------------------------------------------------------------------ demo controls */

/** Controls for the in-app demo menu. Not part of the production API. */
export const demoControls = {
  reset: async (seed: 'demo' | 'empty') => {
    const db = await resetDb(seed);
    invalidateCatalog();
    return db;
  },

  /** Raise the price of the first bag item so the bag shows the "price changed" review. */
  async simulateBagChanges() {
    const db = await getDb();
    const [first, second] = db.bag;
    for (const [index, line] of [first, second].entries()) {
      if (!line) continue;
      const product = db.products.find((p) => p.id === line.productId);
      const variant = product?.variants.find((v) => v.id === line.variantId);
      if (!product || !variant) continue;
      if (index === 0) {
        const bump = Math.max(500, Math.round((variant.price.amountMinor * 0.03) / 500) * 500);
        product.previousPrice = product.price;
        product.variants = product.variants.map((v) => ({
          ...v,
          price: { ...v.price, amountMinor: v.price.amountMinor + bump },
        }));
        product.price = { ...product.price, amountMinor: product.price.amountMinor + bump };
      } else {
        variant.stock = 'out_of_stock';
        variant.stockCount = 0;
      }
    }
    persist();
  },
};
