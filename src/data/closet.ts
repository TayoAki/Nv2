import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type ConfirmDraftInput, type LocalPhoto, type WardrobeItemPatch } from '@/api';

import { keys } from './keys';

export function useWardrobe() {
  return useQuery({ queryKey: keys.wardrobe, queryFn: () => api.listWardrobe() });
}

export function useWardrobeItem(id: string | undefined) {
  return useQuery({
    queryKey: keys.wardrobeItem(id ?? ''),
    queryFn: () => api.getWardrobeItem(id!),
    enabled: !!id,
  });
}

/** Closet edits can change outfits that reference the item, so those are refreshed too. */
function useInvalidateCloset() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: keys.wardrobeRoot });
    queryClient.invalidateQueries({ queryKey: keys.outfitRoot });
    queryClient.invalidateQueries({ queryKey: keys.privacy });
  };
}

export function useUpdateWardrobeItem() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateCloset();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: WardrobeItemPatch }) => api.updateWardrobeItem(id, patch),
    onSuccess: (item) => {
      queryClient.setQueryData(keys.wardrobeItem(item.id), item);
      invalidate();
    },
  });
}

export function useDeleteWardrobeItem() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateCloset();
  return useMutation({
    mutationFn: (id: string) => api.deleteWardrobeItem(id),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: keys.wardrobeItem(id) });
      invalidate();
    },
  });
}

export function useCreateWardrobeImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ photos, manual }: { photos: LocalPhoto[]; manual?: boolean }) =>
      api.createWardrobeImport(photos, { manual }),
    onSuccess: (imp) => queryClient.setQueryData(keys.wardrobeImport(imp.id), imp),
  });
}

export function useWardrobeImport(id: string | undefined) {
  return useQuery({
    queryKey: keys.wardrobeImport(id ?? ''),
    queryFn: () => api.getWardrobeImport(id!),
    enabled: !!id,
  });
}

export function useAddImportPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ importId, draftId, photo }: { importId: string; draftId: string; photo: LocalPhoto }) =>
      api.addImportPhoto(importId, draftId, photo),
    onSuccess: (imp) => queryClient.setQueryData(keys.wardrobeImport(imp.id), imp),
  });
}

export function useConfirmImportDraft() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateCloset();
  return useMutation({
    mutationFn: ({ importId, draftId, input }: { importId: string; draftId: string; input: ConfirmDraftInput }) =>
      api.confirmImportDraft(importId, draftId, input),
    onSuccess: (_, { importId }) => {
      queryClient.invalidateQueries({ queryKey: keys.wardrobeImport(importId) });
      invalidate();
    },
  });
}

export function useDiscardImportDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ importId, draftId }: { importId: string; draftId: string }) =>
      api.discardImportDraft(importId, draftId),
    onSuccess: (imp) => queryClient.setQueryData(keys.wardrobeImport(imp.id), imp),
  });
}
