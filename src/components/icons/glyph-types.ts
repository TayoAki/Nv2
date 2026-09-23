export type GlyphTag = 'path' | 'circle' | 'rect' | 'line' | 'polyline' | 'polygon' | 'ellipse';

/** One SVG element in a 24x24 viewBox: [tag, attributes]. */
export type GlyphNode = [GlyphTag, Record<string, string | number>];
