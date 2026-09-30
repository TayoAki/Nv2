import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type LocalPhoto } from '@/api';

import { keys } from './keys';

/** Recorded with each measurement so consent can be traced to the wording the shopper saw. */
export const BODY_CONSENT_VERSION = '2026-09-measure-v1';

export function useBodyMeasurements() {
  return useQuery({ queryKey: keys.bodyMeasurements, queryFn: () => api.getBodyMeasurements() });
}

export function useMeasureBody() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { front: LocalPhoto; side: LocalPhoto; heightCm: number }) =>
      api.measureBody({ ...input, consentVersion: BODY_CONSENT_VERSION }),
    onSuccess: (result) => {
      queryClient.setQueryData(keys.bodyMeasurements, result);
      queryClient.invalidateQueries({ queryKey: keys.privacy });
    },
  });
}

export function useDeleteBodyMeasurements() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.deleteBodyMeasurements(),
    onSuccess: () => {
      queryClient.setQueryData(keys.bodyMeasurements, null);
      queryClient.invalidateQueries({ queryKey: keys.privacy });
    },
  });
}
