import { Redirect } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { errorMessage, isApiError, isNetworkError, type AdminStoreLink } from '@/api';
import { AdminGate } from '@/components/admin/AdminGate';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, Divider } from '@/components/ui/Card';
import { StateView } from '@/components/ui/Feedback';
import { useAdminStoreLink, useMarkDeletionDone } from '@/data/admin';
import { confirm } from '@/lib/confirm';
import { showToast } from '@/state/toast';
import { colors, space } from '@/theme';

/** Store admin · store link — /admin/store. The Nyoni App Bridge plugin and webhooks at a glance. */
export default function AdminStoreScreen() {
  return (
    <AdminGate>
      <StoreLink />
    </AdminGate>
  );
}

function StoreLink() {
  const link = useAdminStoreLink();
  if (isApiError(link.error) && link.error.code === 'unauthorized') return <Redirect href="/admin/login" />;

  return (
    <Screen header={<AppHeader left="back" fallbackHref="/admin" title="Store link" />}>
      <View style={styles.body}>
        {link.isPending ? (
          <StateView kind="loading" title="Loading the store link" />
        ) : link.isError ? (
          <StateView kind={isNetworkError(link.error) ? 'offline' : 'error'} message={errorMessage(link.error)} actionLabel="Try again" onAction={() => link.refetch()} />
        ) : (
          <Overview data={link.data} />
        )}
      </View>
    </Screen>
  );
}

function Overview({ data }: { data: AdminStoreLink }) {
  const mark = useMarkDeletionDone();
  const { configured, counts } = data;

  const done = async (id: string, customerId: number) => {
    const ok = await confirm({
      title: 'Account erased on the store?',
      message: `Confirm customer ${customerId}’s nyonicouture.com account has been erased (WordPress → Tools → Erase Personal Data).`,
      confirmLabel: 'Mark erased',
    });
    if (ok) mark.mutate(id, { onError: (err) => showToast(errorMessage(err), { tone: 'error' }) });
  };

  return (
    <>
      <Card style={styles.card}>
        <AppText variant="heading">Connection</AppText>
        <Row label="Plugin (bridge secret)" ok={configured.bridge} />
        <Row label="WooCommerce webhooks" ok={configured.webhooks} />
        <AppText variant="caption" color={colors.muted}>
          Secrets are set in Railway (api service → Variables): NYONI_BRIDGE_SECRET and WOO_WEBHOOK_SECRET. Checkout uses{' '}
          {configured.checkoutMode === 'signed' ? 'the plugin’s signed links' : 'WooCommerce checkout links'}.
        </AppText>
      </Card>

      <Card style={styles.card}>
        <AppText variant="heading">Received from the store</AppText>
        <AppText variant="body">
          {counts.products} products · {counts.variations} sizes · {counts.orders} orders · {counts.members} signed-in members
        </AppText>
        {data.recentEvents.length === 0 ? (
          <AppText variant="secondary" color={colors.muted}>
            Nothing yet. Use “Test connection” and “Send catalogue to app” in WooCommerce → Nyoni App.
          </AppText>
        ) : (
          data.recentEvents.slice(0, 8).map((event, index) => (
            <AppText key={`${event.receivedAt}-${index}`} variant="caption" color={colors.muted}>
              {new Date(event.receivedAt).toLocaleString()} · {event.type}
            </AppText>
          ))
        )}
      </Card>

      <Card padded={false}>
        <View style={styles.padded}>
          <AppText variant="heading">Accounts to erase on the store</AppText>
          <AppText variant="secondary" color={colors.muted}>
            Shoppers who chose “Delete my account” in the app. Their app data is already gone; erase the store account within 30 days.
          </AppText>
        </View>
        {data.pendingDeletions.length === 0 ? (
          <View style={styles.padded}>
            <Badge label="None waiting" tone="success" />
          </View>
        ) : (
          data.pendingDeletions.map((request) => (
            <View key={request.id}>
              <Divider />
              <View style={[styles.padded, styles.deletion]}>
                <View style={styles.flex}>
                  <AppText variant="body">Customer {request.customerId}</AppText>
                  <AppText variant="caption" color={colors.muted}>
                    Requested {new Date(request.requestedAt).toLocaleString()}
                  </AppText>
                </View>
                <Button title="Mark erased" size="sm" variant="outline" fullWidth={false} loading={mark.isPending} onPress={() => done(request.id, request.customerId)} />
              </View>
            </View>
          ))
        )}
      </Card>
    </>
  );
}

function Row({ label, ok }: { label: string; ok: boolean }) {
  return (
    <View style={styles.deletion}>
      <AppText variant="body" style={styles.flex}>
        {label}
      </AppText>
      <Badge label={ok ? 'Set' : 'Not set'} tone={ok ? 'success' : 'notice'} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: space.md,
    paddingTop: space.sm,
  },
  card: {
    gap: space.xs,
  },
  padded: {
    padding: space.md,
    gap: space.xs,
  },
  deletion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  flex: {
    flex: 1,
  },
});
