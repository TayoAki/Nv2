import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Product } from '@/api';
import { Icon } from '@/components/icons/Icon';
import { GarmentImage } from '@/components/media/GarmentImage';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { colors, radius, space } from '@/theme';

type Props = { product: Product; showEligibility?: boolean };

/** Shop tile: image, name, color swatch and an arrow. No prices or reviews on browse tiles. */
export function ProductCard({ product, showEligibility = false }: Props) {
  const open = () => router.push(`/product/${product.id}`);
  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`${product.title}, ${product.color.name}`}
      accessibilityHint="Opens product details"
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <GarmentImage
        image={product.images[0]}
        kind={product.kind}
        colorHex={product.color.hex}
        aspectRatio={0.96}
        illustrationScale={0.7}>
        {showEligibility && product.tryOn.eligible ? (
          <Badge label="Try-on eligible" tone="overlay" icon="account" style={styles.badge} />
        ) : null}
      </GarmentImage>
      <View style={styles.meta}>
        <View style={styles.text}>
          <AppText variant="body" numberOfLines={2}>
            {product.title}
          </AppText>
          <View style={styles.swatchRow}>
            <View style={[styles.swatch, { backgroundColor: product.color.hex }]} />
            <AppText variant="caption" color={colors.muted}>
              {product.color.name}
            </AppText>
          </View>
        </View>
        <View style={styles.arrow}>
          <Icon name="chevronRight" size={20} color={colors.ink} />
        </View>
      </View>
    </Pressable>
  );
}

export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.section}>
      <AppText variant="title" accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </AppText>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          hitSlop={10}
          style={({ pressed }) => [styles.sectionAction, pressed && styles.pressed]}>
          <AppText variant="label" color={colors.bronze}>
            {actionLabel}
          </AppText>
          <Icon name="arrowRight" size={18} color={colors.bronze} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    gap: space.sm,
  },
  pressed: {
    opacity: 0.8,
  },
  badge: {
    position: 'absolute',
    left: space.xs,
    bottom: space.xs,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.xs,
    paddingHorizontal: space.xxs,
  },
  text: {
    flex: 1,
    gap: space.xs,
  },
  swatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  swatch: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(11, 11, 12, 0.15)',
  },
  arrow: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  sectionTitle: {
    flexShrink: 1,
  },
  sectionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs,
    minHeight: 44,
  },
});
