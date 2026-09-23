import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isNetworkError, type Occasion, type ProductCategory } from '@/api';
import { BrandLockup } from '@/components/brand/BrandLockup';
import { HeaderMenuButton } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { SectionHeader } from '@/components/shop/ProductCard';
import { GridSkeleton, ProductGrid } from '@/components/shop/ProductGrid';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { StateView } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/TextField';
import { useProducts } from '@/data/shop';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { OCCASION_LABELS } from '@/lib/format';
import { colors, gutter, space } from '@/theme';

const HERO = require('@/assets/images/editorial-hero.jpg');

const HERO_OCCASIONS: Occasion[] = ['wedding', 'business', 'black-tie'];

const CATEGORIES: { value: ProductCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'suits', label: 'Suits' },
  { value: 'tuxedos', label: 'Tuxedos' },
  { value: 'jackets', label: 'Blazers' },
  { value: 'waistcoats', label: 'Waistcoats' },
  { value: 'trousers', label: 'Trousers' },
  { value: 'shoes', label: 'Boots' },
  { value: 'accessories', label: 'Accessories' },
];

/** 01 · Shop — /shop */
export default function ShopScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const [collectionY, setCollectionY] = useState(0);
  const [occasion, setOccasion] = useState<Occasion | null>(null);
  const [category, setCategory] = useState<ProductCategory | 'all'>('all');
  const [search, setSearch] = useState('');

  const featured = useProducts({ featured: true });
  const collection = useProducts({
    occasion: occasion ?? undefined,
    category: category === 'all' ? undefined : category,
    search: search.trim() || undefined,
  });
  useRefreshOnFocus(collection.refetch);

  const scrollToCollection = () => scrollRef.current?.scrollTo({ y: Math.max(0, collectionY - space.sm), animated: true });

  const chooseOccasion = (value: Occasion) => {
    setOccasion((current) => (current === value ? null : value));
    scrollToCollection();
  };

  return (
    <Screen edgeToEdge padded={false} scrollRef={scrollRef} statusBarStyle="light">
      <Hero occasion={occasion} onOccasion={chooseOccasion} onShop={scrollToCollection} />

      <View style={styles.section}>
        <SectionHeader title="Featured pieces" actionLabel="View all" onAction={scrollToCollection} />
        {featured.isPending ? (
          <GridSkeleton count={2} />
        ) : featured.data && featured.data.length > 0 ? (
          <ProductGrid products={featured.data.slice(0, 2)} />
        ) : null}
      </View>

      <View style={styles.section} onLayout={(event) => setCollectionY(event.nativeEvent.layout.y)}>
        <SectionHeader title="The collection" />
        <TextField
          icon="search"
          placeholder="Search suits, blazers, colors…"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search the collection"
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          style={styles.chipScroller}>
          {CATEGORIES.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={category === option.value}
              onPress={() => setCategory(option.value)}
            />
          ))}
        </ScrollView>
        {occasion ? (
          <View style={styles.activeFilter}>
            <AppText variant="secondary" color={colors.muted}>
              Showing pieces for
            </AppText>
            <Chip label={OCCASION_LABELS[occasion]} selected icon="close" onPress={() => setOccasion(null)} accessibilityLabel={`Remove ${OCCASION_LABELS[occasion]} filter`} />
          </View>
        ) : null}

        {collection.isPending ? (
          <GridSkeleton count={4} />
        ) : collection.isError ? (
          <StateView
            compact
            kind={isNetworkError(collection.error) ? 'offline' : 'error'}
            title={isNetworkError(collection.error) ? "We can't reach the store" : "The collection didn't load"}
            actionLabel="Try again"
            onAction={() => collection.refetch()}
          />
        ) : collection.data.length === 0 ? (
          <StateView
            compact
            kind="empty"
            icon="search"
            title={search.trim() ? `No matches for “${search.trim()}”` : 'No pieces match these filters'}
            message="Try a different word, or clear the filters to see the whole collection."
            actionLabel="Clear filters"
            onAction={() => {
              setSearch('');
              setCategory('all');
              setOccasion(null);
            }}
          />
        ) : (
          <ProductGrid products={collection.data} />
        )}
      </View>
    </Screen>
  );
}

function Hero({
  occasion,
  onOccasion,
  onShop,
}: {
  occasion: Occasion | null;
  onOccasion: (value: Occasion) => void;
  onShop: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const heroHeight = Math.min(Math.max(height * 0.66, 520), 680);

  return (
    <View style={[styles.hero, { height: heroHeight }]}>
      <Image
        source={HERO}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition={{ top: '8%', left: '58%' }}
        accessibilityLabel="Editorial photograph: a man in a midnight navy two-piece suit"
      />
      <LinearGradient
        colors={['rgba(11,11,12,0.72)', 'rgba(11,11,12,0)', 'rgba(11,11,12,0)', 'rgba(11,11,12,0.9)']}
        locations={[0, 0.26, 0.42, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={[styles.heroHeader, { paddingTop: insets.top + space.xs }]}>
        <View style={styles.heroSide} />
        <BrandLockup height={52} />
        <View style={[styles.heroSide, styles.heroSideRight]}>
          <HeaderMenuButton tone="dark" />
        </View>
      </View>
      <View style={styles.heroContent}>
        <AppText variant="display" color={colors.ivory} accessibilityRole="header" style={styles.heroTitle}>
          Your next{'\n'}entrance.
        </AppText>
        <Button
          title="Shop the collection"
          variant="gold"
          trailingIcon="arrowRight"
          onPress={onShop}
          style={styles.heroButton}
        />
        <View style={styles.heroChips}>
          {HERO_OCCASIONS.map((value) => (
            <Chip
              key={value}
              label={OCCASION_LABELS[value]}
              surface="onDark"
              selectedTone="gold"
              selected={occasion === value}
              onPress={() => onOccasion(value)}
            />
          ))}
        </View>
      </View>
    </View>
  );
}


const styles = StyleSheet.create({
  hero: {
    width: '100%',
    backgroundColor: colors.ink,
    justifyContent: 'space-between',
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: gutter - 10,
  },
  heroSide: {
    width: 56,
  },
  heroSideRight: {
    alignItems: 'flex-end',
  },
  heroContent: {
    paddingHorizontal: gutter,
    paddingBottom: space.xl,
    gap: space.md,
  },
  heroTitle: {
    fontSize: 46,
    lineHeight: 50,
  },
  heroButton: {
    alignSelf: 'stretch',
    marginTop: space.xs,
  },
  heroChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  section: {
    paddingHorizontal: gutter,
    paddingTop: space.xl,
    gap: space.md,
  },
  chipScroller: {
    marginHorizontal: -gutter,
  },
  chipRow: {
    paddingHorizontal: gutter,
    gap: space.xs,
  },
  activeFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
});
