import { StyleSheet, View } from 'react-native';

import type { Product } from '@/api';
import { Skeleton } from '@/components/ui/Feedback';
import { TwoColumnGrid } from '@/components/ui/Grid';
import { space } from '@/theme';

import { ProductCard } from './ProductCard';

export function ProductGrid({ products, showEligibility }: { products: Product[]; showEligibility?: boolean }) {
  return (
    <TwoColumnGrid
      items={products}
      keyOf={(product) => product.id}
      renderItem={(product) => <ProductCard product={product} showEligibility={showEligibility} />}
    />
  );
}

export function GridSkeleton({ count }: { count: number }) {
  return (
    <View style={styles.gridRowWrap} accessibilityLabel="Loading products" accessible>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={styles.skeletonCard}>
          <Skeleton aspectRatio={0.96} />
          <Skeleton height={16} width="70%" rounded={4} />
          <Skeleton height={12} width="35%" rounded={4} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  gridRowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
  },
  skeletonCard: {
    width: '47%',
    flexGrow: 1,
    gap: space.xs,
  },
});
