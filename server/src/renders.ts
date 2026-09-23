import { randomBytes } from 'node:crypto';

import { z } from 'zod';

import { aiProvider, ProviderError } from './ai';
import { extendBlobs, getBlob, ownedBlob, putBlob, SAVED_RENDER_TTL } from './blobs';
import { capsuleRow, productForPiece } from './catalog';
import { pool } from './db';
import { env } from './env';
import { HttpError } from './errors';
import { capsulePhoto, framingOf, type Image } from './images';
import { renderPrompt, type RenderGarment } from './prompts';

const MAX_ATTEMPTS = 3;
const CREDITS = { standard: 1, hq: 3 } as const;

const text = (max: number) => z.string().trim().min(1).max(max);
const garmentSchema = z.discriminatedUnion('source', [
  // A Nyoni piece, by capsule key. The server looks up its name and photo; suits render whole.
  z.object({ source: z.literal('capsule'), key: text(80) }),
  // A closet cut-out made by the photo import pipeline.
  z.object({ source: z.literal('blob'), blobId: text(80), name: text(80), kind: text(20), description: z.string().max(200).optional() }),
  // A closet piece with no photo: described in words.
  z.object({ source: z.literal('text'), name: text(80), kind: text(20), description: z.string().max(200).optional() }),
]);

export const renderRequestSchema = z.object({
  personBlobId: text(80),
  garments: z.array(garmentSchema).min(1).max(15),
  quality: z.enum(['standard', 'hq']).default('standard'),
  count: z.number().int().min(1).max(4).default(1),
  fit: z.enum(['slim', 'regular', 'relaxed']).optional(),
  presentation: z.string().max(60).optional(),
});

type GarmentInput = z.infer<typeof garmentSchema>;
type ResolvedGarment = RenderGarment & { image: { capsuleKey: string } | { blobId: string } | null };

const id = (prefix: string) => `${prefix}_${randomBytes(12).toString('base64url')}`;

async function resolveGarment(deviceId: string, input: GarmentInput): Promise<ResolvedGarment> {
  if (input.source === 'capsule') {
    const row = capsuleRow(input.key);
    const product = row ? productForPiece(input.key) : null;
    if (!row || !product) throw new HttpError('validation', 'One of these pieces is no longer in the catalog.');
    if (product.kind === 'suit') {
      const parts = product.pieces.map((p) => p.kind === 'waistcoat' ? 'waistcoat' : p.kind === 'trousers' ? 'trousers' : 'jacket');
      return {
        name: product.title,
        kind: 'suit',
        wornAs: parts.includes('waistcoat') ? 'a matched jacket, waistcoat and trousers' : 'a matched jacket and trousers',
        description: `${row.colour} ${row.pattern} ${row.material}`,
        hasImage: true,
        image: { capsuleKey: product.pieces[0].key },
      };
    }
    return { name: row.name, kind: product.kind, description: `${row.colour} ${row.pattern} ${row.material}`, hasImage: true, image: { capsuleKey: input.key } };
  }
  if (input.source === 'blob') {
    const blob = await ownedBlob(deviceId, input.blobId, ['cutout', 'closet']);
    if (!blob) throw new HttpError('validation', `The photo of your ${input.name} has expired. Add it again from your closet.`);
    return { name: input.name, kind: input.kind, description: input.description, hasImage: true, image: { blobId: input.blobId } };
  }
  return { name: input.name, kind: input.kind, description: input.description, hasImage: false, image: null };
}

