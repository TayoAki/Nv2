import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

/**
 * Stack screens stay mounted, so React Query does not refetch when they regain focus.
 * This refetches on every focus after the first.
 */
export function useRefreshOnFocus(refetch: () => unknown) {
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      refetch();
    }, [refetch]),
  );
}
