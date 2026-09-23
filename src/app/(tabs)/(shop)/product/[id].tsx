import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { errorMessage, isApiError, isNetworkError, type Product, type Variant } from '@/api';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { GarmentImage } from '@/components/media/GarmentImage';
import { SizeSelector } from '@/components/shop/SizeSelector';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Divider } from '@/components/ui/Card';
import { Banner, Skeleton, StateView } from '@/components/ui/Feedback';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { useAddToBag, useProduct } from '@/data/shop';
import { track } from '@/lib/analytics';
import { formatMoney } from '@/lib/format';
import { openBookFitting } from '@/lib/links';
import { useFavorites } from '@/state/favorites';
import { showToast } from '@/state/toast';
import { colors, space } from '@/theme';

/** 02 · Product detail — /product/:id */
export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: product, isPending, isError, error, refetch } = useProduct(id);
  const favorites = useFavorites((state) => state.ids);
  const toggleFavorite = useFavorites((state) => state.toggle);

  const viewedId = product?.id;
  const viewedEligible = product?.tryOn.eligible;
  useEffect(() => {
    if (viewedId) track('product_view', { productId: viewedId, tryOnEligible: viewedEligible });
  }, [viewedId, viewedEligible]);

  const favorite = !!product && favorites.includes(product.id);

  const header = (
    <AppHeader
      left="back"
      right={
        product ? (
          <IconButton
            icon="heart"
            accessibilityLabel={favorite ? 'Remove from favorites' : 'Add to favorites'}
            selected={favorite}
            fill={favorite ? colors.bronze : 'none'}
            color={favorite ? colors.bronze : colors.ink}
            iconSize={26}
            onPress={() => {
              const added = toggleFavorite(product.id);
              showToast(added ? 'Saved to your favorites' : 'Removed from favorites');
            }}
          />
        ) : null
      }
    />
  );

  if (isPending) {
    return (
      <Screen header={header}>
        <View style={styles.loading} accessible accessibilityLabel="Loading product">
          <Skeleton height={36} width="80%" rounded={6} />
          <Skeleton aspectRatio={1.3} />
          <Skeleton height={40} width="40%" rounded={6} />
          <Skeleton height={48} rounded={24} />
        </View>
      </Screen>
    );
  }

  if (isError || !product) {
    const missing = isApiError(error) && error.code === 'not_found';
    return (
      <Screen header={header}>
        <StateView
          kind={isNetworkError(error) ? 'offline' : missing ? 'empty' : 'error'}
          title={missing ? 'This piece is no longer available' : undefined}
          message={missing ? 'It may have sold out or been removed from the collection.' : undefined}
          actionLabel={missing ? 'Back to the shop' : 'Try again'}
          onAction={missing ? () => router.dismissTo('/shop') : () => refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen header={header}>
      <ProductDetails product={product} />
    </Screen>
  );
}

function ProductDetails({ product }: { product: Product }) {
  const [variantId, setVariantId] = useState<string | null>(null);
  const [needsSize, setNeedsSize] = useState(false);
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const addToBag = useAddToBag();

  const variant = product.variants.find((v) => v.id === variantId) ?? null;
  const price = variant?.price ?? product.price;
  const allSoldOut = product.variants.every((v) => v.stock === 'out_of_stock');

  const selectVariant = (next: Variant) => {
    setVariantId(next.id);
    setNeedsSize(false);
    setAddError(null);
    track('variant_selected', { productId: product.id, variantId: next.id });
  };

  const onAddToBag = () => {
    if (!variant) {
      // Never pick a size silently; ask the shopper to choose one.
      setNeedsSize(true);
      return;
    }
    setAddError(null);
    addToBag.mutate(
      { productId: product.id, variantId: variant.id, quantity: 1 },
      {
        onSuccess: () => {
          track('add_to_bag', { productId: product.id, variantId: variant.id });
          showToast('Added to your bag', { actionLabel: 'View bag', onAction: () => router.navigate('/bag') });
        },
        onError: (error) => setAddError(errorMessage(error)),
      },
    );
  };

  return (
    <View style={styles.body}>
      <View style={styles.titleBlock}>
        <AppText variant="title" accessibilityRole="header">
          {product.title}
        </AppText>
        {product.isIllustrative ? <Badge label="Illustrative product" tone="neutral" size="md" /> : null}
      </View>

      <GarmentImage
        image={product.images[0]}
        kind={product.kind}
        colorHex={product.color.hex}
        aspectRatio={1.32}
        illustrationScale={0.66}
        accessibilityLabel={`${product.title} in ${product.color.name}`}
      />
      {product.images.length > 1 ? <Thumbnails product={product} /> : null}

      {product.previousPrice && product.previousPrice.amountMinor !== product.price.amountMinor ? (
        <Banner
          tone="notice"
          title="The price has changed"
          message={`This piece was ${formatMoney(product.previousPrice)} and is now ${formatMoney(product.price)}. The bag always uses the store's current price.`}
        />
      ) : null}

      <Divider />
      <View style={styles.priceRow}>
        <AppText variant="price">{formatMoney(price)}</AppText>
        {product.isIllustrative ? (
          <>
            <View style={styles.priceDivider} />
            <AppText variant="body" color={colors.muted}>
              Sample price
            </AppText>
          </>
        ) : null}
      </View>
      <Divider />

      <View style={styles.sizeRow}>
        <View style={styles.sizeLabel}>
          <AppText variant="bodyLarge">Size</AppText>
          <Button title="Guide" variant="link" tone="muted" onPress={() => setSizeGuideOpen(true)} accessibilityLabel="Size guide" />
        </View>
        <SizeSelector
          variants={product.variants}
          selectedId={variantId}
          onSelect={selectVariant}
          highlight={needsSize}
        />
      </View>

      {allSoldOut ? (
        <Banner tone="notice" message="Every size is sold out right now. Book a fitting to ask about bespoke options." />
      ) : null}
      {addError ? <Banner tone="error" message={addError} /> : null}

      <View style={styles.actions}>
        {product.tryOn.eligible ? (
          <Button
            title="Try it on"
            trailingIcon="arrowRight"
            trailingIconPosition="edge"
            accessibilityHint="Opens a private photo step to create an AI style preview"
            onPress={() => router.push({ pathname: '/photo', params: { productId: product.id } })}
          />
        ) : (
          <View style={styles.ineligible}>
            <AppText variant="secondary" color={colors.muted} align="center">
              {product.tryOn.reasonIfIneligible ?? "Try-on isn't available for this piece yet."}
            </AppText>
          </View>
        )}
        <Button
          title={variant ? 'Add to bag' : 'Choose size'}
          variant="outline"
          loading={addToBag.isPending}
          disabled={allSoldOut}
          onPress={onAddToBag}
        />
        <Button title="Book a fitting" variant="link" accessibilityRole="link" onPress={() => openBookFitting(product.id)} />
      </View>

      <View style={styles.details}>
        <AppText variant="overline" color={colors.bronze}>
          Details
        </AppText>
        <AppText variant="body" color={colors.text}>
          {product.description}
        </AppText>
        {product.tryOn.scopeNote ? (
          <AppText variant="secondary" color={colors.muted}>
            Try-on: {product.tryOn.scopeNote}
          </AppText>
        ) : null}
      </View>

      <Sheet visible={sizeGuideOpen} onClose={() => setSizeGuideOpen(false)} title="Size guide" subtitle={product.title}>
        {product.variants.map((v) => (
          <View key={v.id} style={styles.guideRow}>
            <AppText variant="body">{v.size.label}</AppText>
            <AppText variant="secondary" color={v.stock === 'out_of_stock' ? colors.error : colors.muted}>
              {v.stock === 'out_of_stock' ? 'Sold out' : v.stock === 'low_stock' ? `Only ${v.stockCount} left` : 'In stock'}
            </AppText>
          </View>
        ))}
        <AppText variant="secondary" color={colors.muted} style={styles.guideNote}>
          Sizes use the store&apos;s labels. AI previews don&apos;t measure fit, so book a fitting if you&apos;re between
          sizes.
        </AppText>
        <Button
          title="Book a fitting"
          variant="outline"
          onPress={() => {
            setSizeGuideOpen(false);
            openBookFitting(product.id);
          }}
        />
      </Sheet>
    </View>
  );
}

function Thumbnails({ product }: { product: Product }) {
  return (
    <View style={styles.thumbs}>
      {product.images.slice(0, 5).map((image, index) => (
        <GarmentImage
          key={image.uri ?? index}
          image={image}
          kind={product.kind}
          colorHex={product.color.hex}
          aspectRatio={1}
          rounded={8}
          style={[styles.thumb, index === 0 && styles.thumbSelected]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    gap: space.md,
    paddingTop: space.md,
  },
  body: {
    gap: space.md,
  },
  titleBlock: {
    gap: space.sm,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
  },
  priceDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.hairline,
  },
  sizeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
  },
  sizeLabel: {
    width: 52,
    minHeight: 48,
    justifyContent: 'center',
  },
  actions: {
    gap: space.sm,
    marginTop: space.xs,
  },
  ineligible: {
    minHeight: 52,
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    paddingHorizontal: space.md,
  },
  details: {
    gap: space.xs,
    marginTop: space.lg,
  },
  thumbs: {
    flexDirection: 'row',
    gap: space.xs,
  },
  thumb: {
    flex: 1,
  },
  thumbSelected: {
    borderWidth: 1.5,
    borderColor: colors.champagne,
  },
  guideRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  guideNote: {
    marginVertical: space.md,
  },
});
