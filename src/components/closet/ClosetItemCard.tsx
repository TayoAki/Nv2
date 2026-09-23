import { Pressable, StyleSheet, View } from 'react-native';

import type { WardrobeItem } from '@/api';
import { GarmentImage } from '@/components/media/GarmentImage';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { IconButton } from '@/components/ui/IconButton';
import { colors, space } from '@/theme';

type Props = {
  item: WardrobeItem;
  onPress: () => void;
  onMore?: () => void;
  selected?: boolean;
};

/** "Owned" only for confirmed closet items; "Ordered" until a purchase is confirmed received. */
export function ownershipLabel(item: WardrobeItem) {
  return item.ownership === 'ordered' ? 'Ordered' : 'Owned';
}

export function ClosetItemCard({ item, onPress, onMore }: Props) {
  const unavailable = item.availability !== 'ready';
  return (
    <View style={styles.card}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${ownershipLabel(item)}${unavailable ? ', unavailable' : ''}`}
        style={({ pressed }) => [pressed && styles.pressed]}>
        <GarmentImage
          image={item.image}
          kind={item.kind}
          colorHex={item.color?.hex}
          aspectRatio={0.96}
          illustrationScale={0.72}
          style={unavailable ? styles.dimmed : null}>
          <Badge label={ownershipLabel(item)} tone="overlay" style={styles.badge} />
          {unavailable ? <Badge label="Unavailable" tone="dark" style={styles.status} /> : null}
        </GarmentImage>
      </Pressable>
      <View style={styles.meta}>
        <AppText variant="body" numberOfLines={1} style={styles.name}>
          {item.name}
        </AppText>
        {onMore ? (
          <IconButton icon="moreVertical" accessibilityLabel={`More options for ${item.name}`} size={36} iconSize={22} onPress={onMore} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    gap: space.xxs,
  },
  pressed: {
    opacity: 0.8,
  },
  dimmed: {
    opacity: 0.55,
  },
  badge: {
    position: 'absolute',
    left: space.xs,
    bottom: space.xs,
  },
  status: {
    position: 'absolute',
    right: space.xs,
    top: space.xs,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: space.xxs,
  },
  name: {
    flex: 1,
    color: colors.ink,
  },
});
