import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** Same codes as the app's ApiErrorCode, so the app can show the right state. */
export type ErrorCode = 'validation' | 'not_found' | 'unauthorized' | 'conflict' | 'server';

const STATUS: Record<ErrorCode, ContentfulStatusCode> = {
  validation: 400,
  unauthorized: 401,
  not_found: 404,
  conflict: 409,
  server: 500,
};

export class HttpError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: ContentfulStatusCode = STATUS[code],
  ) {
    super(message);
  }
}

export const errorBody = (code: ErrorCode, message: string) => ({ error: { code, message } });
