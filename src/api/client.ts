import type {
  Availability,
  Bag,
  BodyMeasurements,
  CheckoutHandoff,
  ColorInfo,
  GarmentRef,
  LocalPhoto,
  Look,
  Occasion,
  OrderReceipt,
  PersonPhoto,
  PrivacyOverview,
  AdminReport,
  AdminStoreLink,
  AdminSession,
  InventoryUpdate,
  Product,
  ProductQuery,
  ResolvedOutfit,
  Session,
  SignInLinkResult,
  StyleDirection,
  StyleProfile,
  StylistThread,
  TryOnJob,
  WardrobeCategory,
  WardrobeImport,
  WardrobeItem,
} from './types';
import type { StoreCheckoutStatus, StoreMemberView } from './ai';
import type { StoreStatus } from './store';

export type WardrobeItemPatch = Partial<{
  name: string;
  category: WardrobeCategory;
  color: ColorInfo | null;
  pattern: string | null;
  brand: string | null;
  size: string | null;
  availability: Availability;
  archived: boolean;
  favorite: boolean;
  ownership: 'owned' | 'ordered';
}>;

export type ConfirmDraftInput = {
  name: string;
  category: WardrobeCategory;
  color: ColorInfo | null;
  pattern: string | null;
  brand: string | null;
  size: string | null;
  bestPhotoIndex: number;
};

export type StyleProfilePatch = Partial<{
  occasions: Occasion[];
  styleDirection: StyleDirection;
  budgetMinor: number | null;
  ownedFirst: boolean;
  city: string | null;
}>;

export type SignInResult = {
  session: Session;
  /** Guest data on this device that could move to the account. */
  guestItemCount: number;
  /** The account already holds a closet from another device. */
  accountHasData: boolean;
};

/**
 * The application API contract (plan sections 06 and 14). The mobile app talks only to
 * this API; the API owns store, AI-provider and storage integrations. Every private route
 * checks ownership server-side, and the client never sends prices or remote image URLs.
 *
 * `src/api/mock` implements it in memory for the demo build.
 */
export type { StoreCheckoutStatus, StoreMemberView, StoreStatus };

export type StorePurchase = {
  id: number;
  status: string;
  createdAt: string | null;
  items: { name: string; quantity: number; productId: string | null; size: string | null; image: string | null }[];
};

export interface NyoniApi {
  /* Catalog: store authoritative, read cache allowed. */
  listProducts(query?: ProductQuery): Promise<Product[]>;
  getProduct(id: string): Promise<Product>;

  /*
   * Admin panel (staff only): sizes, stock and price per product. Live: backed by the
   * WooCommerce REST API through the app server, which also pulls stock from the store.
   */
  /** Staff sign-in for the admin panel (web only). Live: the app server's staff auth. */
  getAdminSession(): Promise<AdminSession | null>;
  adminSignIn(email: string, password: string): Promise<AdminSession>;
  adminSignOut(): Promise<void>;
  /** Admin methods reject with `unauthorized` without a valid staff session. */
  adminListProducts(): Promise<Product[]>;
  updateInventory(productId: string, update: InventoryUpdate): Promise<Product>;
  /** Drops admin edits and returns to the store export's sizes, stock and price. */
  resetInventory(productId: string): Promise<Product>;
  /** Shopper reports about AI previews, newest open ones first. */
  adminListReports(): Promise<AdminReport[]>;
  adminMarkReportReviewed(id: string): Promise<void>;
  adminGetStoreLink(): Promise<AdminStoreLink>;
  adminMarkDeletionDone(id: string): Promise<void>;

  /* Photos: POST /photos/upload-intent + POST /photos/:id/complete; DELETE /photos/:id */
  uploadPhoto(photo: LocalPhoto, consentVersion: string): Promise<PersonPhoto>;
  listPhotos(): Promise<PersonPhoto[]>;
  deletePhoto(id: string): Promise<{ providerCleanup: 'done' | 'retrying' }>;

  /** Preview credits left on this device (1 per preview), or null when previews aren't metered. */
  getPreviewCredits(): Promise<number | null>;

  /* Body measurements: POST /measurements (front + side photo, height). Photos aren't kept. */
  measureBody(input: { front: LocalPhoto; side: LocalPhoto; heightCm: number; consentVersion: string }): Promise<BodyMeasurements>;
  /** One photo during a guided scan: rejects with what to fix when the pose isn't right. */
  checkScanPhoto(input: { photo: LocalPhoto; view: 'front' | 'side' }): Promise<void>;
  getBodyMeasurements(): Promise<BodyMeasurements | null>;
  deleteBodyMeasurements(): Promise<void>;

  /* Try-on jobs: POST /try-ons, GET /try-ons/:id, POST /try-ons/:id/cancel */
  createTryOn(input: { photoId: string; garment: GarmentRef; idempotencyKey: string }): Promise<TryOnJob>;
  getTryOn(id: string): Promise<TryOnJob>;
  cancelTryOn(id: string): Promise<TryOnJob>;
  getActiveTryOns(): Promise<TryOnJob[]>;

  /* Looks (AI previews): POST /looks, DELETE /looks/:id */
  getLook(id: string): Promise<Look>;
  listSavedLooks(): Promise<Look[]>;
  setLookSaved(id: string, saved: boolean): Promise<Look>;
  deleteLook(id: string): Promise<void>;
  reportLook(id: string, reason: string): Promise<Look>;

