import AsyncStorage from '@react-native-async-storage/async-storage';

import { withBundledImages } from './catalog/capsule';
import type { NyoniApi } from './client';
import { ApiError, type ApiErrorCode } from './errors';
import type { AdminSession, Product } from './types';

/**
 * The Nyoni server (server/, deployed on Railway). Set EXPO_PUBLIC_API_URL to use it; without
 * it the app runs entirely on the in-app demo backend.
 */
export const serverUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '') || null;

const TOKEN_KEY = 'nyoni.admin-token';
const TIMEOUT_MS = 15_000;
const SERVER_CODES: ApiErrorCode[] = ['validation', 'not_found', 'unauthorized', 'conflict', 'quota', 'unavailable', 'server'];

/** Session tokens are kept in AsyncStorage; the key names who they belong to. */
export async function readStored(key: string) {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function writeStored(key: string, value: string | null) {
  try {
    if (value) await AsyncStorage.setItem(key, value);
    else await AsyncStorage.removeItem(key);
  } catch {
    // Storage unavailable (private window): the token lasts until the page closes.
  }
}

const readToken = () => readStored(TOKEN_KEY);
const writeToken = (token: string | null) => writeStored(TOKEN_KEY, token);

export type HttpInit = {
  method?: string;
  /** JSON body, or raw bytes (photo uploads). */
  body?: unknown;
  /** Staff bearer token from the admin sign-in. */
  auth?: boolean;
  /** Shopper device token (`Authorization: Device …`). */
  device?: string;
  timeoutMs?: number;
};

export async function http<T>(path: string, init: HttpInit = {}): Promise<T> {
  if (!serverUrl) throw new ApiError('unavailable', 'The Nyoni server isn’t configured.');
  const headers: Record<string, string> = {};
  const raw = typeof Blob !== 'undefined' && init.body instanceof Blob;
  if (init.body !== undefined) headers['content-type'] = raw ? (init.body as Blob).type || 'image/jpeg' : 'application/json';
  if (init.auth) {
    const token = await readToken();
    if (!token) throw new ApiError('unauthorized', 'Sign in to the store admin to continue.');
    headers.authorization = `Bearer ${token}`;
  }
  if (init.device) headers.authorization = `Device ${init.device}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${serverUrl}${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : raw ? (init.body as Blob) : JSON.stringify(init.body),
      signal: controller.signal,
      // The app decides how often to refresh (the catalog sync); never reuse a stale response.
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('network', "We couldn't reach Nyoni. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const code = SERVER_CODES.includes(body?.error?.code) ? (body.error.code as ApiErrorCode) : 'server';
    throw new ApiError(code, body?.error?.message ?? 'Something went wrong. Please try again.');
  }
  return body as T;
}

/* Catalog */

export async function fetchCatalog(): Promise<Product[]> {
  const products = await http<Product[]>('/v1/catalog');
  return products.map(withBundledImages);
}

/* Store admin: staff sessions and inventory live on the server. */

type AdminApi = Pick<
  NyoniApi,
  'getAdminSession' | 'adminSignIn' | 'adminSignOut' | 'adminListProducts' | 'updateInventory' | 'resetInventory'
>;

export function createServerAdminApi(onCatalogChanged: () => void): AdminApi {
  return {
    async getAdminSession() {
      if (!(await readToken())) return null;
      try {
        return await http<AdminSession>('/v1/admin/session', { auth: true });
      } catch (error) {
        if (error instanceof ApiError && error.code === 'unauthorized') {
          await writeToken(null);
          return null;
        }
        throw error;
      }
    },
    async adminSignIn(email, password) {
      const result = await http<{ token: string; session: AdminSession }>('/v1/admin/sessions', {
        method: 'POST',
        body: { email, password },
      });
      await writeToken(result.token);
      return result.session;
    },
    async adminSignOut() {
      try {
        await http<void>('/v1/admin/session', { method: 'DELETE', auth: true });
      } catch (error) {
        // Already signed out on the server; still clear this device.
        if (!(error instanceof ApiError && error.code === 'unauthorized')) throw error;
      } finally {
        await writeToken(null);
      }
    },
    async adminListProducts() {
      const products = await http<Product[]>('/v1/admin/products', { auth: true });
      return products.map(withBundledImages);
    },
    async updateInventory(productId, update) {
      const product = await http<Product>(`/v1/admin/products/${encodeURIComponent(productId)}/inventory`, {
        method: 'PUT',
        body: update,
        auth: true,
      });
      onCatalogChanged();
      return withBundledImages(product);
    },
    async resetInventory(productId) {
      const product = await http<Product>(`/v1/admin/products/${encodeURIComponent(productId)}/inventory`, {
        method: 'DELETE',
        auth: true,
      });
      onCatalogChanged();
      return withBundledImages(product);
    },
  };
}
