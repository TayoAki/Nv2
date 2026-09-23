import { ApiError } from './errors';
import { http, readStored, serverUrl, writeStored, type HttpInit } from './server';

/**
 * The Nyoni server's AI features: try-on renders, closet photo import and the stylist. The
 * server calls OpenRouter when its key is set and simulates renders and imports when it isn't
 * (results say `simulated`). Shoppers are anonymous devices with a credit balance for now.
 */

const DEVICE_KEY = 'nyoni.device-token';

export type AiStatus = {
  provider: 'openrouter' | 'simulated';
  features: { renders: boolean; imports: boolean; stylist: boolean };
};

export type ServerGarment =
  | { source: 'capsule'; key: string }
  | { source: 'blob'; blobId: string; name: string; kind: string; description?: string }
  | { source: 'text'; name: string; kind: string; description?: string };

export type RenderBatch = {
  id: string;
  status: 'running' | 'done' | 'partial' | 'failed';
  quality: 'standard' | 'hq';
  creditsCharged: number;
  creditsRefunded: number;
  credits: number;
  simulated: boolean;
  images: {
    position: number;
    status: 'queued' | 'running' | 'done' | 'failed';
    attempts: number;
    url: string | null;
    errorCode: string | null;
    message: string | null;
  }[];
};

export type ServerImportDraft = {
  id: string;
  photoIndex: number;
  name: string;
  category: 'jackets' | 'waistcoats' | 'shirts' | 'knitwear' | 'trousers' | 'shoes' | 'accessories';
  colour: string;
  hexes: string[];
  pattern: string;
  material: string;
  formality: string;
  confidence: 'high' | 'low';
  cutoutBlobId: string | null;
  cutoutUrl: string | null;
  duplicateOfItemId: string | null;
  duplicateOfDraftId: string | null;
};

export type ServerImport = {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  drafts: ServerImportDraft[];
  failedPhotoCount: number;
  simulated: boolean;
  message: string | null;
};

export type StylistReply =
  | {
      status: 'ok';
      reply: string;
      outfit: { title: string; occasion: string; explanation: string; itemIds: string[]; complementProductId: string | null; focusItemId: string | null };
    }
  | { status: 'sparse_closet' | 'no_match'; reply: string; suggestedProductId: string | null };

/** Full URL of a server image (`/v1/blobs/…`). */
export const blobUri = (path: string) => `${serverUrl}${path}`;

let statusCache: { value: AiStatus | null; at: number } | null = null;

/** Which AI features the server offers. Null without a server or when it can't be reached. */
export async function aiStatus(): Promise<AiStatus | null> {
  if (!serverUrl) return null;
  if (statusCache && Date.now() - statusCache.at < 60_000) return statusCache.value;
  try {
    const value = await http<AiStatus>('/v1/ai/status');
    statusCache = { value, at: Date.now() };
    return value;
  } catch {
    statusCache = { value: null, at: Date.now() - 50_000 }; // try again in 10 seconds
    return null;
  }
}

let registering: Promise<string> | null = null;

async function deviceToken(): Promise<string> {
  const stored = await readStored(DEVICE_KEY);
  if (stored) return stored;
  registering ??= http<{ token: string }>('/v1/devices', { method: 'POST' })
    .then(async ({ token }) => {
      await writeStored(DEVICE_KEY, token);
      return token;
    })
    .finally(() => {
      registering = null;
    });
  return registering;
}

/** A call as this device. Registers the device on first use, and again if the server forgot it. */
async function asDevice<T>(path: string, init: Omit<HttpInit, 'device'> = {}): Promise<T> {
  try {
    return await http<T>(path, { ...init, device: await deviceToken() });
  } catch (error) {
    if (!(error instanceof ApiError && error.code === 'unauthorized')) throw error;
    await writeStored(DEVICE_KEY, null);
    return http<T>(path, { ...init, device: await deviceToken() });
  }
}

export async function deviceCredits(): Promise<number> {
  return (await asDevice<{ credits: number }>('/v1/device')).credits;
}

/** Sends a local photo (file:, blob: or data: URI) to the server, which normalises it. */
export async function uploadImage(localUri: string, kind: 'person' | 'closet') {
  let blob: Blob;
  try {
    blob = await (await fetch(localUri)).blob();
  } catch {
    throw new ApiError('validation', "We couldn't read this photo. Choose it again.");
  }
  return asDevice<{ blobId: string; url: string; framing: 'full' | 'cropped' }>(`/v1/uploads?kind=${kind}`, {
    method: 'POST',
    body: blob,
    timeoutMs: 60_000,
  });
}

/** Removes a photo from the server as soon as the shopper deletes it. */
export const deleteServerBlob = (blobId: string) => asDevice<void>(`/v1/blobs/${encodeURIComponent(blobId)}`, { method: 'DELETE' });

export const startRender = (body: {
  personBlobId: string;
  garments: ServerGarment[];
  quality?: 'standard' | 'hq';
  count?: number;
  fit?: 'slim' | 'regular' | 'relaxed';
  presentation?: string;
}) => asDevice<RenderBatch>('/v1/renders', { method: 'POST', body });

export const getRender = (id: string) => asDevice<RenderBatch>(`/v1/renders/${encodeURIComponent(id)}`);

export const keepRender = (id: string) => asDevice<{ kept: number }>(`/v1/renders/${encodeURIComponent(id)}/keep`, { method: 'POST' });

export const startImport = (photoBlobIds: string[], existing: { id: string; text: string }[]) =>
  asDevice<ServerImport>('/v1/imports', { method: 'POST', body: { photoBlobIds, existing } });

export const getImport = (id: string) => asDevice<ServerImport>(`/v1/imports/${encodeURIComponent(id)}`);

export const askStylist = (body: unknown) => asDevice<StylistReply>('/v1/stylist', { method: 'POST', body, timeoutMs: 90_000 });
