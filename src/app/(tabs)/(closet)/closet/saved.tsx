import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { errorMessage, isNetworkError, type Look, type ResolvedOutfit } from '@/api';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { GarmentImage } from '@/components/media/GarmentImage';
import { OutfitCollage } from '@/components/media/OutfitCollage';
import { outfitPieces } from '@/components/stylist/outfitPieces';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton, StateView } from '@/components/ui/Feedback';
import { TwoColumnGrid } from '@/components/ui/Grid';
import { IconButton } from '@/components/ui/IconButton';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useSavedOutfits, useSetOutfitSaved } from '@/data/stylist';
import { useSavedLooks } from '@/data/tryOn';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { confirm } from '@/lib/confirm';
import { expiryLabel } from '@/lib/format';
import { showToast } from '@/state/toast';
import { colors, radius, space } from '@/theme';

type Tab = 'outfits' | 'previews';

/** 12 · Saved outfits and previews — /closet/saved */
export default function SavedScreen() {
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'previews' ? 'previews' : 'outfits');
  const outfits = useSavedOutfits();
  const looks = useSavedLooks();
  useRefreshOnFocus(outfits.refetch);
  useRefreshOnFocus(looks.refetch);

  return (
    <Screen
      header={
        <AppHeader
          left="back"
          fallbackHref="/closet"
          right={<IconButton icon="plus" variant="gold" accessibilityLabel="Create another outfit" onPress={() => router.navigate('/stylist')} />}
        />
      }>
      <AppText variant="display" accessibilityRole="header">
        Saved looks
      </AppText>
      <SegmentedControl
        accessibilityLabel="Saved outfits or AI previews"
        options={[
          { value: 'outfits', label: 'Outfits' },
          { value: 'previews', label: 'AI previews' },
        ]}
        value={tab}
        onChange={setTab}
        style={styles.segment}
      />

      {tab === 'outfits' ? <OutfitList query={outfits} /> : <PreviewList query={looks} />}
    </Screen>
  );
}

function OutfitList({ query }: { query: ReturnType<typeof useSavedOutfits> }) {
  if (query.isPending) return <ListSkeleton />;
  if (query.isError) {
    return (
      <StateView
        compact
        kind={isNetworkError(query.error) ? 'offline' : 'error'}
        message={errorMessage(query.error)}
        actionLabel="Try again"
        onAction={() => query.refetch()}
      />
    );
  }
  if (query.data.length === 0) {
    return (
      <StateView
        compact
        kind="empty"
        icon="closet"
        title="No saved outfits yet"
        message="Ask your stylist for a look and save the ones you like. They'll appear here."
        actionLabel="Ask your stylist"
        onAction={() => router.navigate('/stylist')}
      />
    );
  }
  return (
    <View style={styles.list}>
      {query.data.map((outfit) => (
        <OutfitCard key={outfit.id} outfit={outfit} />
      ))}
      <Button title="Create another outfit" icon="plus" variant="gold" onPress={() => router.navigate('/stylist')} />
    </View>
  );
}

function OutfitCard({ outfit }: { outfit: ResolvedOutfit }) {
  const setSaved = useSetOutfitSaved();
  const pieces = outfitPieces(outfit);
  const missing = outfit.resolvedItems.filter((r) => r.status !== 'ok').length;
  const allOwned = outfit.resolvedItems.every((r) => r.ref.kind === 'owned');
  const names = outfit.resolvedItems.map((r) => (r.status === 'missing' ? 'Removed item' : 'item' in r ? r.item.name : r.product.title));
  const open = () => router.push(`/outfits/${outfit.id}`);

  const unsave = async () => {
    const ok = await confirm({ title: `Remove “${outfit.title}” from saved looks?`, confirmLabel: 'Remove' });
    if (ok) setSaved.mutate({ id: outfit.id, saved: false }, { onSuccess: () => showToast('Removed from saved looks') });
  };

  return (
    <View style={styles.card}>
      <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`Open ${outfit.title}`} style={styles.cardCollage}>
        <OutfitCollage pieces={pieces} aspectRatio={0.84} />
      </Pressable>
      <View style={styles.cardInfo}>
        <View style={styles.cardTop}>
          {allOwned ? <Badge label="Owned pieces" tone="neutral" icon="closet" /> : <Badge label="Includes Nyoni pieces" tone="neutral" />}
          <IconButton icon="heart" fill={colors.bronze} color={colors.bronze} accessibilityLabel="Saved. Remove from saved looks" size={36} onPress={unsave} />
        </View>
        <AppText variant="heading" numberOfLines={2}>
          {outfit.title}
        </AppText>
        <View style={styles.rule} />
        <AppText variant="secondary" color={colors.muted} numberOfLines={4}>
          {names.join('  |  ')}
        </AppText>
        {missing > 0 ? (
          <AppText variant="caption" color={colors.error}>
            {missing === 1 ? '1 piece needs replacing' : `${missing} pieces need replacing`}
          </AppText>
        ) : null}
        <Button title="View look" trailingIcon="chevronRight" variant="outline" size="sm" onPress={open} style={styles.viewLook} />
      </View>
    </View>
  );
}

