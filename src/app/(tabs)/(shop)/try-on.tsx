import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { isNetworkError, type GarmentKind, type MediaImage } from '@/api';
import { Icon } from '@/components/icons/Icon';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { GarmentImage } from '@/components/media/GarmentImage';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Banner, Skeleton, StateView } from '@/components/ui/Feedback';
import { TwoColumnGrid } from '@/components/ui/Grid';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useWardrobe } from '@/data/closet';
import { useProducts } from '@/data/shop';
import { useOutfit } from '@/data/stylist';
import { isTerminalJobState, useActiveTryOns } from '@/data/tryOn';
import { colors, radius, space } from '@/theme';

type Source = 'shop' | 'closet';

type Candidate = {
  key: string;
  kind: 'product' | 'closet';
  id: string;
  name: string;
  vendor: string;
  garmentKind: GarmentKind;
  colorHex?: string;
  image?: MediaImage;
};

/** 03 · Choose a piece — /try-on */
export default function TryOnPickerScreen() {
  const params = useLocalSearchParams<{ source?: Source; selected?: string; outfitId?: string }>();
  const [source, setSource] = useState<Source>(params.source === 'closet' ? 'closet' : 'shop');
  const [selectedKey, setSelectedKey] = useState<string | null>(
    params.selected ? `${params.source === 'closet' ? 'closet' : 'product'}:${params.selected}` : null,
  );

  const products = useProducts({ tryOnEligible: true });
  const wardrobe = useWardrobe();
  const outfit = useOutfit(params.outfitId);
  const active = useActiveTryOns();

  const outfitItemIds = outfit.data?.items.flatMap((ref) => (ref.kind === 'owned' ? [ref.itemId] : [])) ?? null;

  const candidates: Candidate[] =
    source === 'shop'
      ? (products.data ?? []).map((p) => ({
          key: `product:${p.id}`,
          kind: 'product',
          id: p.id,
          name: p.title,
          vendor: p.vendor,
          garmentKind: p.kind,
          colorHex: p.color.hex,
          image: p.images[0],
        }))
      : (wardrobe.data ?? [])
          .filter(
            (item) =>
              item.tryOnEligible &&
              !item.archived &&
              item.ownership === 'owned' &&
              (!outfitItemIds || outfitItemIds.includes(item.id)),
          )
          .map((item) => ({
            key: `closet:${item.id}`,
            kind: 'closet',
            id: item.id,
            name: item.name,
            vendor: item.brand ?? 'My closet',
            garmentKind: item.kind,
            colorHex: item.color?.hex,
            image: item.image,
          }));

  const query = source === 'shop' ? products : wardrobe;
  const selected = candidates.find((c) => c.key === selectedKey) ?? null;
  const requestedMissing =
    !!params.selected && !query.isPending && selectedKey?.endsWith(params.selected) && !selected;
  const runningJob = active.data?.find((job) => !isTerminalJobState(job.state));

  const onContinue = () => {
    if (!selected) return;
    router.push({
      pathname: '/photo',
      params: selected.kind === 'product' ? { productId: selected.id } : { closetItemId: selected.id },
    });
  };

  return (
    <Screen
      header={<AppHeader left="back" fallbackHref="/shop" />}
      footer={
        <>
          <AppText variant="secondary" color={colors.muted} align="center">
            Only supported garments appear here.
          </AppText>
          <Button
            title="Continue with this piece"
            trailingIcon="arrowRight"
            trailingIconPosition="edge"
            disabled={!selected}
            onPress={onContinue}
          />
        </>
      }>
      <AppText variant="title" align="center" accessibilityRole="header" style={styles.title}>
        What will you try on?
      </AppText>

      <SegmentedControl
        accessibilityLabel="Choose where the piece comes from"
        options={[
          { value: 'shop', label: 'Nyoni collection' },
          { value: 'closet', label: 'My closet' },
        ]}
        value={source}
        onChange={(value) => {
          setSource(value);
          setSelectedKey(null);
        }}
        style={styles.segment}
      />

      {runningJob ? (
        <Pressable
          onPress={() => router.push(`/jobs/${runningJob.id}`)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.resume, pressed && styles.pressed]}>
          <Icon name="clock" size={20} color={colors.bronze} />
          <View style={styles.flex}>
            <AppText variant="label">A preview is still being created</AppText>
            <AppText variant="secondary" color={colors.muted}>
              {runningJob.garmentTitle}
            </AppText>
          </View>
          <AppText variant="label" color={colors.bronze}>
            View
          </AppText>
        </Pressable>
      ) : null}

      {requestedMissing ? (
        <Banner tone="notice" message="That piece is no longer available for try-on. Choose another piece." />
      ) : null}
      {source === 'closet' && outfitItemIds ? (
        <Banner tone="info" message={`Showing pieces from “${outfit.data?.title}” that can be previewed. Shoes and accessories stay in the collage.`} />
      ) : null}

      {query.isPending ? (
        <View style={styles.grid}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} aspectRatio={0.78} style={styles.skeleton} />
          ))}
        </View>
      ) : query.isError ? (
        <StateView
          compact
          kind={isNetworkError(query.error) ? 'offline' : 'error'}
          actionLabel="Try again"
          onAction={() => query.refetch()}
        />
      ) : candidates.length === 0 ? (
        <StateView
          compact
          kind="empty"
          icon="closet"
          title={source === 'closet' ? 'No closet pieces can be previewed yet' : 'No pieces can be previewed right now'}
          message={
            source === 'closet'
              ? 'Jackets, shirts, knitwear and trousers with a clear photo work best. Shoes and accessories are not supported yet.'
              : 'Try-on is being set up for more of the collection. You can still shop every piece.'
          }
          actionLabel={source === 'closet' ? 'Add clothes' : 'Browse the collection'}
          onAction={() => (source === 'closet' ? router.navigate('/closet') : router.dismissTo('/shop'))}
        />
      ) : (
        <TwoColumnGrid
          items={candidates}
          keyOf={(candidate) => candidate.key}
          gap={space.sm}
          rowGap={space.sm}
          accessibilityRole="radiogroup"
          renderItem={(candidate) => {
            const isSelected = candidate.key === selectedKey;
            return (
              <Pressable
                onPress={() => setSelectedKey(candidate.key)}
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected }}
                accessibilityLabel={`${candidate.name}, try-on eligible`}
                style={({ pressed }) => [styles.card, isSelected && styles.cardSelected, pressed && styles.pressed]}>
                <GarmentImage
                  image={candidate.image}
                  kind={candidate.garmentKind}
                  colorHex={candidate.colorHex}
                  aspectRatio={0.98}
                  rounded={0}
                  illustrationScale={0.72}>
                  <Badge label="Try-on eligible" tone="overlay" icon="account" style={styles.eligible} />
                  {isSelected ? (
                    <View style={styles.check}>
                      <Icon name="check" size={18} color={colors.white} strokeWidth={2.2} />
                    </View>
                  ) : null}
                </GarmentImage>
                <View style={styles.cardText}>
                  <AppText variant="heading" numberOfLines={2}>
                    {candidate.name}
                  </AppText>
                  <AppText variant="overline" color={colors.muted} numberOfLines={1} style={styles.vendor}>
                    {candidate.vendor}
                  </AppText>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: space.xs,
  },
  segment: {
    marginTop: space.lg,
    marginBottom: space.md,
  },
  resume: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.champagne,
    marginBottom: space.md,
  },
  flex: {
    flex: 1,
  },
  pressed: {
    opacity: 0.8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.xs,
  },
  skeleton: {
    width: '48%',
    flexGrow: 1,
  },
  card: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  cardSelected: {
    borderWidth: 2,
    borderColor: colors.champagne,
  },
  eligible: {
    position: 'absolute',
    left: space.xs,
    bottom: space.xs,
  },
  check: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bronze,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    padding: space.sm,
    gap: space.xxs,
  },
  vendor: {
    fontSize: 11,
    letterSpacing: 2.2,
  },
});