export async function createRenderBatch(deviceId: string, body: unknown) {
  const parsed = renderRequestSchema.safeParse(body);
  if (!parsed.success) throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'Check the outfit and try again.');
  const input = parsed.data;

  const person = await ownedBlob(deviceId, input.personBlobId, ['person']);
  if (!person) throw new HttpError('validation', 'Your photo has expired. Choose it again to create a preview.');
  const garments = await Promise.all(input.garments.map((g) => resolveGarment(deviceId, g)));

  const recent = await pool.query<{ count: string }>(
    "select count(*) from render_batches where device_id = $1 and created_at > now() - interval '1 hour'",
    [deviceId],
  );
  if (Number(recent.rows[0].count) >= env.rendersPerHour) {
    throw new HttpError('quota', "You've reached the preview limit for now. Previews are limited to keep them fair for everyone. Try again later.");
  }

  const today = await pool.query<{ count: string }>("select count(*) from renders where created_at > now() - interval '24 hours'");
  if (Number(today.rows[0].count) + input.count > env.dailyImageLimit) {
    throw new HttpError('quota', "Previews are very popular today and we've reached today's limit. Please try again tomorrow.");
  }

  const cost = input.count * CREDITS[input.quality];
  const prompt = renderPrompt(garments, {
    framing: framingOf(person.width, person.height),
    fit: input.fit,
    presentation: input.presentation ?? 'menswear tailoring',
  });
  const batchId = id('rb');
  const client = await pool.connect();
  try {
    await client.query('begin');
    const reserved = await client.query('update devices set credits = credits - $2 where id = $1 and credits >= $2 returning credits', [deviceId, cost]);
    if (reserved.rowCount === 0) {
      throw new HttpError('quota', `You need ${cost} preview credit${cost === 1 ? '' : 's'} for this. You don't have enough left.`);
    }
    await client.query(
      'insert into render_batches (id, device_id, quality, credits_reserved, input) values ($1, $2, $3, $4, $5)',
      [batchId, deviceId, input.quality, cost, JSON.stringify({ personBlobId: input.personBlobId, garments })],
    );
    for (let position = 0; position < input.count; position += 1) {
      await client.query('insert into renders (id, batch_id, position, prompt) values ($1, $2, $3, $4)', [id('r'), batchId, position, prompt]);
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  return renderBatchView(deviceId, batchId);
}

const USER_MESSAGES: Record<string, string> = {
  moderation: "This photo or outfit can't be previewed. Try a different photo.",
  bad_request: "We couldn't create this preview. Try a different photo.",
  photo_expired: 'Your photo has expired. Choose it again to create a preview.',
  timeout: "This is taking too long. We couldn't finish your preview in time.",
  no_credit: 'Previews are paused right now. Please try again later.',
  default: "We couldn't create a reliable preview. Try a clearer photo.",
};

export async function renderBatchView(deviceId: string, batchId: string) {
  const batch = await pool.query(
    'select b.*, d.credits from render_batches b join devices d on d.id = b.device_id where b.id = $1 and b.device_id = $2',
    [batchId, deviceId],
  );
  const row = batch.rows[0];
  if (!row) throw new HttpError('not_found', 'This preview is no longer available.');
  const renders = await pool.query('select * from renders where batch_id = $1 order by position', [batchId]);
  return {
    id: row.id as string,
    status: row.status as 'running' | 'done' | 'partial' | 'failed',
    quality: row.quality as 'standard' | 'hq',
    creditsCharged: row.credits_reserved - row.credits_refunded,
    creditsRefunded: row.credits_refunded as number,
    credits: row.credits as number,
    simulated: renders.rows.some((r) => r.simulated),
    images: renders.rows.map((r) => ({
      position: r.position as number,
      status: r.status as 'queued' | 'running' | 'done' | 'failed',
      attempts: r.attempts as number,
      url: r.result_blob_id ? `/v1/blobs/${r.result_blob_id}` : null,
      errorCode: (r.error_code as string | null) ?? null,
      message: r.status === 'failed' ? USER_MESSAGES[r.error_code] ?? USER_MESSAGES.default : null,
    })),
  };
}

/** Saving a look keeps its images for 30 days instead of 24 hours. */
export async function keepRenderBatch(deviceId: string, batchId: string) {
  const { rows } = await pool.query(
    'select r.result_blob_id from renders r join render_batches b on b.id = r.batch_id where b.id = $1 and b.device_id = $2 and r.result_blob_id is not null',
    [batchId, deviceId],
  );
  await extendBlobs(rows.map((r) => r.result_blob_id), SAVED_RENDER_TTL);
  return { kept: rows.length };
}

/* ------------------------------------------------------------------------------ the queue */

async function loadImage(ref: ResolvedGarment['image']): Promise<Image | null> {
  if (!ref) return null;
  if ('capsuleKey' in ref) return capsulePhoto(ref.capsuleKey);
  return getBlob(ref.blobId);
}

async function runRender(row: { id: string; batch_id: string; prompt: string; attempts: number; device_id: string; quality: string; input: { personBlobId: string; garments: ResolvedGarment[] } }) {
  const provider = aiProvider();
  try {
    const person = await getBlob(row.input.personBlobId);
    if (!person) throw new ProviderError('The member photo expired.', true, 'bad_request');
    const images = (await Promise.all(row.input.garments.map((g) => loadImage(g.image)))).filter((i): i is Image => !!i);
    const result = await provider.render({
      prompt: row.prompt,
      person,
      garments: images,
      quality: row.quality === 'hq' ? 'high' : 'medium',
    });
    const blobId = await putBlob(row.device_id, 'render', result.image);
    await pool.query(
      "update renders set status = 'done', result_blob_id = $2, cost_usd = $3, simulated = $4, error_code = null, error_message = null, updated_at = now() where id = $1",
      [row.id, blobId, result.costUsd, provider.name === 'simulated'],
    );
  } catch (error) {
    const providerError = error instanceof ProviderError ? error : null;
    const code = providerError?.message === 'The member photo expired.' ? 'photo_expired' : providerError?.code ?? 'upstream';
    const retry = providerError ? !providerError.permanent && row.attempts < MAX_ATTEMPTS : row.attempts < MAX_ATTEMPTS;
    if (!providerError) console.error('render failed', error);
    await pool.query(
      `update renders set status = $2, error_code = $3, error_message = $4, next_attempt_at = now() + ($5 || ' seconds')::interval, updated_at = now() where id = $1`,
      [row.id, retry ? 'queued' : 'failed', code, (error as Error).message.slice(0, 300), String(env.retryBaseSeconds * row.attempts ** 2)],
    );
  }
  await finishBatchIfDone(row.batch_id);
}

/** When every image has settled, refund the credits for the ones that didn't arrive. */
async function finishBatchIfDone(batchId: string) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const batch = await client.query("select * from render_batches where id = $1 and status = 'running' for update", [batchId]);
    const row = batch.rows[0];
    if (!row) return void (await client.query('rollback'));
    const renders = await client.query<{ status: string }>('select status from renders where batch_id = $1', [batchId]);
    if (renders.rows.some((r) => r.status === 'queued' || r.status === 'running')) return void (await client.query('rollback'));
    const failed = renders.rows.filter((r) => r.status === 'failed').length;
    const refund = failed * CREDITS[row.quality as 'standard' | 'hq'];
    const status = failed === 0 ? 'done' : failed === renders.rows.length ? 'failed' : 'partial';
    if (refund) await client.query('update devices set credits = credits + $2 where id = $1', [row.device_id, refund]);
    await client.query('update render_batches set status = $2, credits_refunded = $3, finished_at = now() where id = $1', [batchId, status, refund]);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

let active = 0;

/** Claims queued renders (skipping ones another instance holds) and runs them, a few at a time. */
export async function processRenderQueue() {
  const free = env.renderConcurrency - active;
  if (free <= 0) return;
  const claimed = await pool.query(
    `update renders set status = 'running', attempts = attempts + 1, updated_at = now()
      where id in (
        select id from renders where status = 'queued' and next_attempt_at <= now()
        order by created_at limit $1 for update skip locked
      )
      returning id, batch_id, prompt, attempts`,
    [free],
  );
  for (const render of claimed.rows) {
    const batch = await pool.query('select device_id, quality, input from render_batches where id = $1', [render.batch_id]);
    active += 1;
    void runRender({ ...render, ...batch.rows[0] }).finally(() => {
      active -= 1;
    });
  }
}

/** After a crash or redeploy, renders left "running" go back in the queue. */
export async function requeueStaleRenders() {
  await pool.query("update renders set status = 'queued' where status = 'running' and updated_at < now() - interval '5 minutes'");
}

export function isRenderQueueIdle() {
  return active === 0;
}
