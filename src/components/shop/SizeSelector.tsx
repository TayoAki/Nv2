import { Pressable, StyleSheet, View } from 'react-native';

import type { Variant } from '@/api';
import { AppText } from '@/components/ui/AppText';
import { colors, radius, space } from '@/theme';

type Props = {
  variants: Variant[];
  selectedId: string | null;
  onSelect: (variant: Variant) => void;
  /** Visually flag the grid when the shopper tries to continue without a size. */
  highlight?: boolean;
  /** Kept for existing callers; both layouts now use the same tile grid. */
  layout?: 'row' | 'grid';
};

/** The second line of a tile: the EU size or unit from the store label ("42 US / 52 EU" → "52 EU"). */
function secondaryLabel(variant: Variant): string | null {
  const { code, label } = variant.size;
  const eu = label.match(/\/\s*([\d.]+\s*EU)/i)?.[1];
  if (eu) return eu.replace(/\s+/, ' ');
  if (/cm$/i.test(label)) return 'cm';
  if (/waist/i.test(label)) return 'waist';
  if (label === code || label === `Size ${code}` || /^US /.test(label)) return null;
  return label.replace(code, '').replace(/^[\s/·-]+/, '') || null;
}

/** Explicit size choice. The app never selects the first size silently (plan section 08). */
export function SizeSelector({ variants, selectedId, onSelect, highlight = false }: Props) {
  const selected = variants.find((v) => v.id === selectedId);
  return (
    <View style={styles.wrap}>
      <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel="Size">
        {variants.map((variant) => {
          const soldOut = variant.stock === 'out_of_stock';
          const low = variant.stock === 'low_stock';
          const isSelected = variant.id === selectedId;
          const detail = soldOut ? 'Sold out' : low ? `${variant.stockCount} left` : secondaryLabel(variant);
          const text = isSelected ? colors.ivory : soldOut ? colors.disabledText : colors.ink;
          return (
            <Pressable
              key={variant.id}
              onPress={() => onSelect(variant)}
              disabled={soldOut}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected, disabled: soldOut }}
              accessibilityLabel={`${variant.size.label}${soldOut ? ', sold out' : low ? `, only ${variant.stockCount} left` : ''}`}
              style={({ pressed }) => [
                styles.tile,
                isSelected && styles.tileSelected,
                soldOut && styles.tileSoldOut,
                highlight && !selectedId && styles.highlight,
                pressed && styles.pressed,
              ]}>
              <AppText
                variant="bodyStrong"
                color={text}
                style={[styles.code, soldOut && styles.struck]}
                numberOfLines={1}
                adjustsFontSizeToFit>
                {variant.size.code}
              </AppText>
              {detail ? (
                <AppText
                  variant="caption"
                  numberOfLines={1}
                  color={isSelected ? colors.champagne : low ? colors.bronze : colors.muted}>
                  {detail}
                </AppText>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      {selected ? (
        <AppText variant="secondary" color={selected.stock === 'low_stock' ? colors.bronze : colors.muted}>
          Selected: {selected.size.label}
          {selected.stock === 'low_stock' ? ` · Only ${selected.stockCount} left` : ''}
        </AppText>
      ) : highlight ? (
        <AppText variant="secondary" color={colors.error} accessibilityLiveRegion="polite">
          Choose a size to continue.
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  // Four tiles per row on phones; long size runs wrap instead of squeezing.
  tile: {
    flexBasis: '22%',
    flexGrow: 0,
    minWidth: 68,
    minHeight: 60,
    paddingHorizontal: space.xs,
    paddingVertical: space.xs,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tileSelected: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  tileSoldOut: {
    backgroundColor: colors.surfaceSunken,
    borderColor: colors.hairline,
  },
  highlight: {
    borderColor: colors.error,
  },
  pressed: {
    opacity: 0.75,
  },
  code: {
    fontSize: 18,
    lineHeight: 22,
  },
  struck: {
    textDecorationLine: 'line-through',
  },
});
