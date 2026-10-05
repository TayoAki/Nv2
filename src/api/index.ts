import type { NyoniApi } from './client';
import { demoControls, invalidateCatalog, mockApi } from './mock/mockApi';
import { createServerAdminApi, serverUrl } from './server';

/**
 * Shopper features still run on the in-app demo backend (`apiMode` 'demo'). When
 * EXPO_PUBLIC_API_URL points at the Nyoni server, the catalog and the store admin use it:
 * products, sizes, stock and prices come from the server, and staff sign in against it.
 * Never embed store admin keys in the app.
 */
export const apiMode: 'demo' | 'live' = 'demo';

/** Where the store admin signs in and saves: the Nyoni server, or the demo backend. */
export const adminBackend: 'server' | 'demo' = serverUrl ? 'server' : 'demo';

export const api: NyoniApi = serverUrl ? { ...mockApi, ...createServerAdminApi(invalidateCatalog) } : mockApi;

export { serverUrl };
export { demoControls };
export * from './errors';
export type * from './types';
export type * from './client';
