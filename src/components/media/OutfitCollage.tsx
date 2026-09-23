import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { GarmentKind, MediaImage } from '@/api/types';
import { AppText } from '@/components/ui/AppText';
import { colors, radius, space } from '@/theme';

import { GarmentImage } from './GarmentImage';

export type CollagePiece = {
  key: string;
  kind: GarmentKind;
  colorHex?: string;
  image?: MediaImage;
  name: string;
};

type Props = {
  pieces: CollagePiece[];
  aspectRatio?: number;
  /** `flatlay` arranges pieces like a styled flat lay; `row` lines them up (wide banners). */
  layout?: 'flatlay' | 'row';
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

/**
 * Arranges the real stored item photos into a collage (plan section 13): outer layer large on
 * the left with shoes beneath, shirt and trousers on the right. Each piece keeps its own
 * photo; nothing is synthesized.
 */
export function OutfitCollage({ pieces, aspectRatio = 1.1, layout = 'flatlay', style, children }: Props) {
  const renderPiece = (piece: CollagePiece, flex: number, scale = 0.86) => (
    <GarmentImage
      key={piece.key}
      bare
      kind={piece.kind}
      colorHex={piece.colorHex}
      image={piece.image}
      contentFit="contain"
      illustrationScale={scale}
      accessibilityLabel={piece.name}
      style={{ flex }}
    />
  );

  const remaining = [...pieces];
  const take = (...kinds: GarmentKind[]) => {
    const index = remaining.findIndex((p) => kinds.includes(p.kind));
    return index === -1 ? undefined : remaining.splice(index, 1)[0];
  };
  const outer = take('suit', 'jacket') ?? take('knitwear');
  const top = take('shirt') ?? take('knitwear');
  const bottom = take('trousers');
  const shoes = take('shoes');
  const extras = remaining;

  let body: React.ReactNode = null;
  if (layout === 'row' || !outer || (!top && !bottom)) {
    body = <View style={styles.row}>{pieces.slice(0, 5).map((p) => renderPiece(p, 1, 0.8))}</View>;
  } else {
    const leftBottom = shoes ?? extras.shift();
    body = (
      <View style={styles.row}>
        <View style={[styles.column, { flex: 1.25 }]}>
          {renderPiece(outer, 3, 0.95)}
          {leftBottom ? renderPiece(leftBottom, 1.25, 0.8) : null}
        </View>
        <View style={[styles.column, { flex: 1 }]}>
          {top ? renderPiece(top, 2, 0.9) : null}
          {bottom ? renderPiece(bottom, 2.4, 0.92) : null}
          {extras.length > 0 ? (
            <View style={[styles.row, { flex: 1 }]}>{extras.slice(0, 2).map((p) => renderPiece(p, 1, 0.72))}</View>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View
      style={[styles.panel, { aspectRatio }, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Outfit: ${pieces.map((p) => p.name).join(', ')}`}>
      {body}
      {pieces.length === 0 ? (
        <AppText variant="secondary" color={colors.muted}>
          No pieces
        </AppText>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: '100%',
    backgroundColor: colors.media,
    borderRadius: radius.card,
    padding: space.sm,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: space.xs,
  },
  column: {
    gap: space.xs,
  },
});
