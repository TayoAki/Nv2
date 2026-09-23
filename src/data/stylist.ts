import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type StyleProfilePatch } from '@/api';

import { keys } from './keys';

export function useStylistThread() {
  return useQuery({ queryKey: keys.thread, queryFn: () => api.getStylistThread() });
}

export function useSendStylistMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { text: string; ownedOnly: boolean; focusItemId?: string }) =>
      api.sendStylistMessage(input),
    onSuccess: (thread) => {
      queryClient.setQueryData(keys.thread, thread);
      queryClient.invalidateQueries({ queryKey: keys.privacy });
    },
  });
}

export function useClearStylistHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.clearStylistHistory(),
    onSuccess: () => {
      queryClient.setQueryData(keys.thread, { messages: [] });
      queryClient.invalidateQueries({ queryKey: keys.outfitRoot });
      queryClient.invalidateQueries({ queryKey: keys.privacy });
    },
  });
}

export function useOutfit(id: string | undefined) {
  return useQuery({ queryKey: keys.outfit(id ?? ''), queryFn: () => api.getOutfit(id!), enabled: !!id });
}

export function useSavedOutfits() {
  return useQuery({ queryKey: keys.savedOutfits, queryFn: () => api.listSavedOutfits() });
}

export function useSetOutfitSaved() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, saved }: { id: string; saved: boolean }) => api.setOutfitSaved(id, saved),
    onSuccess: (outfit) => {
      queryClient.setQueryData(keys.outfit(outfit.id), outfit);
      queryClient.invalidateQueries({ queryKey: keys.savedOutfits });
    },
  });
}

export function useSwapOutfitItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ outfitId, index, itemId }: { outfitId: string; index: number; itemId: string }) =>
      api.swapOutfitItem(outfitId, index, itemId),
    onSuccess: (outfit) => {
      queryClient.setQueryData(keys.outfit(outfit.id), outfit);
      queryClient.invalidateQueries({ queryKey: keys.savedOutfits });
    },
  });
}

export function useDeleteOutfit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteOutfit(id),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: keys.outfit(id) });
      queryClient.invalidateQueries({ queryKey: keys.savedOutfits });
    },
  });
}

export function useStyleProfile() {
  return useQuery({ queryKey: keys.styleProfile, queryFn: () => api.getStyleProfile() });
}

export function useUpdateStyleProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: StyleProfilePatch) => api.updateStyleProfile(patch),
    onSuccess: (profile) => queryClient.setQueryData(keys.styleProfile, profile),
  });
}
