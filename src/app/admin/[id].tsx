import { Redirect, useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { errorMessage, isApiError, isNetworkError, type Product } from '@/api';
import { AdminGate } from '@/components/admin/AdminGate';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { GarmentImage } from '@/components/media/GarmentImage';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, Divider } from '@/components/ui/Card';
import { Banner, StateView } from '@/components/ui/Feedback';
import { IconButton } from '@/components/ui/IconButton';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { TextField } from '@/components/ui/TextField';
import { useResetInventory, useUpdateInventory } from '@/data/admin';
import { useProduct } from '@/data/shop';
import { confirm } from '@/lib/confirm';
import { formatMoney } from '@/lib/format';
import { showToast } from '@/state/toast';
import { colors, radius, space } from '@/theme';

type SizeRow = { key: string; label: string; stockCount: number };

const SOURCE_NOTE: Record<Product['sizeSource'], string> = {
  store: 'Sizes and stock from the store export.',
  placeholder: "Made-up sizes: the store export doesn't list sizes for this product yet.",
  admin: 'Edited here. These values replace the store export until WooCommerce sync is live.',
};

/** Store admin · product — /admin/:id. Sizes, stock and price for one product. */
export default function AdminProductScreen() {
  return (
    <AdminGate>
      <AdminProduct />
    </AdminGate>
  );
}

function AdminProduct() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const product = useProduct(id);

  return (
    <Screen header={<AppHeader left="back" fallbackHref="/admin" title="Edit product" />}>
      {product.isPending ? (
        <StateView kind="loading" title="Loading product" />
      ) : product.isError || !product.data ? (
        <StateView
          kind={isNetworkError(product.error) ? 'offline' : 'error'}
          actionLabel="Try again"
          onAction={() => product.refetch()}
        />
      ) : (
        // Remount after a save so the form's starting point is the saved values.
        <InventoryForm key={formKey(product.data)} product={product.data} />
      )}
    </Screen>
  );
}

const stockBadge = (count: number) =>
  count === 0
    ? ({ label: 'Sold out', tone: 'error' } as const)
    : count <= 2
      ? ({ label: 'Low stock', tone: 'notice' } as const)
      : ({ label: 'In stock', tone: 'success' } as const);

const formKey = (product: Product) =>
  `${product.price.amountMinor}:${product.variants.map((v) => `${v.id}=${v.stockCount}`).join(',')}`;

let rowCounter = 0;
const rowKey = () => `row-${(rowCounter += 1)}`;

