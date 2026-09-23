import { useNetInfo } from '@react-native-community/netinfo';

import { useDevSettings } from '@/state/devSettings';

/** True when the device reports no connection, or the demo "Offline" scenario is on. */
export function useIsOffline(): boolean {
  const netInfo = useNetInfo();
  const scenario = useDevSettings((state) => state.scenario);
  return netInfo.isConnected === false || scenario === 'offline';
}
