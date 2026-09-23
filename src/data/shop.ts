import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type ProductQuery } from '@/api';

import { keys } from './keys';

/* Catalog */

export function useProducts(query: ProductQuery = {}) {
  return useQuery({ queryKey: keys.products(query), queryFn: () => api.listProducts(query) });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: keys.product(id ?? ''),
    queryFn: () => api.getProduct(id!),
    enabled: !!id,
  });
}

/* Bag: prices and stock are revalidated by the API on every read and write. */

export function useBag() {
  return useQuery({ queryKey: keys.bag, queryFn: () => api.getBag() });
}

export function useAddToBag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.addToBag,
    onSuccess: (bag) => queryClient.setQueryData(keys.bag, bag),
  });
}

export function useUpdateBagLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lineId, quantity }: { lineId: string; quantity: number }) =>
      api.updateBagLine(lineId, quantity),
    onSuccess: (bag) => queryClient.setQueryData(keys.bag, bag),
  });
}

export function useRemoveBagLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lineId: string) => api.removeBagLine(lineId),
    onSuccess: (bag) => queryClient.setQueryData(keys.bag, bag),
  });
}

export function useAcceptBagChanges() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.acceptBagChanges(),
    onSuccess: (bag) => {
      queryClient.setQueryData(keys.bag, bag);
      queryClient.invalidateQueries({ queryKey: ['product'] });
    },
  });
}

/* Checkout and orders */

export function useCreateCheckoutHandoff() {
  return useMutation({ mutationFn: () => api.createCheckoutHandoff() });
}

export function useCancelCheckout() {
  return useMutation({ mutationFn: (attemptId: string) => api.cancelCheckout(attemptId) });
}

export function useSubmitDemoCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attemptId: string) => api.submitDemoCheckout(attemptId),
    onSuccess: (receipt) => queryClient.setQueryData(keys.receipt(receipt.id), receipt),
  });
}

/** Polls until the store confirms the order; success is never shown before verification. */
export function useReceipt(id: string | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: keys.receipt(id ?? ''),
    queryFn: async () => {
      const receipt = await api.getReceipt(id!);
      if (receipt.status !== 'pending') {
        queryClient.invalidateQueries({ queryKey: keys.bag });
        queryClient.invalidateQueries({ queryKey: keys.wardrobeRoot });
      }
      return receipt;
    },
    enabled: !!id,
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? 1200 : false),
  });
}

export function useSetReceiptClosetOptIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, optIn }: { id: string; optIn: boolean }) => api.setReceiptClosetOptIn(id, optIn),
    onSuccess: (receipt) => {
      queryClient.setQueryData(keys.receipt(receipt.id), receipt);
      queryClient.invalidateQueries({ queryKey: keys.wardrobeRoot });
    },
  });
}
