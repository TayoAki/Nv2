import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  errorMessage,
  isApiError,
  isNetworkError,
  type ResolvedOutfit,
  type ResolvedOutfitItem,
  type WardrobeCategory,
  type WardrobeItem,
} from '@/api';
import { Icon } from '@/components/icons/Icon';
import { AppHeader, goBack } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { GarmentImage } from '@/components/media/GarmentImage';
import { OutfitCollage } from '@/components/media/OutfitCollage';
import { itemName, outfitPieces } from '@/components/stylist/outfitPieces';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Divider } from '@/components/ui/Card';
import { Banner, StateView } from '@/components/ui/Feedback';
import { IconButton } from '@/components/ui/IconButton';
import { ListRow } from '@/components/ui/ListRow';
import { OptionSheet } from '@/components/ui/SelectField';
import { Sheet } from '@/components/ui/Sheet';
import { useWardrobe } from '@/data/closet';
import { useDeleteOutfit, useOutfit, useSetOutfitSaved, useSwapOutfitItem } from '@/data/stylist';
import { track } from '@/lib/analytics';
import { confirm } from '@/lib/confirm';
import { pluralize } from '@/lib/format';
import { showToast } from '@/state/toast';
import { colors, radius, space } from '@/theme';

/** Layers that can replace each other in a swap. */
const SWAP_GROUP: Record<WardrobeCategory, string> = {
  jackets: 'outer',
  waistcoats: 'mid',
  knitwear: 'outer',
  shirts: 'top',
  trousers: 'bottom',
  shoes: 'shoes',
  accessories: 'accessory',
};

