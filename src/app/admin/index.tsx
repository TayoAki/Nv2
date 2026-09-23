import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { isNetworkError, type Product } from '@/api';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { GarmentImage } from '@/components/media/GarmentImage';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, Divider } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Banner, StateView } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/TextField';
import { Icon } from '@/components/icons/Icon';
import { useAdminProducts } from '@/data/admin';
import { formatMoney, pluralize } from '@/lib/format';
import { colors, radius, space } from '@/theme';

type Filter = 'all' | 'placeholder' | 'admin' | 'attention';

const needsAttention = (product: Product) => product.variants.some((v) => v.stock !== 'in_stock');

const FILTERS: { value: Filter; label: string; test: (product: Product) => boolean }[] = [
  { value: 'all', label: 'All', test: () => true },
  { value: 'placeholder', label: 'Made-up sizes', test: (p) => p.sizeSource === 'placeholder' },
  { value: 'admin', label: 'Edited', test: (p) => p.sizeSource === 'admin' },
  { value: 'attention', label: 'Low or sold out', test: needsAttention },
];

/**
 * Store admin — /admin. Staff tool for sizes, stock and prices. Edits are saved in the app
 * until the WooCommerce sync is connected, then stock comes from the store.
 */
export default function AdminScreen() {
  const products = useAdminProducts();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const all = products.data ?? [];
  const test = FILTERS.find((f) => f.value === filter)!.test;
  const query = search.trim().toLowerCase();
  const shown = all.filter((p) => test(p) && (!query || p.title.toLowerCase().includes(query)));

  return (
    <Screen header={<AppHeader left="back" fallbackHref="/shop" title="Store admin" />} contentStyle={styles.content}>
      <View style={styles.intro}>
        <AppText variant="title" accessibilityRole="header">
          Sizes and stock
        </AppText>
        <AppText variant="body" color={colors.muted}>
          Set the sizes, stock and price the app shows for each product.
        </AppText>
      </View>

      <Banner
        tone="notice"
        icon="info"
        title="WooCommerce isn't connected yet"
        message="Changes here are saved in the app. Once the store sync is live, stock will update from WooCommerce."
      />
      <Button title="Sync with WooCommerce" icon="retry" variant="outline" disabled accessibilityHint="Available once the store is connected" />

      <TextField icon="search" placeholder="Search products" value={search} onChangeText={setSearch} accessibilityLabel="Search products" />
      <View style={styles.filters}>
        {FILTERS.map((option) => (
          <Chip
            key={option.value}
            label={option.value === 'all' ? option.label : `${option.label} (${all.filter(option.test).length})`}
            selected={filter === option.value}
            onPress={() => setFilter(option.value)}
          />
        ))}
      </View>

      {products.isPending ? (
        <StateView compact kind="loading" title="Loading products" />
      ) : products.isError ? (
        <StateView
          compact
          kind={isNetworkError(products.error) ? 'offline' : 'error'}
          actionLabel="Try again"
          onAction={() => products.refetch()}
        />
      ) : shown.length === 0 ? (
        <StateView compact kind="empty" icon="search" title="No products match" message="Try another filter or search." />
      ) : (
        <Card padded={false}>
          {shown.map((product, index) => (
            <View key={product.id}>
              {index > 0 ? <Divider /> : null}
              <ProductRow product={product} />
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

function ProductRow({ product }: { product: Product }) {
  const units = product.variants.reduce((sum, v) => sum + v.stockCount, 0);
  const soldOut = product.variants.filter((v) => v.stock === 'out_of_stock').length;
  return (
    <Pressable
      onPress={() => router.push(`/admin/${product.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${product.title}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <GarmentImage
        image={product.images[0]}
        kind={product.kind}
        colorHex={product.color.hex}
        contentFit="contain"
        rounded={radius.control}
        style={styles.thumb}
      />
      <View style={styles.rowText}>
        <AppText variant="label" numberOfLines={2}>
          {product.title}
        </AppText>
        <AppText variant="caption" color={colors.muted}>
          {formatMoney(product.price)} · {pluralize(product.variants.length, 'size')} · {units} in stock
          {soldOut ? ` · ${soldOut} sold out` : ''}
        </AppText>
        {product.sizeSource !== 'store' ? (
          <Badge
            label={product.sizeSource === 'placeholder' ? 'Made-up sizes' : 'Edited here'}
            tone={product.sizeSource === 'placeholder' ? 'notice' : 'neutral'}
            style={styles.badge}
          />
        ) : null}
      </View>
      <Icon name="chevronRight" size={20} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: space.md,
  },
  intro: {
    gap: space.xxs,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm,
    minHeight: 72,
  },
  pressed: {
    opacity: 0.7,
  },
  thumb: {
    width: 56,
    height: 56,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  badge: {
    alignSelf: 'flex-start',
    marginTop: 2,
  },
});
