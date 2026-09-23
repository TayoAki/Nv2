import AsyncStorage from '@react-native-async-storage/async-storage';

import type { InventoryOverride } from '../catalog/capsule';

import type {
  AdminSession,
  BagLine,
  ColorInfo,
  GarmentKind,
  GarmentRef,
  TryOnFailureCode,
  Look,
  Money,
  Outfit,
  PersonPhoto,
  Product,
  Session,
  StylistMessage,
  StyleProfile,
  WardrobeImport,
  WardrobeItem,
} from '../types';

import {
  buildCatalog,
  buildDemoLooks,
  buildOutfits,
  buildThread,
  buildWardrobe,
  defaultStyleProfile,
  usd,
} from './fixtures';

/** Bump when fixture or storage shapes change; older saved demo data is replaced. */
const DB_VERSION = 7;
const STORAGE_KEY = 'nyoni.demo-db';

export type JobScenario = 'normal' | 'slow' | 'timeout' | 'ai_failure' | 'quota';

export type StoredBagLine = {
  id: string;
  productId: string;
  variantId: string;
  quantity: number;
  /** Price the shopper last accepted; a mismatch raises a "price changed" notice. */
  priceSeen: Money;
};

export type StoredJob = {
  id: string;
  photoId: string;
  garment: GarmentRef;
  garmentTitle: string;
  garmentKind: GarmentKind;
  garmentColor: ColorInfo;
  scopeNote?: string;
  idempotencyKey: string;
  scenario: JobScenario;
  createdAt: string;
  cancelledAt?: string;
  lookId?: string;
  /** Render batch on the Nyoni server, and its last known state. */
  server?: {
    batchId: string;
    status: 'running' | 'done' | 'partial' | 'failed';
    processing: boolean;
    resultUrl: string | null;
    errorCode: string | null;
    simulated: boolean;
  };
  /** Settled before any work started (e.g. no credits left). */
  failureCode?: TryOnFailureCode;
};

export type StoredHandoff = {
  attemptId: string;
  createdAt: string;
  expiresAt: string;
  status: 'open' | 'used' | 'cancelled';
};

export type StoredReceipt = {
  id: string;
  reference: string;
  attemptId: string;
  lines: BagLine[];
  subtotal: Money;
  createdAt: string;
  outcome: 'paid' | 'failed';
  settled: boolean;
  addToClosetOptIn: boolean;
  orderedItemIds: string[];
};

export type PendingSignIn = { email: string; mode: 'sign_in' | 'recover'; expiresAt: string };

export type MockDb = {
  version: number;
  seed: 'demo' | 'empty';
  products: Product[];
  /** Admin-panel edits to sizes, stock and price. Store data: kept when demo data resets. */
  inventory: Record<string, InventoryOverride>;
  /** Staff session for the admin panel; kept when demo data resets. */
  adminSession: AdminSession | null;
  bag: StoredBagLine[];
  photos: PersonPhoto[];
  jobs: StoredJob[];
  looks: Look[];
  handoffs: StoredHandoff[];
  receipts: StoredReceipt[];
  wardrobe: WardrobeItem[];
  imports: WardrobeImport[];
  outfits: Outfit[];
  thread: StylistMessage[];
  styleProfile: StyleProfile;
  session: Session;
  pendingSignIn: PendingSignIn | null;
  pendingMigration: { accountHasData: boolean } | null;
  reuseTryOnPhoto: boolean;
  accountDeletion: 'none' | 'pending';
  orderCounter: number;
};

export function createDb(
  seed: 'demo' | 'empty',
  now = Date.now(),
  inventory: Record<string, InventoryOverride> = {},
): MockDb {
  const demo = seed === 'demo';
  const products = buildCatalog(inventory);
  return {
    version: DB_VERSION,
    seed,
    products,
    inventory,
    adminSession: null,
    bag: demo
      ? [
          {
            id: 'b-nathan-42',
            productId: 'p-nathan',
            variantId: 'p-nathan-42',
            quantity: 1,
            priceSeen: usd(895),
          },
        ]
      : [],
    photos: [],
    jobs: [],
    looks: demo ? buildDemoLooks(now) : [],
    handoffs: [],
    receipts: [],
    wardrobe: demo ? buildWardrobe(now) : [],
    imports: [],
    outfits: demo ? buildOutfits(now) : [],
    thread: demo ? buildThread(now) : [],
    styleProfile: defaultStyleProfile(now),
    session: { kind: 'guest', guestId: `guest-${Math.random().toString(36).slice(2, 10)}` },
    pendingSignIn: null,
    pendingMigration: null,
    reuseTryOnPhoto: false,
    accountDeletion: 'none',
    orderCounter: 0,
  };
}

let db: MockDb | null = null;
let loading: Promise<MockDb> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

async function load(): Promise<MockDb> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MockDb;
      if (parsed.version === DB_VERSION) {
        db = parsed;
        return parsed;
      }
    }
  } catch {
    // Unreadable demo data: start fresh below.
  }
  db = createDb('demo');
  persist();
  return db;
}

/** Resolves once saved demo data is loaded (or a fresh demo seed is created). */
export function getDb(): Promise<MockDb> {
  if (db) return Promise.resolve(db);
  loading ??= load();
  return loading;
}

/** Debounced write of the demo database to device storage. */
export function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (db) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(db)).catch(() => undefined);
  }, 250);
}

/** Writes immediately, for changes that must survive a reload right away (sign-out). */
export async function persistNow() {
  if (saveTimer) clearTimeout(saveTimer);
  if (db) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(db)).catch(() => undefined);
}

export async function resetDb(seed: 'demo' | 'empty'): Promise<MockDb> {
  // Admin-panel edits are store data, not shopper demo data, so they survive a reset.
  const previous = db;
  db = createDb(seed, Date.now(), previous?.inventory ?? {});
  db.adminSession = previous?.adminSession ?? null;
  loading = Promise.resolve(db);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  return db;
}
