import { z } from 'zod';

import { extendBlobs } from './blobs';
import { pool } from './db';
import { HttpError } from './errors';

/**
 * Shoppers report AI output they find wrong or offensive. Staff see reports in the admin panel.
 * The reported image is kept 7 days (instead of 24 hours) so staff can review it.
 */
const REVIEW_TTL = 7 * 24 * 60 * 60 * 1000;

export const reportSchema = z.object({
  kind: z.enum(['preview']),
  reason: z.enum(['offensive', 'identity', 'body', 'garment', 'incomplete', 'quality', 'other']),
  renderBatchId: z.string().max(80).optional(),
  subject: z.string().max(120).optional(),
});

export async function createReport(deviceId: string, body: unknown) {
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) throw new HttpError('validation', 'Choose what looks wrong.');
  const { kind, reason, renderBatchId, subject } = parsed.data;
  let blobId: string | null = null;
  if (renderBatchId) {
    const { rows } = await pool.query(
      `select r.result_blob_id from renders r join render_batches b on b.id = r.batch_id
        where b.id = $1 and b.device_id = $2 and r.result_blob_id is not null order by r.position limit 1`,
      [renderBatchId, deviceId],
    );
    blobId = rows[0]?.result_blob_id ?? null;
    if (blobId) await extendBlobs([blobId], REVIEW_TTL);
  }
  const { rows } = await pool.query(
    'insert into reports (device_id, kind, reason, render_batch_id, blob_id, subject) values ($1, $2, $3, $4, $5, $6) returning id',
    [deviceId, kind, reason, renderBatchId ?? null, blobId, subject ?? null],
  );
  return { id: String(rows[0].id) };
}

export async function listReports() {
  const { rows } = await pool.query(
    `select id, kind, reason, subject, status, created_at, reviewed_at, blob_id from reports
      order by (status = 'open') desc, created_at desc limit 200`,
  );
  return rows.map((row) => ({
    id: String(row.id),
    kind: row.kind as string,
    reason: row.reason as string,
    subject: row.subject as string | null,
    status: row.status as 'open' | 'reviewed',
    createdAt: (row.created_at as Date).toISOString(),
    reviewedAt: row.reviewed_at ? (row.reviewed_at as Date).toISOString() : null,
    imageUrl: row.blob_id ? `/v1/blobs/${row.blob_id}` : null,
  }));
}

export async function markReviewed(id: string) {
  const { rowCount } = await pool.query("update reports set status = 'reviewed', reviewed_at = now() where id = $1", [id]);
  if (!rowCount) throw new HttpError('not_found', 'This report no longer exists.');
  return { ok: true };
}
