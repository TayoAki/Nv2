import Svg, { Circle, Ellipse, Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';

import { colors } from '@/theme';

import { customGlyphs } from './custom-glyphs';
import type { GlyphNode } from './glyph-types';
import { lucideGlyphs } from './lucide-glyphs';

const glyphs = { ...lucideGlyphs, ...customGlyphs } satisfies Record<string, GlyphNode[]>;

export type IconName = keyof typeof glyphs;

function renderNode([tag, attrs]: GlyphNode, key: number) {
  switch (tag) {
    case 'path':
      return <Path key={key} {...attrs} />;
    case 'circle':
      return <Circle key={key} {...attrs} />;
    case 'rect':
      return <Rect key={key} {...attrs} />;
    case 'line':
      return <Line key={key} {...attrs} />;
    case 'polyline':
      return <Polyline key={key} {...attrs} />;
    case 'polygon':
      return <Polygon key={key} {...attrs} />;
    case 'ellipse':
      return <Ellipse key={key} {...attrs} />;
  }
}

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  /** Visual stroke width in points, independent of `size`. */
  strokeWidth?: number;
  fill?: string;
  /** Icons are decorative by default; pass a label when the icon carries meaning on its own. */
  accessibilityLabel?: string;
};

export function Icon({
  name,
  size = 24,
  color = colors.ink,
  strokeWidth = 1.5,
  fill = 'none',
  accessibilityLabel,
}: Props) {
  const nodes: GlyphNode[] = glyphs[name];
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={color}
      color={color}
      strokeWidth={(strokeWidth * 24) / size}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
      pointerEvents="none">
      {nodes.map(renderNode)}
    </Svg>
  );
}