function InventoryForm({ product }: { product: Product }) {
  const navigation = useNavigation();
  const update = useUpdateInventory();
  const reset = useResetInventory();

  const initialPrice = String(product.price.amountMinor / 100);
  const initialSizes = product.variants.map((v) => ({ label: v.size.label, stockCount: v.stockCount }));
  const [price, setPrice] = useState(initialPrice);
  const [sizes, setSizes] = useState<SizeRow[]>(() => initialSizes.map((size) => ({ ...size, key: rowKey() })));
  const [newSize, setNewSize] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  const dirty =
    price.trim() !== initialPrice ||
    JSON.stringify(sizes.map(({ label, stockCount }) => ({ label, stockCount }))) !== JSON.stringify(initialSizes);

  usePreventRemove(dirty && !update.isPending, ({ data }) => {
    confirm({
      title: 'Discard your changes?',
      message: "The sizes and stock for this product haven't been saved.",
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
      destructive: true,
    }).then((discard) => {
      if (discard) navigation.dispatch(data.action);
    });
  });

  const changeSize = (key: string, change: Partial<SizeRow>) =>
    setSizes((rows) => rows.map((row) => (row.key === key ? { ...row, ...change } : row)));

  const addSize = () => {
    const label = newSize.trim();
    if (!label) return;
    if (sizes.some((row) => row.label.trim().toLowerCase() === label.toLowerCase())) {
      setError(`${label} is already in the list.`);
      return;
    }
    setError(null);
    setSizes((rows) => [...rows, { key: rowKey(), label, stockCount: 1 }]);
    setNewSize('');
  };

  const save = () => {
    setError(null);
    const dollars = price.trim().replace(/[$,\s]/g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(dollars) || Number(dollars) <= 0) {
      setError('Enter the price in dollars, like 895.');
      return;
    }
    update.mutate(
      {
        productId: product.id,
        update: {
          price: { amountMinor: Math.round(Number(dollars) * 100), currency: product.price.currency },
          sizes: sizes.map(({ label, stockCount }) => ({ label, stockCount })),
        },
      },
      {
        onSuccess: () => showToast('Saved. The shop now shows these sizes.'),
        onError: (err) => {
          if (isApiError(err) && err.code === 'unauthorized') setSessionExpired(true);
          else setError(errorMessage(err));
        },
      },
    );
  };

  const onReset = async () => {
    const ok = await confirm({
      title: 'Go back to the store data?',
      message: 'Your edits to this product are removed and the store export’s sizes, stock and price return.',
      confirmLabel: 'Reset',
      destructive: true,
    });
    if (ok) reset.mutate(product.id, { onSuccess: () => showToast('Store data restored') });
  };

  const units = sizes.reduce((sum, row) => sum + row.stockCount, 0);

  if (sessionExpired) return <Redirect href={{ pathname: '/admin/login', params: { next: `/admin/${product.id}` } }} />;

  return (
    <View style={styles.form}>
      <View style={styles.product}>
        <GarmentImage
          image={product.images[0]}
          kind={product.kind}
          colorHex={product.color.hex}
          contentFit="contain"
          rounded={radius.control}
          style={styles.thumb}
        />
        <View style={styles.productText}>
          <AppText variant="heading" accessibilityRole="header">
            {product.title}
          </AppText>
          <AppText variant="caption" color={colors.muted}>
            {SOURCE_NOTE[product.sizeSource]}
          </AppText>
          {product.sizeSource === 'placeholder' ? <Badge label="Made-up sizes" tone="notice" style={styles.badge} /> : null}
        </View>
      </View>

      <TextField
        label="Price"
        prefix="$"
        value={price}
        onChangeText={setPrice}
        keyboardType="decimal-pad"
        accessibilityLabel="Price in dollars"
        hint={product.pieces.length > 1 ? `One price for the whole ${product.pieces.length}-piece suit.` : undefined}
      />

      <View style={styles.section}>
        <View>
          <AppText variant="heading">Sizes</AppText>
          <AppText variant="secondary" color={colors.muted}>
            Stock of 2 or fewer shows as low stock; 0 shows as sold out. {units} in stock in total.
          </AppText>
        </View>
        <Card padded={false}>
          {sizes.length === 0 ? (
            <AppText variant="secondary" color={colors.muted} style={styles.emptySizes}>
              No sizes yet. Add at least one below.
            </AppText>
          ) : (
            sizes.map((row, index) => (
              <View key={row.key}>
                {index > 0 ? <Divider /> : null}
                <View style={styles.sizeRow}>
                  <View style={styles.sizeHeader}>
                    <AppText variant="label" color={colors.muted}>
                      Size {index + 1}
                    </AppText>
                    <IconButton
                      icon="trash"
                      accessibilityLabel={`Remove ${row.label || 'this size'}`}
                      size={40}
                      iconSize={20}
                      onPress={() => setSizes((rows) => rows.filter((r) => r.key !== row.key))}
                    />
                  </View>
                  <TextField
                    value={row.label}
                    onChangeText={(label) => changeSize(row.key, { label })}
                    accessibilityLabel={`Size label ${index + 1}`}
                  />
                  <View style={styles.stockRow}>
                    <AppText variant="label" color={colors.muted}>
                      Stock
                    </AppText>
                    <QuantityStepper
                      value={row.stockCount}
                      min={0}
                      max={999}
                      itemName={`${row.label || 'this size'} stock`}
                      onChange={(stockCount) => changeSize(row.key, { stockCount })}
                    />
                    <Badge {...stockBadge(row.stockCount)} />
                  </View>
                </View>
              </View>
            ))
          )}
        </Card>
        <View style={styles.addRow}>
          <TextField
            placeholder="New size, e.g. 40US / 50EU"
            value={newSize}
            onChangeText={setNewSize}
            onSubmitEditing={addSize}
            returnKeyType="done"
            label="Add a size"
            accessibilityLabel="New size label"
          />
          <Button
            title="Add size"
            icon="plus"
            size="sm"
            variant="outline"
            fullWidth={false}
            onPress={addSize}
            disabled={!newSize.trim()}
            style={styles.addButton}
          />
        </View>
      </View>

      {error ? <Banner tone="error" message={error} /> : null}
      <Button title={dirty ? 'Save changes' : 'Saved'} onPress={save} disabled={!dirty} loading={update.isPending} />
      {product.sizeSource === 'admin' ? (
        <Button title="Reset to store data" variant="link" tone="muted" onPress={onReset} loading={reset.isPending} />
      ) : null}
      <AppText variant="caption" color={colors.muted} align="center">
        Shoppers see changes right away. Current price: {formatMoney(product.price)}.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: space.lg,
    paddingTop: space.xs,
  },
  product: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'center',
  },
  thumb: {
    width: 88,
    height: 88,
  },
  productText: {
    flex: 1,
    gap: space.xxs,
  },
  badge: {
    alignSelf: 'flex-start',
  },
  section: {
    gap: space.sm,
  },
  emptySizes: {
    padding: space.md,
  },
  sizeRow: {
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingTop: space.xs,
    paddingBottom: space.md,
  },
  stockRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm,
  },
  sizeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: -space.xs,
  },
  addRow: {
    gap: space.sm,
  },
  addButton: {
    alignSelf: 'flex-start',
  },
});
