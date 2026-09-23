import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type GarmentRef, type LocalPhoto, type TryOnJobState } from '@/api';

import { keys } from './keys';

/** Recorded with each upload so consent can be traced to the wording the shopper saw. */
export const PHOTO_CONSENT_VERSION = '2026-09-v1';

/** Route params for the photo step that start a new preview of the same garment or outfit. */
export function photoParamsFor(garment: GarmentRef): { productId: string } | { closetItemId: string } | { outfitId: string } {
  if (garment.kind === 'product') return { productId: garment.productId };
  if (garment.kind === 'closet') return { closetItemId: garment.itemId };
  return { outfitId: garment.outfitId };
}

export function isTerminalJobState(state: TryOnJobState) {
  return state === 'succeeded' || state === 'failed' || state === 'cancelled' || state === 'expired';
}

export function usePhotos() {
  return useQuery({ queryKey: keys.photos, queryFn: () => api.listPhotos() });
}

/**
 * Uploads the consented photo, then starts the preview job with an idempotency key so a
 * retried request never creates duplicate work.
 */
export function useStartTryOn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      photo: LocalPhoto | null;
      existingPhotoId?: string;
      garment: GarmentRef;
      idempotencyKey: string;
    }) => {
      const photoId =
        input.existingPhotoId ?? (await api.uploadPhoto(input.photo!, PHOTO_CONSENT_VERSION)).id;
      return api.createTryOn({ photoId, garment: input.garment, idempotencyKey: input.idempotencyKey });
    },
    onSuccess: (job) => {
      queryClient.setQueryData(keys.tryOn(job.id), job);
      queryClient.invalidateQueries({ queryKey: keys.activeTryOns });
      queryClient.invalidateQueries({ queryKey: keys.photos });
      queryClient.invalidateQueries({ queryKey: keys.privacy });
      queryClient.invalidateQueries({ queryKey: keys.previewCredits });
    },
  });
}

/** Polls the job while it is running. Polling is the fallback to webhook delivery. */
export function useTryOnJob(id: string | undefined | null) {
  return useQuery({
    queryKey: keys.tryOn(id ?? ''),
    queryFn: () => api.getTryOn(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state && isTerminalJobState(state) ? false : 1500;
    },
    refetchIntervalInBackground: false,
  });
}

export function usePreviewCredits() {
  return useQuery({ queryKey: keys.previewCredits, queryFn: () => api.getPreviewCredits() });
}

export function useActiveTryOns() {
  return useQuery({ queryKey: keys.activeTryOns, queryFn: () => api.getActiveTryOns() });
}

export function useCancelTryOn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.cancelTryOn(id),
    onSuccess: (job) => {
      queryClient.setQueryData(keys.tryOn(job.id), job);
      queryClient.invalidateQueries({ queryKey: keys.activeTryOns });
    },
  });
}

/* Looks */

export function useLook(id: string | undefined) {
  return useQuery({ queryKey: keys.look(id ?? ''), queryFn: () => api.getLook(id!), enabled: !!id });
}

export function useSavedLooks() {
  return useQuery({ queryKey: keys.savedLooks, queryFn: () => api.listSavedLooks() });
}

export function useSetLookSaved() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, saved }: { id: string; saved: boolean }) => api.setLookSaved(id, saved),
    onSuccess: (look) => {
      queryClient.setQueryData(keys.look(look.id), look);
      queryClient.invalidateQueries({ queryKey: keys.savedLooks });
      queryClient.invalidateQueries({ queryKey: keys.privacy });
    },
  });
}

export function useDeleteLook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteLook(id),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: keys.look(id) });
      queryClient.invalidateQueries({ queryKey: keys.savedLooks });
      queryClient.invalidateQueries({ queryKey: keys.privacy });
    },
  });
}

export function useReportLook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.reportLook(id, reason),
    onSuccess: (look) => queryClient.setQueryData(keys.look(look.id), look),
  });
}