  /* Bag: server/session cart binding; prices always come from the store. */
  getBag(): Promise<Bag>;
  addToBag(input: { productId: string; variantId: string; quantity: number }): Promise<Bag>;
  updateBagLine(lineId: string, quantity: number): Promise<Bag>;
  removeBagLine(lineId: string): Promise<Bag>;
  acceptBagChanges(): Promise<Bag>;

  /* Checkout: POST /checkout-handoffs, GET /receipts/:id */
  createCheckoutHandoff(): Promise<CheckoutHandoff>;
  cancelCheckout(attemptId: string): Promise<void>;
  /** Demo only: stands in for the store-hosted checkout page. */
  submitDemoCheckout(attemptId: string): Promise<OrderReceipt>;
  getReceipt(id: string): Promise<OrderReceipt>;
  setReceiptClosetOptIn(id: string, optIn: boolean): Promise<OrderReceipt>;

  /* Wardrobe: /wardrobe/imports, /wardrobe/items/:id */
  listWardrobe(): Promise<WardrobeItem[]>;
  /** Guests: show or remove the example closet (Nyoni pieces to try the stylist with). */
  setExampleCloset(enabled: boolean): Promise<WardrobeItem[]>;
  /**
   * Store purchases into the closet ("Sign in with Nyoni"): one piece per purchased item,
   * "Ordered" until the store completes the order, removed when it's refunded or cancelled.
   * Examples are dropped once a member has real purchases.
   */
  syncPurchases(orders: StorePurchase[]): Promise<void>;

  /* Store link ("Sign in with Nyoni", store checkout). Off in demo builds and until the plugin is connected. */
  getStoreStatus(): Promise<StoreStatus | null>;
  /** Opens the store's login page; resolves when the shopper is back, signed in or not. */
  signInWithNyoni(): Promise<'signed_in' | 'cancelled'>;
  /** Finishes a sign-in from the store's redirect (the /auth screen). */
  finishNyoniSignIn(url: string): Promise<void>;
  /** The member's profile, Club status and purchases (also brought into the closet); null when signed out. */
  getMember(): Promise<StoreMemberView | null>;
  signOutMember(): Promise<void>;
  /** "Delete my account": the app server's copy at once, the store account by Nyoni's team. */
  deleteMemberAccount(): Promise<void>;
  /** The bag as a store checkout link, after the server re-checks prices and stock. */
  startStoreCheckout(): Promise<{ ref: string; url: string }>;
  /** What the store says about that checkout. Only the store confirms an order. */
  getStoreCheckoutStatus(ref: string): Promise<StoreCheckoutStatus>;
  getWardrobeItem(id: string): Promise<WardrobeItem>;
  updateWardrobeItem(id: string, patch: WardrobeItemPatch): Promise<WardrobeItem>;
  deleteWardrobeItem(id: string): Promise<{ affectedOutfitIds: string[] }>;
  createWardrobeImport(photos: LocalPhoto[], options?: { manual?: boolean }): Promise<WardrobeImport>;
  getWardrobeImport(id: string): Promise<WardrobeImport>;
  addImportPhoto(importId: string, draftId: string, photo: LocalPhoto): Promise<WardrobeImport>;
  confirmImportDraft(importId: string, draftId: string, input: ConfirmDraftInput): Promise<WardrobeItem>;
  discardImportDraft(importId: string, draftId: string): Promise<WardrobeImport>;

  /* Stylist: POST /stylist/recommendations */
  getStylistThread(): Promise<StylistThread>;
  sendStylistMessage(input: { text: string; ownedOnly: boolean; focusItemId?: string }): Promise<StylistThread>;
  clearStylistHistory(): Promise<void>;

  /* Outfits: POST /outfits, DELETE /outfits/:id */
  getOutfit(id: string): Promise<ResolvedOutfit>;
  listSavedOutfits(): Promise<ResolvedOutfit[]>;
  setOutfitSaved(id: string, saved: boolean): Promise<ResolvedOutfit>;
  swapOutfitItem(outfitId: string, index: number, itemId: string): Promise<ResolvedOutfit>;
  deleteOutfit(id: string): Promise<void>;

  /* Style profile: PATCH /style-profile */
  getStyleProfile(): Promise<StyleProfile>;
  updateStyleProfile(patch: StyleProfilePatch): Promise<StyleProfile>;

  /* Account */
  getSession(): Promise<Session>;
  requestSignInLink(email: string, mode: 'sign_in' | 'recover'): Promise<SignInLinkResult>;
  /** Demo only: stands in for opening the emailed link. */
  completeDemoSignIn(): Promise<SignInResult>;
  resolveGuestMigration(choice: 'move' | 'merge' | 'keep_account' | 'skip'): Promise<Session>;
  signOut(): Promise<Session>;

  /* Privacy */
  getPrivacyOverview(): Promise<PrivacyOverview>;
  /** Grant or withdraw permission to use the third-party AI services. */
  setAiConsent(granted: boolean, version: string): Promise<PrivacyOverview>;
  /** Guests: erase everything on this device and on the Nyoni server, then start fresh. */
  deleteAllMyData(): Promise<void>;
  setReuseTryOnPhoto(enabled: boolean): Promise<PrivacyOverview>;
  deleteAllPhotos(): Promise<{ providerCleanup: 'done' | 'retrying' }>;
  requestAccountDeletion(): Promise<PrivacyOverview>;
}
