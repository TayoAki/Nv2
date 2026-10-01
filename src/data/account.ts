import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, serverUrl } from '@/api';
import { useAiConsentPrompt } from '@/state/aiConsentPrompt';

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

/** Version of the AI consent wording, recorded with the shopper's answer. */
export const AI_CONSENT_VERSION = '2026-10-ai-v1';

export function useSetAiConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (granted: boolean) => api.setAiConsent(granted, AI_CONSENT_VERSION),
    onSuccess: (overview) => queryClient.setQueryData(keys.privacy, overview),
  });
}

/**
 * Before any personal data goes to the third-party AI services, make sure the shopper agreed
 * (Apple 5.1.2(i)). Resolves true when allowed. Builds without the Nyoni server send nothing
 * anywhere, so they never ask.
 */
export function useEnsureAiConsent() {
  const queryClient = useQueryClient();
  const ask = useAiConsentPrompt((state) => state.ask);
  return async () => {
    if (!serverUrl) return true;
    const overview = await queryClient.fetchQuery({ queryKey: keys.privacy, queryFn: () => api.getPrivacyOverview(), staleTime: 0 });
    if (overview.aiConsent) return true;
    return ask();
  };
}

export function useDeleteAllMyData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.deleteAllMyData(),
    onSuccess: () => queryClient.resetQueries(),
  });
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
