import { Image, type ImageContentFit } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import type { GlyphNode } from '@/components/icons/glyph-types';
import { customGlyphs } from '@/components/icons/custom-glyphs';
import type { GarmentKind, MediaImage } from '@/api/types';
import { isDark, luminance, mix } from '@/lib/color';
import { colors, radius } from '@/theme';

export type IllustrationKind = GarmentKind | 'person';

const GLYPHS: Record<IllustrationKind, GlyphNode[]> = {
  jacket: customGlyphs.garmentJacket,
  suit: customGlyphs.garmentJacket,
  waistcoat: customGlyphs.garmentWaistcoat,
  shirt: customGlyphs.garmentShirt,
  knitwear: customGlyphs.garmentKnit,
  trousers: customGlyphs.garmentTrousers,
  shoes: customGlyphs.garmentShoes,
  accessory: customGlyphs.garmentAccessory,
  person: customGlyphs.person,
};

type Props = {
  image?: MediaImage;
  kind: IllustrationKind;
  /** Garment color, used to tint the illustration when there is no photo. */
  colorHex?: string;
  aspectRatio?: number;
  /** Portion of the frame the illustration occupies. */
  illustrationScale?: number;
  rounded?: number;
  /** Transparent frame, for placing items on a shared collage surface. */
  bare?: boolean;
  contentFit?: ImageContentFit;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

/**
 * Garment media. Shows the real photo when one exists (store product media, closet photos
 * or user uploads). Otherwise draws a tinted garment illustration, so layouts stay readable
 * until authentic product imagery is connected.
 */
export function GarmentImage({
  image,
  kind,
  colorHex = '#8A8175',
  aspectRatio,
  illustrationScale = 0.62,
  rounded = radius.card,
  bare = false,
  contentFit = 'cover',
  accessibilityLabel,
  style,
  children,
}: Props) {
  const source = image?.uri ? { uri: image.uri } : image?.asset;
  const label = accessibilityLabel ?? image?.alt;

  return (
    <View
      style={[
        styles.frame,
        { aspectRatio, borderRadius: rounded },
        !bare && styles.well,
        style,
      ]}
      accessible={!!label}
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}>
      {source ? (
        <Image
          source={source}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit}
          transition={180}
          accessible={false}
        />
      ) : (
        <View style={styles.center} pointerEvents="none">
          <GarmentIllustration kind={kind} colorHex={colorHex} scale={illustrationScale} />
        </View>
      )}
      {children}
    </View>
  );
}

/** Tinted silhouette with detail strokes, drawn from the garment glyphs. */
export function GarmentIllustration({
  kind,
  colorHex,
  scale = 0.62,
}: {
  kind: IllustrationKind;
  colorHex: string;
  scale?: number;
}) {
  const nodes = GLYPHS[kind];
  const fill = colorHex;
  // Closed shapes that take the garment color (the rest are detail strokes).
  const filled = kind === 'person' ? [0, 1] : [0];
  // Light garments get a warm outline so they read on the ivory well; dark ones get a
  // lighter detail line so lapels, buttons and seams stay visible.
  const stroke = isDark(fill)
    ? mix(fill, '#FFFFFF', 0.32)
    : luminance(fill) > 0.55
      ? '#9C9282'
      : mix(fill, '#0B0B0C', 0.45);

  return (
    // The SVG keeps its 1:1 viewBox and "meets" inside this box, so it fits any frame shape.
    <View style={{ width: `${scale * 100}%`, height: `${scale * 100}%` }}>
      <Svg width="100%" height="100%" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet">
        {nodes.map(([tag, attrs], index) => {
          const isSilhouette = filled.includes(index);
          const common = {
            stroke,
            strokeWidth: 1.4,
            // Screen-space stroke, so large illustrations keep fine lines.
            vectorEffect: 'non-scaling-stroke' as const,
            strokeLinecap: 'round' as const,
            strokeLinejoin: 'round' as const,
          };
          if (tag === 'circle') {
            const isDetailDot = attrs.fill === 'currentColor';
            return (
              <Circle
                key={index}
                cx={attrs.cx}
                cy={attrs.cy}
                r={attrs.r}
                {...common}
                fill={isDetailDot ? stroke : isSilhouette ? fill : 'none'}
              />
            );
          }
          return (
            <Path
              key={index}
              d={String(attrs.d)}
              {...common}
              fill={isSilhouette ? fill : 'none'}
            />
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    width: '100%',
  },
  well: {
    backgroundColor: colors.media,
  },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
