import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/api';

import { keys } from './keys';

export function useSession() {
  return useQuery({ queryKey: keys.session, queryFn: () => api.getSession() });
}

export function useRequestSignInLink() {
  return useMutation({
    mutationFn: ({ email, mode }: { email: string; mode: 'sign_in' | 'recover' }) =>
      api.requestSignInLink(email, mode),
  });
}

export function useCompleteDemoSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.completeDemoSignIn(),
    onSuccess: (result) => queryClient.setQueryData(keys.session, result.session),
  });
}

export function useResolveGuestMigration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (choice: 'move' | 'merge' | 'keep_account' | 'skip') => api.resolveGuestMigration(choice),
    onSuccess: (session) => queryClient.setQueryData(keys.session, session),
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.signOut(),
    onSuccess: (session) => queryClient.setQueryData(keys.session, session),
  });
}

export function usePrivacyOverview() {
  return useQuery({ queryKey: keys.privacy, queryFn: () => api.getPrivacyOverview() });
}

export function useSetReuseTryOnPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => api.setReuseTryOnPhoto(enabled),
    onSuccess: (overview) => {
      queryClient.setQueryData(keys.privacy, overview);
      queryClient.invalidateQueries({ queryKey: keys.photos });
    },
  });
}

export function useDeletePhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deletePhoto(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.privacy });
      queryClient.invalidateQueries({ queryKey: keys.photos });
      queryClient.invalidateQueries({ queryKey: keys.tryOnRoot });
    },
  });
}

export function useDeleteAllPhotos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.deleteAllPhotos(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.privacy });
      queryClient.invalidateQueries({ queryKey: keys.photos });
      queryClient.invalidateQueries({ queryKey: keys.tryOnRoot });
    },
  });
}

export function useRequestAccountDeletion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.requestAccountDeletion(),
    onSuccess: (overview) => queryClient.setQueryData(keys.privacy, overview),
  });
}
