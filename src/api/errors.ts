export type ApiErrorCode =
  | 'network' // no connection
  | 'not_found'
  | 'validation' // bad input; message is safe to show
  | 'conflict' // stock or price changed, handoff reused…
  | 'expired' // link, handoff, preview or photo expired
  | 'quota' // fair-use allowance reached
  | 'model_failure' // AI stylist or recognition unavailable
  | 'unavailable' // service outage
  | 'unauthorized' // staff sign-in required or expired
  | 'server';

export class ApiError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isNetworkError(error: unknown): boolean {
  return isApiError(error) && error.code === 'network';
}

/** A message that is safe to show to shoppers. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (isApiError(error) && error.code !== 'server') return error.message;
  return fallback;
}
