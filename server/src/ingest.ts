import { randomBytes } from 'node:crypto';

import { z } from 'zod';

import { aiProvider, ProviderError, type DetectedItem } from './ai';
import { getBlob, ownedBlob, putBlob } from './blobs';
import { pool } from './db';
import { env } from './env';
import { HttpError } from './errors';
import { cropBox, sampleColours } from './images';

const MAX_ATTEMPTS = 3;
/**
 * A draft is flagged as "may already be in your closet" only when the kind of garment
 * matches, the measured colours are close, and the descriptions are similar. Text alone
 * can't tell pieces apart: with text-embedding-3-small, matching pairs scored 0.59–0.73 and
 * different pieces up to 0.63 in testing, so colour and kind do most of the work.
 */
const DUPLICATE_SIMILARITY = 0.58;
/** CIE76 ΔE: under about 20 reads as "the same colour" for photos of fabric. */
const DUPLICATE_COLOUR_DISTANCE = 20;

export const importRequestSchema = z.object({
  photoBlobIds: z.array(z.string().min(1).max(80)).min(1).max(8),
  /** The member's current closet, so near-identical pieces can be flagged. */
  existing: z
    .array(
      z.object({
        id: z.string().max(80),
        text: z.string().max(300),
        category: z.string().max(20).optional(),
        /** "suit" covers jackets, trousers and waistcoats. */
        kind: z.string().max(20).optional(),
        hex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      }),
    )
    .max(400)
    .default([]),
});

export type ImportDraft = {
  id: string;
  photoIndex: number;
  name: string;
  category: DetectedItem['category'];
  colour: string;
  hexes: string[];
  pattern: string;
  material: string;
  formality: DetectedItem['formality'];
  confidence: 'high' | 'low';
  cutoutBlobId: string | null;
  duplicateOfItemId: string | null;
  duplicateOfDraftId: string | null;
};

const id = (prefix: string) => `${prefix}_${randomBytes(12).toString('base64url')}`;

export async function createImport(deviceId: string, body: unknown) {
  const parsed = importRequestSchema.safeParse(body);
  if (!parsed.success) throw new HttpError('validation', parsed.error.issues[0]?.message ?? 'Choose at least one photo.');
  for (const blobId of parsed.data.photoBlobIds) {
    if (!(await ownedBlob(deviceId, blobId, ['closet']))) {
      throw new HttpError('validation', 'One of these photos has expired. Choose your photos again.');
    }
  }
  const recent = await pool.query<{ count: string }>(
    "select count(*) from imports where device_id = $1 and created_at > now() - interval '1 hour'",
    [deviceId],
  );
  if (Number(recent.rows[0].count) >= env.importsPerHour) {
    throw new HttpError('quota', "You've added a lot of photos. Try again in a little while.");
  }
  const importId = id('imp');
  await pool.query('insert into imports (id, device_id, input) values ($1, $2, $3)', [importId, deviceId, JSON.stringify(parsed.data)]);
  return importView(deviceId, importId);
}

export async function importView(deviceId: string, importId: string) {
  const { rows } = await pool.query('select * from imports where id = $1 and device_id = $2', [importId, deviceId]);
  const row = rows[0];
  if (!row) throw new HttpError('not_found', 'This import has expired. Add your photos again.');
  return {
    id: row.id as string,
    status: row.status as 'queued' | 'running' | 'done' | 'failed',
    drafts: (row.drafts as ImportDraft[]).map((draft) => ({ ...draft, cutoutUrl: draft.cutoutBlobId ? `/v1/blobs/${draft.cutoutBlobId}` : null })),
    failedPhotoCount: row.failed_photo_count as number,
    simulated: row.simulated as boolean,
    message: row.status === 'failed' ? "We couldn't read these photos. Try clearer photos with one piece in view." : null,
  };
}

const cosine = (a: number[], b: number[]) => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
};

function lab(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92;
  });
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
  const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
  const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export const colourDistance = (a: string, b: string) => {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
};

const SUIT_PARTS = new Set(['jackets', 'trousers', 'waistcoats']);

/** Same kind of garment (a suit in the closet covers its jacket, trousers and waistcoat). */
const sameKind = (draft: ImportDraft, other: { category?: string; kind?: string }) =>
  !other.category || other.category === draft.category || (other.kind === 'suit' && SUIT_PARTS.has(draft.category));

const closeColour = (draft: ImportDraft, hex: string | undefined) =>
  !hex || draft.hexes.length === 0 || colourDistance(draft.hexes[0], hex) < DUPLICATE_COLOUR_DISTANCE;

export const describeDraft = (d: Pick<ImportDraft, 'colour' | 'pattern' | 'material' | 'name' | 'category'>) =>
  `${d.colour} ${d.pattern} ${d.material} ${d.name} (${d.category})`.toLowerCase();

