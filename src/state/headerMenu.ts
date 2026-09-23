import { create } from 'zustand';

type HeaderMenuState = {
  open: boolean;
  show: () => void;
  hide: () => void;
};

/** The header menu holds profile, recovery and privacy controls (plan section 04). */
export const useHeaderMenu = create<HeaderMenuState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
