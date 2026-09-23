import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  BagLine,
  ColorInfo,
  GarmentKind,
  GarmentRef,
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
const DB_VERSION = 3;
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

export function createDb(seed: 'demo' | 'empty', now = Date.now()): MockDb {
  const demo = seed === 'demo';
  const products = buildCatalog();
  return {
    version: DB_VERSION,
    seed,
    products,
    bag: demo
      ? [
          {
            id: 'b-berry-42',
            productId: 'p-berry-peak-two-piece-suit',
            variantId: 'p-berry-peak-two-piece-suit-42',
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

export async function resetDb(seed: 'demo' | 'empty'): Promise<MockDb> {
  db = createDb(seed);
  loading = Promise.resolve(db);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  return db;
}
