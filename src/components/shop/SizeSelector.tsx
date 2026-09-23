import { StyleSheet, View } from 'react-native';

import type { Variant } from '@/api';
import { AppText } from '@/components/ui/AppText';
import { Chip } from '@/components/ui/Chip';
import { colors, space } from '@/theme';

type Props = {
  variants: Variant[];
  selectedId: string | null;
  onSelect: (variant: Variant) => void;
  /** Visually flag the row when the shopper tries to continue without a size. */
  highlight?: boolean;
  layout?: 'row' | 'grid';
};

/** Explicit size choice. The app never selects the first size silently (plan section 08). */
export function SizeSelector({ variants, selectedId, onSelect, highlight = false, layout = 'row' }: Props) {
  const selected = variants.find((v) => v.id === selectedId);
  return (
    <View style={styles.wrap}>
      <View style={[styles.chips, layout === 'grid' && styles.grid]} accessibilityRole="radiogroup" accessibilityLabel="Size">
        {variants.map((variant) => {
          const soldOut = variant.stock === 'out_of_stock';
          return (
            <Chip
              key={variant.id}
              label={variant.size.code}
              size="lg"
              selected={variant.id === selectedId}
              unavailable={soldOut}
              disabled={soldOut}
              accessibilityLabel={`${variant.size.label}${soldOut ? ', sold out' : variant.stock === 'low_stock' ? ', low stock' : ''}`}
              onPress={() => onSelect(variant)}
              style={[styles.chip, highlight && !selectedId && styles.highlight]}
            />
          );
        })}
      </View>
      {selected ? (
        <AppText variant="secondary" color={selected.stock === 'low_stock' ? colors.bronze : colors.muted}>
          {selected.size.label}
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
    gap: space.xs,
    flex: 1,
  },
  chips: {
    flexDirection: 'row',
    gap: space.xs,
  },
  grid: {
    flexWrap: 'wrap',
  },
  chip: {
    flexGrow: 1,
    flexBasis: 56,
  },
  highlight: {
    borderColor: colors.error,
  },
});
