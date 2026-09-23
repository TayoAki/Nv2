import { create } from 'zustand';

export type Toast = {
  id: number;
  message: string;
  tone: 'default' | 'error';
  actionLabel?: string;
  onAction?: () => void;
};

type ToastState = {
  toast: Toast | null;
  show: (message: string, options?: Omit<Toast, 'id' | 'message' | 'tone'> & { tone?: Toast['tone'] }) => void;
  hide: () => void;
};

let counter = 0;
let hideTimer: ReturnType<typeof setTimeout> | undefined;

export const useToast = create<ToastState>((set) => ({
  toast: null,
  show: (message, options) => {
    counter += 1;
    const id = counter;
    set({ toast: { id, message, tone: options?.tone ?? 'default', ...options } });
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      set((state) => (state.toast?.id === id ? { toast: null } : state));
    }, options?.actionLabel ? 5000 : 3200);
  },
  hide: () => set({ toast: null }),
}));

/** Imperative helper for use outside components (mutation callbacks). */
export const showToast = (...args: Parameters<ToastState['show']>) => useToast.getState().show(...args);
