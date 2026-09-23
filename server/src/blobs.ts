import { randomBytes } from 'node:crypto';

import { pool } from './db';
import type { Image } from './images';

export type BlobKind = 'person' | 'closet' | 'render' | 'cutout';

const HOUR = 60 * 60 * 1000;
/** Retention from the plan: person photos and unsaved renders 24 hours; saved renders 30 days. */
export const TTL: Record<BlobKind, number | null> = {
  person: 24 * HOUR,
  render: 24 * HOUR,
  closet: 24 * HOUR,
  cutout: null, // kept until the closet item is deleted
};
export const SAVED_RENDER_TTL = 30 * 24 * HOUR;

/** Blob ids are long and random: the URL itself is the permission to read the image. */
export async function putBlob(deviceId: string | null, kind: BlobKind, image: Image): Promise<string> {
  const id = randomBytes(24).toString('base64url');
  const ttl = TTL[kind];
  await pool.query(
    `insert into blobs (id, device_id, kind, content_type, bytes, width, height, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, deviceId, kind, image.contentType, image.buffer, image.width ?? null, image.height ?? null, ttl ? new Date(Date.now() + ttl) : null],
  );
  return id;
}

export type StoredBlob = Image & { id: string; deviceId: string | null; kind: BlobKind };

export async function getBlob(id: string): Promise<StoredBlob | null> {
  const { rows } = await pool.query(
    `select id, device_id, kind, content_type, bytes, width, height from blobs
      where id = $1 and (expires_at is null or expires_at > now())`,
    [id],
  );
  const row = rows[0];
  return row
    ? { id: row.id, deviceId: row.device_id, kind: row.kind, contentType: row.content_type, buffer: row.bytes, width: row.width ?? undefined, height: row.height ?? undefined }
    : null;
}

/** An image this device owns, of one of the given kinds, or null. */
export async function ownedBlob(deviceId: string, id: string, kinds: BlobKind[]): Promise<StoredBlob | null> {
  const blob = await getBlob(id);
  return blob && blob.deviceId === deviceId && kinds.includes(blob.kind) ? blob : null;
}

export async function deleteBlob(deviceId: string, id: string) {
  await pool.query('delete from blobs where id = $1 and device_id = $2', [id, deviceId]);
}

export async function extendBlobs(ids: string[], ttlMs: number) {
  if (ids.length === 0) return;
  await pool.query('update blobs set expires_at = $2 where id = any($1)', [ids, new Date(Date.now() + ttlMs)]);
}

export async function deleteExpiredBlobs() {
  const { rowCount } = await pool.query('delete from blobs where expires_at < now()');
  return rowCount ?? 0;
}
