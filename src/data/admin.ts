import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type InventoryUpdate, type Product } from '@/api';

import { keys } from './keys';

/* Admin panel: sizes, stock and price per product. */

export function useAdminProducts() {
  return useQuery({ queryKey: keys.adminProducts, queryFn: () => api.adminListProducts() });
}

/** Every place that shows a product, a size or a price reads fresh data after an edit. */
function useRefreshCatalog() {
  const queryClient = useQueryClient();
  return (product: Product) => {
    queryClient.setQueryData(keys.product(product.id), product);
    queryClient.invalidateQueries({ queryKey: keys.adminProducts });
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['product'] });
    queryClient.invalidateQueries({ queryKey: keys.bag });
  };
}

export function useUpdateInventory() {
  const refresh = useRefreshCatalog();
  return useMutation({
    mutationFn: ({ productId, update }: { productId: string; update: InventoryUpdate }) =>
      api.updateInventory(productId, update),
    onSuccess: refresh,
  });
}

export function useResetInventory() {
  const refresh = useRefreshCatalog();
  return useMutation({ mutationFn: (productId: string) => api.resetInventory(productId), onSuccess: refresh });
}
