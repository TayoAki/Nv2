import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

import { apiMode, isApiError } from '@/api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Retry once for transient failures; never retry validation, missing or expired data.
      retry: (failureCount, error) =>
        failureCount < 1 &&
        !(isApiError(error) && ['validation', 'not_found', 'expired', 'quota'].includes(error.code)),
      retryDelay: 800,
      // The demo API runs on-device, so it keeps working without a connection.
      networkMode: apiMode === 'demo' ? 'always' : 'online',
    },
    mutations: {
      retry: false,
      networkMode: apiMode === 'demo' ? 'always' : 'online',
    },
  },
});

let wired = false;

/** Connects React Query to device connectivity and app focus. Call once at startup. */
export function wireQueryEnvironment() {
  if (wired) return;
  wired = true;
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)),
  );
  if (Platform.OS !== 'web') {
    AppState.addEventListener('change', (status) => focusManager.setFocused(status === 'active'));
  }
}