async function runImport(row: { id: string; device_id: string; attempts: number; input: z.infer<typeof importRequestSchema> }) {
  const provider = aiProvider();
  const drafts: ImportDraft[] = [];
  let failedPhotos = 0;
  try {
    for (const [photoIndex, blobId] of row.input.photoBlobIds.entries()) {
      const photo = await getBlob(blobId);
      if (!photo) {
        failedPhotos += 1;
        continue;
      }
      let items: DetectedItem[];
      try {
        items = await provider.detect(photo);
      } catch (error) {
        // A transient failure retries the whole import, and so does a rejected key or no
        // credit (not the photo's fault). Anything else permanent only skips this photo.
        if (error instanceof ProviderError && (!error.permanent || error.code === 'unavailable' || error.code === 'no_credit')) throw error;
        failedPhotos += 1;
        continue;
      }
      if (items.length === 0) {
        failedPhotos += 1;
        continue;
      }
      // Cut-outs take 15–30 seconds each, so a photo's pieces are cut out in parallel.
      const made = await Promise.all(
        items.map(async (item): Promise<ImportDraft> => {
          let cutoutBlobId: string | null = null;
          let hexes: string[] = [];
          try {
            const cutout = await provider.cutout(await cropBox(photo, item.box), item.name);
            hexes = await sampleColours(cutout, 3);
            cutoutBlobId = await putBlob(row.device_id, 'cutout', cutout);
          } catch (error) {
            if (error instanceof ProviderError && !error.permanent) throw error;
            // No cut-out: keep the item with the original photo so the member can still review it.
            hexes = await sampleColours(await cropBox(photo, item.box), 3).catch(() => []);
          }
          return {
            id: id('d'),
            photoIndex,
            name: item.name,
            category: item.category,
            colour: item.colour,
            hexes,
            pattern: item.pattern,
            material: item.material,
            formality: item.formality,
            confidence: item.confidence >= 0.7 ? 'high' : 'low',
            cutoutBlobId,
            duplicateOfItemId: null,
            duplicateOfDraftId: null,
          };
        }),
      );
      drafts.push(...made);
    }

    // Near-identical pieces: against the closet first, then within this batch.
    if (drafts.length) {
      const existing = row.input.existing;
      const vectors = await provider.embed([...drafts.map(describeDraft), ...existing.map((e) => e.text.toLowerCase())]);
      const draftVectors = vectors.slice(0, drafts.length);
      const existingVectors = vectors.slice(drafts.length);
      drafts.forEach((draft, i) => {
        const closet = existing.findIndex(
          (item, j) => sameKind(draft, item) && closeColour(draft, item.hex) && cosine(draftVectors[i], existingVectors[j]) >= DUPLICATE_SIMILARITY,
        );
        if (closet !== -1) draft.duplicateOfItemId = existing[closet].id;
        else {
          const earlier = drafts
            .slice(0, i)
            .findIndex(
              (other, j) =>
                other.category === draft.category && closeColour(draft, other.hexes[0]) && cosine(draftVectors[i], draftVectors[j]) >= DUPLICATE_SIMILARITY,
            );
          if (earlier !== -1) draft.duplicateOfDraftId = drafts[earlier].id;
        }
      });
    }

    await pool.query(
      `update imports set status = $2, drafts = $3, failed_photo_count = $4, simulated = $5, updated_at = now() where id = $1`,
      [row.id, drafts.length ? 'done' : 'failed', JSON.stringify(drafts), failedPhotos, provider.name === 'simulated'],
    );
  } catch (error) {
    const retry = row.attempts < MAX_ATTEMPTS;
    if (!(error instanceof ProviderError)) console.error('import failed', error);
    await pool.query(
      `update imports set status = $2, error_message = $3, next_attempt_at = now() + ($4 || ' seconds')::interval, updated_at = now() where id = $1`,
      [row.id, retry ? 'queued' : 'failed', (error as Error).message.slice(0, 300), String(env.retryBaseSeconds * row.attempts ** 2)],
    );
  }
}

let active = 0;

export async function processImportQueue() {
  if (active >= 1) return;
  const claimed = await pool.query(
    `update imports set status = 'running', attempts = attempts + 1, updated_at = now()
      where id in (
        select id from imports where status = 'queued' and next_attempt_at <= now()
        order by created_at limit 1 for update skip locked
      )
      returning id, device_id, attempts, input`,
  );
  for (const row of claimed.rows) {
    active += 1;
    void runImport(row).finally(() => {
      active -= 1;
    });
  }
}

export async function requeueStaleImports() {
  await pool.query("update imports set status = 'queued' where status = 'running' and updated_at < now() - interval '10 minutes'");
}

export function isImportQueueIdle() {
  return active === 0;
}
