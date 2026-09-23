import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { errorMessage, isNetworkError, type BagLine } from '@/api';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { GarmentImage } from '@/components/media/GarmentImage';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card, Divider } from '@/components/ui/Card';
import { Banner, Skeleton, StateView } from '@/components/ui/Feedback';
import { IconButton } from '@/components/ui/IconButton';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { useAcceptBagChanges, useAddToBag, useBag, useRemoveBagLine, useUpdateBagLine } from '@/data/shop';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { track } from '@/lib/analytics';
import { formatMoney, pluralize } from '@/lib/format';
import { showToast } from '@/state/toast';
import { colors, space } from '@/theme';

/** 13 · Shopping bag — /bag */
export default function BagScreen() {
  const bag = useBag();
  const accept = useAcceptBagChanges();
  useRefreshOnFocus(bag.refetch);

  const data = bag.data;
  const empty = !!data && data.lines.length === 0;

  return (
    <Screen header={<AppHeader />} onRefresh={bag.refetch} refreshing={bag.isRefetching}>
      <View style={styles.titleRow}>
        <AppText variant="display" accessibilityRole="header">
          Your bag
        </AppText>
        {data && data.itemCount > 0 ? (
          <AppText variant="bodyLarge" color={colors.muted}>
            {pluralize(data.itemCount, 'item')}
          </AppText>
        ) : null}
      </View>

      {bag.isPending ? (
        <View style={styles.lines}>
          <Skeleton height={170} />
          <Skeleton height={24} width="50%" rounded={6} />
        </View>
      ) : bag.isError && !data ? (
        <StateView
          kind={isNetworkError(bag.error) ? 'offline' : 'error'}
          title={isNetworkError(bag.error) ? "We can't reach your bag" : undefined}
          message={errorMessage(bag.error)}
          actionLabel="Try again"
          onAction={() => bag.refetch()}
        />
      ) : empty ? (
        <StateView
          kind="empty"
          icon="bag"
          title="Your bag is empty"
          message="Pieces you add will wait here, with prices checked against the store."
          actionLabel="Shop the collection"
          onAction={() => router.navigate('/shop')}
        />
      ) : data ? (
        <>
          {data.needsReview ? (
            <Banner
              tone="notice"
              title="Your bag changed"
              message="Prices or availability changed since you added these pieces. Review the updates below, then accept them to check out."
              actionLabel={accept.isPending ? 'Updating…' : 'Accept updated bag'}
              onAction={() => accept.mutate()}
              style={styles.banner}
            />
          ) : null}

          <View style={styles.lines}>
            {data.lines.map((line) => (
              <LineCard key={line.id} line={line} />
            ))}
          </View>

          <Divider spacing={space.lg} />
          <View style={styles.subtotalRow}>
            <AppText variant="title">Subtotal</AppText>
            <AppText variant="title">{formatMoney(data.subtotal)}</AppText>
          </View>
          <AppText variant="body" color={colors.muted}>
            Shipping and taxes calculated at checkout.
          </AppText>
          <Divider spacing={space.lg} />

          <Button
            title="Secure checkout"
            trailingIcon="arrowRight"
            disabled={data.needsReview || data.itemCount === 0}
            accessibilityHint="Opens Nyoni's secure store checkout"
            onPress={() => {
              track('checkout_started', { items: data.itemCount });
              router.push('/checkout');
            }}
          />
          {data.needsReview ? (
            <AppText variant="caption" color={colors.muted} align="center" style={styles.caption}>
              Accept the updated bag to continue to checkout.
            </AppText>
          ) : null}
          <Button title="Continue shopping" variant="link" onPress={() => router.navigate('/shop')} style={styles.continue} />
        </>
      ) : null}
    </Screen>
  );
}

function LineCard({ line }: { line: BagLine }) {
  const update = useUpdateBagLine();
  const remove = useRemoveBagLine();
  const add = useAddToBag();
  const unavailable = line.notices.some((n) => n.type === 'unavailable');

  const onRemove = () =>
    remove.mutate(line.id, {
      onSuccess: () =>
        showToast('Removed from your bag', {
          actionLabel: unavailable ? undefined : 'Undo',
          onAction: unavailable
            ? undefined
            : () => add.mutate({ productId: line.productId, variantId: line.variantId, quantity: line.quantity }),
        }),
    });

  return (
    <Card style={styles.card}>
      <View style={styles.cardRow}>
        <GarmentImage
          image={line.image}
          kind={line.kind}
          colorHex={line.color.hex}
          aspectRatio={0.88}
          illustrationScale={0.8}
          rounded={8}
          style={styles.thumb}
        />
        <View style={styles.cardBody}>
          <View style={styles.cardTop}>
            <AppText variant="productTitle" style={styles.flex} numberOfLines={3}>
              {line.title}
            </AppText>
            <IconButton icon="trash" accessibilityLabel={`Remove ${line.title}`} size={36} iconSize={22} onPress={onRemove} />
          </View>
          <AppText variant="body" color={colors.muted}>
            {line.sizeLabel}
          </AppText>
          <View style={styles.qtyRow}>
            {unavailable ? (
              <AppText variant="secondary" color={colors.error}>
                Unavailable
              </AppText>
            ) : (
              <QuantityStepper
                value={line.quantity}
                max={line.maxQuantity}
                itemName={line.title}
                disabled={update.isPending}
                onChange={(quantity) =>
                  update.mutate(
                    { lineId: line.id, quantity },
                    { onError: (error) => showToast(errorMessage(error), { tone: 'error' }) },
                  )
                }
              />
            )}
            <View style={styles.price}>
              <AppText variant="productTitle">{formatMoney(line.lineTotal)}</AppText>
            </View>
          </View>
          {line.isIllustrative ? (
            <AppText variant="caption" color={colors.muted} align="right">
              Demo item · sample price
            </AppText>
          ) : null}
        </View>
      </View>
      {line.notices.map((notice) => (
        <Banner
          key={notice.type}
          tone={notice.type === 'unavailable' ? 'error' : 'notice'}
          style={styles.notice}
          message={
            notice.type === 'price_changed'
              ? `Price updated from ${formatMoney(notice.previous)} to ${formatMoney(line.unitPrice)}.`
              : notice.type === 'quantity_reduced'
                ? `Only ${line.maxQuantity} left in this size, so the quantity changed from ${notice.previousQuantity}.`
                : 'This size is no longer available. Remove it or choose another size.'
          }
          actionLabel={notice.type === 'unavailable' ? 'Choose another size' : undefined}
          onAction={notice.type === 'unavailable' ? () => router.push(`/product/${line.productId}`) : undefined}
        />
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: space.xs,
    marginBottom: space.lg,
  },
  banner: {
    marginBottom: space.md,
  },
  lines: {
    gap: space.md,
  },
  card: {
    padding: space.sm,
    gap: space.sm,
  },
  cardRow: {
    flexDirection: 'row',
    gap: space.md,
  },
  thumb: {
    width: '36%',
  },
  cardBody: {
    flex: 1,
    gap: space.xs,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  flex: {
    flex: 1,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.xs,
    marginTop: space.xs,
  },
  price: {
    alignItems: 'flex-end',
  },
  notice: {
    paddingVertical: space.sm,
  },
  subtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  caption: {
    marginTop: space.xs,
  },
  continue: {
    marginTop: space.md,
  },
});
