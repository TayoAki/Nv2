import { create } from 'zustand';

/**
 * Hearted products, kept on the device for now. Store-wishlist synchronization is a later
 * phase in the plan (section 04).
 */
type Favorites = {
  ids: string[];
  toggle: (productId: string) => boolean;
};

export const useFavorites = create<Favorites>((set, get) => ({
  ids: [],
  toggle: (productId) => {
    const has = get().ids.includes(productId);
    set({ ids: has ? get().ids.filter((id) => id !== productId) : [...get().ids, productId] });
    return !has;
  },
}));
