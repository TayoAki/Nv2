import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { errorMessage, isApiError, isNetworkError, type OrderReceipt } from '@/api';
import { Icon } from '@/components/icons/Icon';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { GarmentImage } from '@/components/media/GarmentImage';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card, Divider } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { ProgressRing, StateView } from '@/components/ui/Feedback';
import { useReceipt, useSetReceiptClosetOptIn } from '@/data/shop';
import { track } from '@/lib/analytics';
import { formatMoney } from '@/lib/format';
import { links, openExternal } from '@/lib/links';
import { showToast } from '@/state/toast';
import { colors, space } from '@/theme';

/** 15 · Order status — /order/:receipt. Success only after the store verifies the order. */
export default function OrderScreen() {
  const { receipt: receiptId } = useLocalSearchParams<{ receipt: string }>();
  const { data: receipt, isPending, isError, error, refetch } = useReceipt(receiptId);

  const status = receipt?.status;
  useEffect(() => {
    if (status === 'paid' && receiptId) track('order_paid', { receiptId });
  }, [status, receiptId]);

  const header = <AppHeader left="back" fallbackHref="/bag" />;

  if (isPending) {
    return (
      <Screen header={header}>
        <StateView kind="loading" title="Checking your order" />
      </Screen>
    );
  }

  if (isError || !receipt) {
    const missing = isApiError(error) && error.code === 'not_found';
    return (
      <Screen header={header}>
        <StateView
          kind={isNetworkError(error) ? 'offline' : missing ? 'empty' : 'error'}
          icon="package"
          title={missing ? "We can't find this order" : "We couldn't check this order"}
          message={missing ? errorMessage(error) : 'Your order status is kept by the store. Try again in a moment.'}
          actionLabel={missing ? 'Contact Nyoni' : 'Try again'}
          onAction={missing ? () => openExternal(links.contact) : () => refetch()}
          secondaryLabel="Continue shopping"
          onSecondary={() => router.navigate('/shop')}
        />
      </Screen>
    );
  }

  return (
    <Screen header={header}>
      {receipt.isDemo ? <DemoLabel label={receipt.status === 'paid' ? 'Demo confirmation' : 'Demo order'} /> : null}
      {receipt.status === 'pending' ? (
        <Pending />
      ) : receipt.status === 'paid' ? (
        <Confirmed receipt={receipt} />
      ) : (
        <NotCompleted receipt={receipt} />
      )}
    </Screen>
  );
}

function DemoLabel({ label }: { label: string }) {
  return (
    <View style={styles.demoLabel}>
      <View style={styles.hairline} />
      <AppText variant="overline" color={colors.bronze}>
        {label}
      </AppText>
      <View style={styles.hairline} />
    </View>
  );
}

function Pending() {
  return (
    <View style={styles.center} accessibilityLiveRegion="polite">
      <ProgressRing size={72} />
      <AppText variant="title" align="center">
        Confirming your order
      </AppText>
      <AppText variant="bodyLarge" color={colors.muted} align="center">
        We&apos;re waiting for the store to confirm your payment. This screen updates by itself.
      </AppText>
    </View>
  );
}

function Confirmed({ receipt }: { receipt: OrderReceipt }) {
  const optIn = useSetReceiptClosetOptIn();
  return (
    <View style={styles.body}>
      <View style={styles.center}>
        <View style={styles.checkCircle}>
          <Icon name="check" size={40} color={colors.bronze} strokeWidth={2} />
        </View>
        <AppText variant="display" align="center" accessibilityRole="header">
          Thank you.{'\n'}Your order is confirmed.
        </AppText>
        <AppText variant="bodyLarge" color={colors.muted} align="center">
          A receipt will be sent to your email.
        </AppText>
      </View>

      <Card style={styles.orderCard}>
        {receipt.lines.map((line, index) => (
          <View key={line.id}>
            {index > 0 ? <Divider spacing={space.sm} /> : null}
            <View style={styles.lineRow}>
              <GarmentImage kind={line.kind} colorHex={line.color.hex} image={line.image} aspectRatio={0.86} rounded={8} illustrationScale={0.8} style={styles.lineThumb} />
              <View style={styles.lineText}>
                <AppText variant="productTitle">{line.title}</AppText>
                <AppText variant="body" color={colors.muted}>
                  {line.color.name}
                </AppText>
                <Divider spacing={space.xs} />
                <AppText variant="body">Size {line.sizeLabel}</AppText>
                <AppText variant="body">Quantity {line.quantity}</AppText>
              </View>
            </View>
          </View>
        ))}
        <Divider spacing={space.xs} />
        <View style={styles.reference}>
          <AppText variant="body" color={colors.muted}>
            Order reference
          </AppText>
          <AppText variant="bodyLarge" selectable>
            {receipt.reference}
          </AppText>
        </View>
        <View style={styles.reference}>
          <AppText variant="body" color={colors.muted}>
            Total paid{receipt.isDemo ? ' (sample)' : ''}
          </AppText>
          <AppText variant="bodyLarge">{formatMoney(receipt.subtotal)}</AppText>
        </View>
      </Card>

      <Checkbox
        checked={receipt.addToClosetOptIn}
        disabled={optIn.isPending}
        onChange={(checked) =>
          optIn.mutate(
            { id: receipt.id, optIn: checked },
            { onSuccess: () => showToast(checked ? 'Added to your closet as Ordered' : 'Removed from your closet') },
          )
        }
        label={receipt.lines.length > 1 ? 'Add these pieces to my closet when they arrive' : 'Add this piece to my closet when it arrives'}
      />

      <Button title="Continue shopping" onPress={() => router.navigate('/shop')} />
      <Button title="Contact Nyoni" variant="link" tone="ink" accessibilityRole="link" onPress={() => openExternal(links.contact)} />
    </View>
  );
}

function NotCompleted({ receipt }: { receipt: OrderReceipt }) {
  const failed = receipt.status === 'failed';
  return (
    <View style={styles.body}>
      <View style={styles.center}>
        <View style={[styles.checkCircle, styles.alertCircle]}>
          <Icon name="alert" size={36} color={colors.error} />
        </View>
        <AppText variant="title" align="center" accessibilityRole="header">
          {failed ? "Your payment didn't go through" : 'Checkout was cancelled'}
        </AppText>
        <AppText variant="bodyLarge" color={colors.muted} align="center">
          {failed
            ? 'The store did not confirm this order, so nothing was placed. Your bag is still saved. You can try again or use another payment method.'
            : 'No order was placed. Your bag is still saved.'}
        </AppText>
        <AppText variant="secondary" color={colors.muted} align="center">
          Reference {receipt.reference}
        </AppText>
      </View>
      <Button title="Return to bag" onPress={() => router.dismissTo('/bag')} />
      <Button title="Contact Nyoni" variant="link" tone="ink" accessibilityRole="link" onPress={() => openExternal(links.contact)} />
    </View>
  );
}

const styles = StyleSheet.create({
  demoLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.xs,
    marginBottom: space.lg,
  },
  hairline: {
    flex: 1,
    height: 1,
    backgroundColor: colors.champagne,
  },
  center: {
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
  },
  body: {
    gap: space.md,
  },
  checkCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: colors.champagne,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertCircle: {
    borderColor: colors.error,
  },
  orderCard: {
    padding: space.md,
    gap: space.sm,
  },
  lineRow: {
    flexDirection: 'row',
    gap: space.md,
  },
  lineThumb: {
    width: '42%',
  },
  lineText: {
    flex: 1,
    gap: 2,
    justifyContent: 'center',
  },
  reference: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
