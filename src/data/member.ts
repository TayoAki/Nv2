import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/api';

import { keys } from './keys';

/** Which store features are live ("Sign in with Nyoni", store checkout). */
export function useStoreStatus() {
  return useQuery({ queryKey: keys.storeStatus, queryFn: () => api.getStoreStatus(), staleTime: 60_000 });
}

/** The signed-in member, with purchases synced into the closet; null when signed out. */
export function useMember() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: keys.member,
    queryFn: async () => {
      const member = await api.getMember();
      if (member) await queryClient.invalidateQueries({ queryKey: keys.wardrobeRoot });
      return member;
    },
    staleTime: 60_000,
  });
}

/** After a sign-in, the store sends orders and Club status in the background, so look again shortly. */
const FOLLOW_UPS_MS = [10_000, 30_000, 90_000];

function useRefreshMember() {
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.member }),
      queryClient.invalidateQueries({ queryKey: keys.wardrobeRoot }),
    ]);
  return () => {
    for (const delay of FOLLOW_UPS_MS) setTimeout(() => void refresh(), delay);
    return refresh();
  };
}

export function useSignInWithNyoni() {
  const refresh = useRefreshMember();
  return useMutation({ mutationFn: () => api.signInWithNyoni(), onSuccess: refresh });
}

export function useFinishNyoniSignIn() {
  const refresh = useRefreshMember();
  return useMutation({ mutationFn: (url: string) => api.finishNyoniSignIn(url), onSuccess: refresh });
}

export function useSignOutMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.signOutMember(),
    onSuccess: () => queryClient.setQueryData(keys.member, null),
  });
}

export function useDeleteMemberAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.deleteMemberAccount(),
    onSuccess: async () => {
      queryClient.setQueryData(keys.member, null);
      await queryClient.invalidateQueries({ queryKey: keys.wardrobeRoot });
    },
  });
}

export function useStartStoreCheckout() {
  return useMutation({ mutationFn: () => api.startStoreCheckout() });
}

/** Polls the store's answer every few seconds until it's final. */
export function useStoreCheckoutStatus(ref: string | null) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: keys.storeCheckout(ref ?? ''),
    enabled: !!ref,
    queryFn: async () => {
      const status = await api.getStoreCheckoutStatus(ref!);
      if (status.status === 'paid') await queryClient.invalidateQueries({ queryKey: keys.bag });
      return status;
    },
    refetchInterval: (query) => (query.state.data && query.state.data.status !== 'waiting' && query.state.data.status !== 'pending' ? false : 4000),
  });
}
