import type { GlyphNode } from './glyph-types';

/**
 * Hand-drawn glyphs that Lucide does not provide, drawn on the same 24x24 grid
 * with round caps/joins so they sit comfortably next to the Lucide icons.
 *
 * Replace these with the handoff icon set (design/icons.svg) once it is supplied.
 */
export const customGlyphs = {
  /** Closet tab + "owned pieces" markers. */
  closet: [
    ['path', { d: 'M10 7a2 2 0 1 1 2 2v1.5' }],
    ['path', { d: 'M12 10.5 3.7 16.6a1 1 0 0 0 .6 1.8h15.4a1 1 0 0 0 .6-1.8Z' }],
  ],

  /* Garment outlines used by image placeholders until real product/closet photos exist. */
  garmentJacket: [
    [
      'path',
      {
        d: 'M9 3.5 5.5 4.7a1.6 1.6 0 0 0-1.1 1.4L4 19.5h2.4l.8-8.2v9.2h9.6v-9.2l.8 8.2H20l-.4-13.4a1.6 1.6 0 0 0-1.1-1.4L15 3.5',
      },
    ],
    ['path', { d: 'M9 3.5 8.2 6.7l1.4.8L12 12.8l2.4-5.3 1.4-.8L15 3.5' }],
    ['path', { d: 'M9 3.5 12 12.8 15 3.5' }],
    ['path', { d: 'M8.4 15.6h2M13.6 15.6h2M14 9.4h1.6' }],
    ['circle', { cx: 12, cy: 14.9, r: 0.45, fill: 'currentColor' }],
    ['circle', { cx: 12, cy: 17.4, r: 0.45, fill: 'currentColor' }],
  ],
  garmentShirt: [
    ['path', { d: 'M8.6 4 5.3 5.4a1.4 1.4 0 0 0-.8 1.3v13.8h15V6.7a1.4 1.4 0 0 0-.8-1.3L15.4 4' }],
    ['path', { d: 'M8.6 4 9 7.9 12 7l3 .9.4-3.9' }],
    ['path', { d: 'M8.6 4h6.8' }],
    ['path', { d: 'M12 7v13.5' }],
    ['circle', { cx: 12, cy: 10.4, r: 0.4, fill: 'currentColor' }],
    ['circle', { cx: 12, cy: 13.4, r: 0.4, fill: 'currentColor' }],
    ['circle', { cx: 12, cy: 16.4, r: 0.4, fill: 'currentColor' }],
  ],
  garmentTrousers: [
    ['path', { d: 'M7 3.5h10l1.5 17h-4.2L12 10.2l-2.3 10.3H5.5Z' }],
    ['path', { d: 'M7.2 6h9.6M12 6v4.2M9.2 3.5V6M14.8 3.5V6' }],
  ],
  garmentShoes: [
    [
      'path',
      {
        d: 'M3 12.6V17h18v-.6c0-1-.7-1.9-1.7-2.2l-4.8-1.5a4 4 0 0 1-1.9-1.3l-1-1.2a1 1 0 0 0-1.3-.2l-1.6 1a4 4 0 0 1-2.1.6H4a1 1 0 0 0-1 1Z',
      },
    ],
    ['path', { d: 'M3 15.2h18' }],
    ['path', { d: 'M8.8 11.3c1.4.8 3 1 4.4.4' }],
  ],
  garmentKnit: [
    [
      'path',
      {
        d: 'M9.5 3.5c.4 1.2 1.3 1.8 2.5 1.8s2.1-.6 2.5-1.8l3.9 1.6a1.6 1.6 0 0 1 1 1.3l1.1 12.1h-3l-.6-7.1v10.1H7.1V11.4l-.6 7.1h-3L4.6 6.4a1.6 1.6 0 0 1 1-1.3Z',
      },
    ],
    ['path', { d: 'M7.1 18.6h9.8M3.6 16.9h2.9M17.5 16.9h2.9' }],
  ],
  garmentAccessory: [
    ['path', { d: 'M12 3.5 20 11l-8 9.5L4 11Z' }],
    ['path', { d: 'M4 11c2.7 1.4 5.3 1.4 8 0s5.3-1.4 8 0' }],
  ],
  /** Full-body figure for photo guidance and person-photo placeholders. */
  person: [
    ['circle', { cx: 12, cy: 4.4, r: 2 }],
    [
      'path',
      {
        d: 'M9.6 21 10 14.2H8.7a1 1 0 0 1-1-1.1l.6-4.4a2 2 0 0 1 2-1.7h3.4a2 2 0 0 1 2 1.7l.6 4.4a1 1 0 0 1-1 1.1H14l.4 6.8',
      },
    ],
    ['path', { d: 'M12 14.2V21' }],
  ],
} satisfies Record<string, GlyphNode[]>;
