import type { NyoniApi } from './client';
import { demoControls, mockApi } from './mock/mockApi';

/**
 * The app runs against the in-memory demo API until the application API exists (plan F01–F07).
 * To connect a backend, implement `NyoniApi` over HTTP (base URL from EXPO_PUBLIC_API_URL)
 * and return it here when that variable is set. Never embed store admin keys in the app.
 */
export const apiMode: 'demo' | 'live' = 'demo';

export const api: NyoniApi = mockApi;

export { demoControls };
export * from './errors';
export type * from './types';
export type * from './client';
