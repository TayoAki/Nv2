import { createHash } from 'node:crypto';

import sharp from 'sharp';

import { colourName, sampleColours, trimTransparent, type Image } from '../images';
import type { AiProvider } from './provider';

/**
 * Used until OPENROUTER_API_KEY is set. Runs every step of the pipeline (uploads, credits,
 * queue, retries, colours, duplicates) but makes placeholder images with no AI, clearly
 * labelled, so no one mistakes them for real previews.
 */
export const simulatedProvider: AiProvider = {
  name: 'simulated',

  async render({ person, garments }) {
    const W = 1024;
    const H = 1536;
    const personLayer = await sharp(person.buffer).resize(W, 1180, { fit: 'contain', background: '#D9D6D0' }).png().toBuffer();
    const thumbs = await Promise.all(
      garments.slice(0, 5).map((g) => sharp(g.buffer).resize(180, 180, { fit: 'contain', background: '#FFFFFF' }).png().toBuffer()),
    );
    const label = Buffer.from(
      `<svg width="${W}" height="120"><rect width="100%" height="100%" fill="#0B0B0C"/>
        <text x="50%" y="52" font-family="Georgia, serif" font-size="40" fill="#C4A46A" text-anchor="middle">Simulated preview</text>
        <text x="50%" y="94" font-family="sans-serif" font-size="26" fill="#F4F0E8" text-anchor="middle">AI rendering isn't connected yet</text>
      </svg>`,
    );
    const buffer = await sharp({ create: { width: W, height: H, channels: 3, background: '#D9D6D0' } })
      .composite([
        { input: personLayer, top: 0, left: 0 },
        ...thumbs.map((input, i) => ({ input, top: 1196, left: 22 + i * 200 })),
        { input: label, top: H - 120, left: 0 },
      ])
      .png()
      .toBuffer();
    return { image: { buffer, contentType: 'image/png', width: W, height: H }, costUsd: null };
  },

  async detect(photo) {
    const [hex] = await sampleColours(photo, 1);
    const colour = hex ? colourName(hex) : 'Grey';
    return [
      {
        name: `${colour} piece`,
        category: 'jackets',
        colour,
        pattern: 'solid',
        material: 'unknown',
        formality: 'smart-casual',
        // Low confidence so the review screen asks the member to check every detail.
        confidence: 0.4,
        box: { x: 0, y: 0, width: 1, height: 1 },
      },
    ];
  },

  async cutout(crop) {
    // Knock out a plain white backdrop so the piece sits on transparency, like a real cut-out.
    const { data, info } = await sharp(crop.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 236 && data[i + 1] > 236 && data[i + 2] > 236) data[i + 3] = 0;
    }
    const buffer = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
    return trimTransparent({ buffer, contentType: 'image/png' });
  },

  /** Hashed bag of words: identical descriptions match, different ones don't. */
  async embed(texts) {
    return texts.map((text) => {
      const vector = new Array(128).fill(0);
      for (const word of text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
        vector[createHash('md5').update(word).digest()[0] % 128] += 1;
      }
      const norm = Math.hypot(...vector) || 1;
      return vector.map((v) => v / norm);
    });
  },
};

export type { Image };
