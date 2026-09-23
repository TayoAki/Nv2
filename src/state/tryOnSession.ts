import { create } from 'zustand';

import type { LocalPhoto } from '@/api';

type TryOnSession = {
  /** Preview job running in the background, so the shopper can keep browsing. */
  activeJobId: string | null;
  /** Result the shopper hasn't opened yet (drives the "Your preview is ready" pill). */
  unseenJobId: string | null;
  setActiveJob: (jobId: string) => void;
  markSeen: (jobId: string) => void;
  clear: () => void;
};

export const useTryOnSession = create<TryOnSession>((set, get) => ({
  activeJobId: null,
  unseenJobId: null,
  setActiveJob: (jobId) => set({ activeJobId: jobId, unseenJobId: jobId }),
  markSeen: (jobId) => {
    if (get().unseenJobId === jobId) set({ unseenJobId: null });
  },
  clear: () => set({ activeJobId: null, unseenJobId: null }),
}));

type PendingImport = {
  photos: LocalPhoto[];
  manual: boolean;
  setPending: (photos: LocalPhoto[], manual?: boolean) => void;
  clearPending: () => void;
};

/** Hands picked garment photos from the closet screen to the import review screen. */
export const usePendingImport = create<PendingImport>((set) => ({
  photos: [],
  manual: false,
  setPending: (photos, manual = false) => set({ photos, manual }),
  clearPending: () => set({ photos: [], manual: false }),
}));