function PreviewList({ query }: { query: ReturnType<typeof useSavedLooks> }) {
  if (query.isPending) return <ListSkeleton />;
  if (query.isError) {
    return (
      <StateView
        compact
        kind={isNetworkError(query.error) ? 'offline' : 'error'}
        message={errorMessage(query.error)}
        actionLabel="Try again"
        onAction={() => query.refetch()}
      />
    );
  }
  if (query.data.length === 0) {
    return (
      <StateView
        compact
        kind="empty"
        icon="image"
        title="No saved previews"
        message="Save an AI preview to keep it here for 30 days."
        actionLabel="Try something on"
        onAction={() => router.navigate('/try-on')}
      />
    );
  }
  return (
    <View style={styles.list}>
      <AppText variant="secondary" color={colors.muted}>
        Saved previews are kept for 30 days unless you delete them sooner.
      </AppText>
      <TwoColumnGrid items={query.data} keyOf={(look) => look.id} renderItem={(look) => <LookCard look={look} />} />
    </View>
  );
}

function LookCard({ look }: { look: Look }) {
  const expired = look.status === 'expired';
  return (
    <Pressable
      onPress={() => router.push(`/preview/${look.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${look.garmentTitle} AI preview, ${expiryLabel(look.expiresAt)}`}
      style={({ pressed }) => [styles.lookCard, pressed && styles.pressed]}>
      <GarmentImage
        image={look.resultImage ?? (look.originalPhotoUri ? { uri: look.originalPhotoUri, alt: 'Your photo' } : undefined)}
        kind={look.garmentKind}
        colorHex={look.garmentColor.hex}
        aspectRatio={0.8}
        style={expired ? styles.dimmed : null}>
        <Badge label={expired ? 'Expired' : 'AI preview'} tone={expired ? 'dark' : 'ai'} icon={expired ? 'clock' : 'sparkle'} style={styles.lookBadge} />
      </GarmentImage>
      <AppText variant="body" numberOfLines={2}>
        {look.garmentTitle}
      </AppText>
      <AppText variant="caption" color={expired ? colors.error : colors.muted}>
        {expired ? 'Expired · create a new preview' : expiryLabel(look.expiresAt)}
        {!look.garmentAvailable ? ' · no longer sold' : ''}
      </AppText>
    </Pressable>
  );
}

function ListSkeleton() {
  return (
    <View style={styles.list}>
      <Skeleton height={220} />
      <Skeleton height={220} />
    </View>
  );
}

const styles = StyleSheet.create({
  segment: {
    marginTop: space.md,
    marginBottom: space.lg,
  },
  list: {
    gap: space.md,
  },
  card: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.sm,
    borderRadius: radius.card + 4,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  cardCollage: {
    width: '48%',
  },
  cardInfo: {
    flex: 1,
    gap: space.xs,
    paddingVertical: space.xs,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rule: {
    width: 44,
    height: 1.5,
    backgroundColor: colors.champagne,
    marginVertical: space.xxs,
  },
  viewLook: {
    marginTop: 'auto',
  },
  lookCard: {
    gap: space.xs,
  },
  pressed: {
    opacity: 0.8,
  },
  dimmed: {
    opacity: 0.5,
  },
  lookBadge: {
    position: 'absolute',
    top: space.xs,
    left: space.xs,
  },
});
