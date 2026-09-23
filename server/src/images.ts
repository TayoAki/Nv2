import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import sharp, { type Metadata } from 'sharp';

import { env } from './env';
import { HttpError } from './errors';

export type Image = { buffer: Buffer; contentType: string; width?: number; height?: number };

const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);
export const MAX_EDGE = 2048;

/**
 * Every image the models see goes through here first: JPEG, PNG or WebP only, rotated upright,
 * longest edge at most 2048px. So the model gets predictable bytes, not whatever came off a phone.
 */
export async function normalizeImage(input: Buffer, { keepAlpha = false } = {}): Promise<Image> {
  let meta: Metadata;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw new HttpError('validation', "That file isn't a photo we can read. Use a JPEG, PNG or WebP photo.");
  }
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
    throw new HttpError('validation', 'Use a JPEG, PNG or WebP photo.');
  }
  const alpha = keepAlpha && meta.hasAlpha;
  const pipeline = sharp(input)
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true });
  const { data, info } = alpha
    ? await pipeline.png().toBuffer({ resolveWithObject: true })
    : await pipeline.flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });
  return { buffer: data, contentType: alpha ? 'image/png' : 'image/jpeg', width: info.width, height: info.height };
}

export const dataUrl = (image: Image) => `data:${image.contentType};base64,${image.buffer.toString('base64')}`;

/** A photo much less than twice as tall as it is wide is treated as cropped (headshot or half-length). */
export function framingOf(width?: number, height?: number): 'full' | 'cropped' {
  if (!width || !height) return 'cropped';
  return height / width >= 1.6 ? 'full' : 'cropped';
}

/** Crops a detected item out of a photo. `box` is normalised 0–1; a little margin keeps edges intact. */
export async function cropBox(image: Image, box: { x: number; y: number; width: number; height: number }): Promise<Image> {
  const meta = await sharp(image.buffer).metadata();
  const W = meta.width ?? 1;
  const H = meta.height ?? 1;
  const pad = 0.04;
  const left = Math.max(0, Math.floor((box.x - pad) * W));
  const top = Math.max(0, Math.floor((box.y - pad) * H));
  const width = Math.max(8, Math.min(W - left, Math.ceil((box.width + pad * 2) * W)));
  const height = Math.max(8, Math.min(H - top, Math.ceil((box.height + pad * 2) * H)));
  const { data, info } = await sharp(image.buffer)
    .extract({ left, top, width, height })
    .jpeg({ quality: 92 })
    .toBuffer({ resolveWithObject: true });
  return { buffer: data, contentType: 'image/jpeg', width: info.width, height: info.height };
}

/** Removes empty transparent margins so every cut-out sits tight in its frame. */
export async function trimTransparent(image: Image): Promise<Image> {
  try {
    const { data, info } = await sharp(image.buffer).trim({ threshold: 1 }).png().toBuffer({ resolveWithObject: true });
    return { buffer: data, contentType: 'image/png', width: info.width, height: info.height };
  } catch {
    return image;
  }
}

/**
 * The garment's main colours, most dominant first: k-means over the visible pixels, ignoring
 * transparency and a plain white backdrop.
 */
export async function sampleColours(image: Image, count = 3): Promise<string[]> {
  const { data, info } = await sharp(image.buffer)
    .ensureAlpha()
    .resize(72, 72, { fit: 'inside' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const all: [number, number, number][] = [];
  const garment: [number, number, number][] = [];
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] < 128) continue;
    const pixel: [number, number, number] = [data[i], data[i + 1], data[i + 2]];
    all.push(pixel);
    if (!(pixel[0] > 236 && pixel[1] > 236 && pixel[2] > 236)) garment.push(pixel);
  }
  // A white garment on white would leave nothing: fall back to every visible pixel.
  const pixels = garment.length > all.length * 0.05 ? garment : all;
  if (pixels.length === 0) return [];
  return kMeans(pixels, Math.min(count, pixels.length)).map(([r, g, b]) => toHex(r, g, b));
}

function kMeans(pixels: [number, number, number][], k: number): [number, number, number][] {
  const step = Math.max(1, Math.floor(pixels.length / k));
  let centres = Array.from({ length: k }, (_, i) => [...pixels[Math.min(pixels.length - 1, i * step)]] as [number, number, number]);
  let sizes = new Array(k).fill(0);
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const sums = centres.map(() => [0, 0, 0]);
    sizes = new Array(k).fill(0);
    for (const p of pixels) {
      let best = 0;
      let bestDistance = Infinity;
      centres.forEach((c, index) => {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < bestDistance) {
          bestDistance = d;
          best = index;
        }
      });
      sums[best][0] += p[0];
      sums[best][1] += p[1];
      sums[best][2] += p[2];
      sizes[best] += 1;
    }
    centres = centres.map((c, index) =>
      sizes[index] ? [sums[index][0] / sizes[index], sums[index][1] / sizes[index], sums[index][2] / sizes[index]] : c,
    ) as [number, number, number][];
  }
  return centres
    .map((centre, index) => ({ centre, size: sizes[index] }))
    .filter((cluster) => cluster.size > 0)
    .sort((a, b) => b.size - a.size)
    .map((cluster) => cluster.centre);
}

const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

const NAMED_COLOURS: [string, string][] = [
  ['Navy', '#1F2A44'], ['Black', '#141414'], ['Charcoal', '#3A3A3A'], ['Grey', '#7D7B76'],
  ['White', '#F4F2EE'], ['Ivory', '#EFE8DA'], ['Taupe', '#B3A492'], ['Camel', '#B08A5B'],
  ['Brown', '#5A3A24'], ['Burgundy', '#5A1A28'], ['Blue', '#3B6EA8'], ['Teal', '#1F6F73'],
  ['Green', '#3D4A3A'], ['Orange', '#C7791E'],
];

/** The closest simple colour name, for text the stylist and duplicate check can compare. */
export function colourName(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  let best = NAMED_COLOURS[0];
  let bestDistance = Infinity;
  for (const named of NAMED_COLOURS) {
    const [nr, ng, nb] = [1, 3, 5].map((i) => parseInt(named[1].slice(i, i + 2), 16));
    const d = (r - nr) ** 2 + (g - ng) ** 2 + (b - nb) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = named;
    }
  }
  return best[0];
}

const photoCache = new Map<string, Image>();

/** A capsule piece's house photo (or its cut-out, when one has been made), by capsule key. */
export async function capsulePhoto(key: string): Promise<Image | null> {
  if (!/^[a-z0-9-]+$/.test(key)) return null;
  const cached = photoCache.get(key);
  if (cached) return cached;
  for (const [ext, type] of [['png', 'image/png'], ['webp', 'image/webp']] as const) {
    try {
      const raw = await readFile(join(env.collectionDir, `${key}.${ext}`));
      const image = await normalizeImage(raw, { keepAlpha: type === 'image/png' });
      photoCache.set(key, image);
      return image;
    } catch {
      // Try the next format.
    }
  }
  return null;
}