/** 11 · Outfit recommendation — /outfits/:id */
export default function OutfitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: outfit, isPending, isError, error, refetch } = useOutfit(id);
  const [menuOpen, setMenuOpen] = useState(false);

  const header = (
    <AppHeader
      left="back"
      fallbackHref="/stylist"
      right={outfit ? <IconButton icon="moreHorizontal" accessibilityLabel="Outfit options" onPress={() => setMenuOpen(true)} /> : null}
    />
  );

  if (isPending) {
    return (
      <Screen header={header}>
        <StateView kind="loading" title="Opening your outfit" />
      </Screen>
    );
  }
  if (isError || !outfit) {
    const missing = isApiError(error) && error.code === 'not_found';
    return (
      <Screen header={header}>
        <StateView
          kind={isNetworkError(error) ? 'offline' : missing ? 'empty' : 'error'}
          title={missing ? 'This outfit is no longer available' : undefined}
          actionLabel={missing ? 'Ask your stylist' : 'Try again'}
          onAction={missing ? () => router.navigate('/stylist') : () => refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen header={header}>
      <OutfitBody outfit={outfit} />
      <OutfitMenu outfit={outfit} visible={menuOpen} onClose={() => setMenuOpen(false)} />
    </Screen>
  );
}

function OutfitBody({ outfit }: { outfit: ResolvedOutfit }) {
  const wardrobe = useWardrobe();
  const setSaved = useSetOutfitSaved();
  const swap = useSwapOutfitItem();
  const [swapIndex, setSwapIndex] = useState<number | null>(null);

  const ownedCount = outfit.resolvedItems.filter((r) => r.ref.kind === 'owned' && r.status !== 'missing').length;
  const canTryOn = outfit.resolvedItems.some((r) => r.status === 'ok' && 'item' in r && r.item.tryOnEligible);
  const needsAttention = outfit.resolvedItems.some((r) => r.status !== 'ok');

  const swapTarget = swapIndex === null ? null : outfit.resolvedItems[swapIndex];
  const candidates = swapTarget ? swapOptions(swapTarget, wardrobe.data ?? []) : [];

  const toggleSaved = () =>
    setSaved.mutate(
      { id: outfit.id, saved: !outfit.saved },
      {
        onSuccess: (updated) => {
          if (updated.saved) {
            track('outfit_saved', { outfitId: outfit.id, pieces: outfit.items.length });
            showToast('Outfit saved', { actionLabel: 'View', onAction: () => router.navigate({ pathname: '/closet/saved', params: { tab: 'outfits' } }) });
          } else {
            showToast('Removed from saved looks');
          }
        },
        onError: (error) => showToast(errorMessage(error), { tone: 'error' }),
      },
    );

  return (
    <View style={styles.body}>
      <View>
        <AppText variant="display" accessibilityRole="header">
          {outfit.title}
        </AppText>
        <AppText variant="bodyLarge" color={colors.muted}>
          {pluralize(ownedCount, 'piece')} you own
        </AppText>
      </View>

      <OutfitCollage pieces={outfitPieces(outfit)} aspectRatio={1.3} />
      <AppText variant="heading">{outfit.explanation}</AppText>

      {needsAttention ? (
        <Banner
          tone="notice"
          title="Part of this outfit changed"
          message="A piece was removed or marked unavailable. Swap it to keep the look complete."
        />
      ) : null}

      <View>
        {outfit.resolvedItems.map((resolved, index) => (
          <View key={`${index}-${resolved.ref.kind === 'owned' ? resolved.ref.itemId : resolved.ref.productId}`}>
            {index > 0 ? <Divider inset={76} /> : null}
            <PieceRow resolved={resolved} onSwap={() => setSwapIndex(index)} />
          </View>
        ))}
      </View>

      {outfit.complement && !outfit.ownedOnly && outfit.complementProduct ? (
        <View style={styles.complement}>
          <GarmentImage
            image={outfit.complementProduct.images[0]}
            kind={outfit.complementProduct.kind}
            colorHex={outfit.complementProduct.color.hex}
            rounded={0}
            illustrationScale={0.7}
            style={styles.complementImage}
          />
          <View style={styles.complementText}>
            <AppText variant="overline" color={colors.ink} style={styles.complementOverline}>
              Complete it with Nyoni
            </AppText>
            <AppText variant="bodyLarge">{outfit.complementProduct.title}</AppText>
            <AppText variant="secondary" color={colors.muted}>
              {outfit.complementStale ? 'No longer available' : `Store suggestion${outfit.complementProduct.isIllustrative ? ' · Illustrative' : ''}`}
            </AppText>
            {!outfit.complementStale ? (
              <Pressable
                onPress={() => router.push(`/product/${outfit.complementProduct!.id}`)}
                accessibilityRole="link"
                hitSlop={8}
                style={styles.viewInShop}>
                <AppText variant="label" color={colors.bronze}>
                  View in shop
                </AppText>
                <Icon name="arrowRight" size={16} color={colors.bronze} />
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button
          title={outfit.saved ? 'Saved to your looks' : 'Save outfit'}
          icon={outfit.saved ? 'check' : undefined}
          variant={outfit.saved ? 'outline' : 'gold'}
          loading={setSaved.isPending}
          onPress={toggleSaved}
        />
        <Button
          title="Choose an item to try on"
          variant="outline"
          disabled={!canTryOn}
          onPress={() => router.push({ pathname: '/try-on', params: { source: 'closet', outfitId: outfit.id } })}
        />
        {!canTryOn ? (
          <AppText variant="caption" color={colors.muted} align="center">
            None of these pieces can be previewed yet. Shoes and accessories stay in the collage.
          </AppText>
        ) : null}
      </View>

      <OptionSheet
        visible={swapIndex !== null}
        title="Swap this piece"
        subtitle={swapTarget ? `Replacing ${itemName(swapTarget)}` : undefined}
        options={candidates.map((item) => ({
          value: item.id,
          label: item.name,
          description: [item.color?.name, item.pattern].filter(Boolean).join(' · ') || undefined,
        }))}
        value={null}
        emptyMessage="No other available pieces of this kind in your closet."
        onClose={() => setSwapIndex(null)}
        onSelect={(itemId) => {
          const index = swapIndex;
          setSwapIndex(null);
          if (index === null) return;
          swap.mutate(
            { outfitId: outfit.id, index, itemId },
            {
              onSuccess: () => showToast('Piece swapped'),
              onError: (error) => showToast(errorMessage(error), { tone: 'error' }),
            },
          );
        }}
      />
    </View>
  );
}

function swapOptions(target: ResolvedOutfitItem, wardrobe: WardrobeItem[]): WardrobeItem[] {
  const current = 'item' in target ? target.item : null;
  const group = current ? SWAP_GROUP[current.category] : null;
  return wardrobe.filter(
    (item) =>
      item.id !== current?.id &&
      !item.archived &&
      item.availability === 'ready' &&
      item.ownership === 'owned' &&
      (!group || SWAP_GROUP[item.category] === group),
  );
}

function PieceRow({ resolved, onSwap }: { resolved: ResolvedOutfitItem; onSwap: () => void }) {
  const missing = resolved.status === 'missing';
  const unavailable = resolved.status === 'unavailable';
  const details =
    resolved.status === 'missing'
      ? 'Removed from your closet'
      : 'item' in resolved
        ? [resolved.item.color?.name, categoryLabel(resolved.item.category)].filter(Boolean).join(' · ') +
          (unavailable ? ' · Unavailable' : '')
        : `${resolved.product.color.name} · Nyoni`;

  return (
    <View style={styles.piece}>
      {missing ? (
        <View style={[styles.pieceThumb, styles.missingThumb]}>
          <Icon name="alert" size={22} color={colors.error} />
        </View>
      ) : (
        <GarmentImage
          image={'item' in resolved ? resolved.item.image : resolved.product.images[0]}
          kind={'item' in resolved ? resolved.item.kind : resolved.product.kind}
          colorHex={'item' in resolved ? resolved.item.color?.hex : resolved.product.color.hex}
          rounded={8}
          illustrationScale={0.8}
          style={styles.pieceThumb}
        />
      )}
      <View style={styles.pieceText}>
        <AppText variant="body" color={missing ? colors.error : colors.ink} numberOfLines={1}>
          {itemName(resolved)}
        </AppText>
        <AppText variant="secondary" color={missing || unavailable ? colors.error : colors.muted} numberOfLines={1}>
          {details}
        </AppText>
      </View>
      {resolved.ref.kind === 'owned' ? (
        <Button title="Swap" icon="swap" variant="outline" size="sm" fullWidth={false} onPress={onSwap} style={styles.swap} accessibilityLabel={`Swap ${itemName(resolved)}`} />
      ) : null}
    </View>
  );
}

function OutfitMenu({ outfit, visible, onClose }: { outfit: ResolvedOutfit; visible: boolean; onClose: () => void }) {
  const remove = useDeleteOutfit();
  return (
    <Sheet visible={visible} onClose={onClose} title={outfit.title}>
      <ListRow
        icon="stylist"
        title="Ask for another look"
        onPress={() => {
          onClose();
          router.navigate('/stylist');
        }}
      />
      <ListRow
        icon="trash"
        title="Delete outfit"
        destructive
        onPress={async () => {
          onClose();
          const ok = await confirm({ title: 'Delete this outfit?', confirmLabel: 'Delete', destructive: true });
          if (!ok) return;
          remove.mutate(outfit.id, {
            onSuccess: () => {
              showToast('Outfit deleted');
              goBack('/stylist');
            },
          });
        }}
      />
    </Sheet>
  );
}

function categoryLabel(category: WardrobeCategory) {
  return {
    jackets: 'Jacket',
    waistcoats: 'Waistcoat',
    shirts: 'Shirt',
    knitwear: 'Knitwear',
    trousers: 'Trousers',
    shoes: 'Shoes',
    accessories: 'Accessory',
  }[category];
}

const styles = StyleSheet.create({
  body: {
    gap: space.md,
  },
  piece: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.xs,
  },
  pieceThumb: {
    width: 60,
    height: 52,
  },
  missingThumb: {
    borderRadius: 8,
    backgroundColor: colors.errorBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pieceText: {
    flex: 1,
    gap: 2,
  },
  swap: {
    minHeight: 40,
  },
  complement: {
    flexDirection: 'row',
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  complementImage: {
    width: 116,
  },
  complementText: {
    flex: 1,
    padding: space.md,
    gap: 3,
  },
  complementOverline: {
    fontSize: 11,
    letterSpacing: 2.4,
  },
  viewInShop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs,
    marginTop: space.xxs,
    alignSelf: 'flex-start',
  },
  actions: {
    gap: space.sm,
  },
});
