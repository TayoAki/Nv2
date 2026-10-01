import { create } from 'zustand';

/** The AI consent sheet, opened from anywhere and answered with a promise. */
type State = {
  open: boolean;
  resolve: ((granted: boolean) => void) | null;
  ask: () => Promise<boolean>;
  answer: (granted: boolean) => void;
};

export const useAiConsentPrompt = create<State>((set, get) => ({
  open: false,
  resolve: null,
  ask: () =>
    new Promise<boolean>((resolve) => {
      get().resolve?.(false); // a previous unanswered prompt counts as "not now"
      set({ open: true, resolve });
    }),
  answer: (granted) => {
    get().resolve?.(granted);
    set({ open: false, resolve: null });
  },
}));
