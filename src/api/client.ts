import type {
  Availability,
  Bag,
  CheckoutHandoff,
  ColorInfo,
  GarmentRef,
  LocalPhoto,
  Look,
  Occasion,
  OrderReceipt,
  PersonPhoto,
  PrivacyOverview,
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
export interface NyoniApi {
  /* Catalog: store authoritative, read cache allowed. */
  listProducts(query?: ProductQuery): Promise<Product[]>;
  getProduct(id: string): Promise<Product>;

  /* Photos: POST /photos/upload-intent + POST /photos/:id/complete; DELETE /photos/:id */
  uploadPhoto(photo: LocalPhoto, consentVersion: string): Promise<PersonPhoto>;
  listPhotos(): Promise<PersonPhoto[]>;
  deletePhoto(id: string): Promise<{ providerCleanup: 'done' | 'retrying' }>;

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
  setReuseTryOnPhoto(enabled: boolean): Promise<PrivacyOverview>;
  deleteAllPhotos(): Promise<{ providerCleanup: 'done' | 'retrying' }>;
  requestAccountDeletion(): Promise<PrivacyOverview>;
}
