import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icons/Icon';
import { OutfitCollage } from '@/components/media/OutfitCollage';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Feedback';
import { useOutfit } from '@/data/stylist';
import { colors, fonts, radius, space } from '@/theme';

import { outfitPieces } from './outfitPieces';

/** Visual outfit recommendation inside the stylist conversation. */
export function OutfitCard({ outfitId }: { outfitId: string }) {
  const { data: outfit, isPending, isError } = useOutfit(outfitId);

  if (isPending) return <Skeleton aspectRatio={1.1} />;
  if (isError || !outfit) {
    return (
      <View style={styles.removed}>
        <AppText variant="secondary" color={colors.muted}>
          This outfit is no longer available.
        </AppText>
      </View>
    );
  }

  const allOwned = outfit.resolvedItems.every((r) => r.ref.kind === 'owned' && r.status !== 'missing');
  const missing = outfit.resolvedItems.some((r) => r.status !== 'ok');

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => router.push(`/outfits/${outfit.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`${outfit.title}. ${outfit.explanation} Open outfit`}
        style={({ pressed }) => [pressed && styles.pressed]}>
        <OutfitCollage pieces={outfitPieces(outfit)} aspectRatio={1.1}>
          <Badge label={allOwned ? 'All from your closet' : 'Includes changes'} tone="overlay" style={styles.badge} />
        </OutfitCollage>
      </Pressable>
      <View style={styles.reason}>
        <Icon name="sparkle" size={22} color={colors.champagne} fill={colors.champagne} />
        <AppText variant="heading" style={styles.reasonText}>
          {outfit.explanation}
        </AppText>
      </View>
      {missing ? (
        <AppText variant="caption" color={colors.error}>
          A piece in this outfit was removed or is unavailable. Open it to swap.
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.xs,
  },
  pressed: {
    opacity: 0.85,
  },
  badge: {
    position: 'absolute',
    left: space.sm,
    bottom: space.sm,
  },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.card,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  reasonText: {
    flex: 1,
    fontFamily: fonts.serif,
  },
  removed: {
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
});
