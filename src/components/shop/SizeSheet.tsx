import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { errorMessage, type Product } from '@/api';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Feedback';
import { Sheet } from '@/components/ui/Sheet';
import { useAddToBag } from '@/data/shop';
import { track } from '@/lib/analytics';
import { formatMoney } from '@/lib/format';
import { openBookFitting } from '@/lib/links';
import { showToast } from '@/state/toast';
import { colors, space } from '@/theme';

import { SizeSelector } from './SizeSelector';

type Props = {
  product: Product | undefined;
  visible: boolean;
  onClose: () => void;
};

/** "Choose size" → exact variant → "Add to bag". Size is always the shopper's explicit choice. */
export function SizeSheet({ product, visible, onClose }: Props) {
  const [variantId, setVariantId] = useState<string | null>(null);
  const [needsSize, setNeedsSize] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addToBag = useAddToBag();

  if (!product) return null;
  const variant = product.variants.find((v) => v.id === variantId);

  const add = () => {
    if (!variant) {
      setNeedsSize(true);
      return;
    }
    setError(null);
    addToBag.mutate(
      { productId: product.id, variantId: variant.id, quantity: 1 },
      {
        onSuccess: () => {
          track('add_to_bag', { productId: product.id, variantId: variant.id, source: 'preview' });
          onClose();
          setVariantId(null);
          showToast('Added to your bag', { actionLabel: 'View bag', onAction: () => router.navigate('/bag') });
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Choose size"
      subtitle={`${product.title} · ${formatMoney(variant?.price ?? product.price)}${product.isIllustrative ? ' sample price' : ''}`}
      footer={
        <>
          <Button title="Add to bag" onPress={add} loading={addToBag.isPending} />
          <Button
            title="Not sure? Book a fitting"
            variant="link"
            accessibilityRole="link"
            onPress={() => {
              onClose();
              openBookFitting(product.id);
            }}
          />
        </>
      }>
      <View style={styles.body}>
        <SizeSelector
          variants={product.variants}
          selectedId={variantId}
          highlight={needsSize}
          layout="grid"
          onSelect={(next) => {
            setVariantId(next.id);
            setNeedsSize(false);
            setError(null);
            track('variant_selected', { productId: product.id, variantId: next.id });
          }}
        />
        <AppText variant="secondary" color={colors.muted}>
          The preview shows style, not fit. Size changes the item you buy, not the picture.
        </AppText>
        {error ? <Banner tone="error" message={error} /> : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: space.md,
  },
});
