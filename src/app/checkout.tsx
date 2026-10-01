import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { errorMessage, isApiError, isNetworkError, type CheckoutHandoff } from '@/api';
import { demoMode } from '@/api/mode';
import { BrandLockup } from '@/components/brand/BrandLockup';
import { Icon } from '@/components/icons/Icon';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { GarmentImage } from '@/components/media/GarmentImage';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card, Divider } from '@/components/ui/Card';
import { Banner, ProgressRing, StateView } from '@/components/ui/Feedback';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { useStartStoreCheckout, useStoreCheckoutStatus, useStoreStatus } from '@/data/member';
import { useBag, useCancelCheckout, useCreateCheckoutHandoff, useSubmitDemoCheckout } from '@/data/shop';
import { track } from '@/lib/analytics';
import { formatMoney } from '@/lib/format';
import { openExternal, STORE_HOST, STORE_URL } from '@/lib/links';
import { showToast } from '@/state/toast';
import { colors, gutter, radius, space } from '@/theme';

/**
 * 14 · Store checkout handoff — /checkout
 *
 * Production: the API creates a single-use, short-lived handoff and the store's own secure
 * checkout opens in a browser surface (plan section 08). Payment, tax, shipping and receipts
 * stay with the store; the app never collects card details.
 *
 * Demo build: there is no store connection, so this screen stands in for the store-hosted page
 * using the concept layout. Address fields live only in this screen's memory and are discarded.
 */
/** Beta and store builds finish on the website; demo builds simulate the store's page. */
export default function CheckoutScreen() {
  return demoMode ? <DemoCheckout /> : <FinishOnStore />;
}

function DemoCheckout() {
  const create = useCreateCheckoutHandoff();
  const cancel = useCancelCheckout();
  const [handoff, setHandoff] = useState<CheckoutHandoff | null>(null);

  const { mutate: createHandoff, isIdle } = create;
  useEffect(() => {
    if (isIdle) createHandoff(undefined, { onSuccess: setHandoff });
  }, [isIdle, createHandoff]);

  const hostedUrl = handoff?.url;
  useEffect(() => {
    if (hostedUrl) openHostedCheckout(hostedUrl);
  }, [hostedUrl]);

  const close = () => {
    if (handoff) cancel.mutate(handoff.attemptId);
    if (router.canGoBack()) router.back();
    else router.replace('/bag');
    showToast('Checkout closed. Your bag is saved.');
  };

  return (
    <Screen header={<BrowserBar onClose={close} />} bottomInset background={colors.ivory}>
      {create.isPending || create.isIdle ? (
        <StateView kind="loading" title="Preparing secure checkout" message="Checking prices and stock with the store." />
      ) : create.isError ? (
        <HandoffError error={create.error} onRetry={() => create.reset()} />
      ) : handoff && !handoff.url ? (
        <DemoStoreCheckout handoff={handoff} />
      ) : (
        <StateView kind="loading" title="Opening the store checkout" />
      )}
    </Screen>
  );
}

/** Opens the store-hosted checkout and returns to the order status screen (live mode only). */
async function openHostedCheckout(url: string) {
  const returnUrl = Linking.createURL('/order');
  const result = await WebBrowser.openAuthSessionAsync(url, returnUrl);
  if (result.type === 'success') {
    // A browser return is only navigation; the order screen verifies status with the store.
    const receipt = Linking.parse(result.url).queryParams?.receipt;
    if (typeof receipt === 'string') {
      router.dismissTo(`/order/${receipt}`);
      return;
    }
  }
  router.back();
  showToast('Checkout closed. Your bag is saved.');
}

function BrowserBar({ onClose }: { onClose: () => void }) {
  return (
    <View style={styles.browserBar}>
      <View style={styles.urlPill} accessible accessibilityLabel={`Secure page, ${STORE_HOST}`}>
        <Icon name="lock" size={16} color={colors.ink} />
        <AppText variant="label">{STORE_HOST}</AppText>
      </View>
      <Pressable onPress={onClose} accessibilityRole="button" hitSlop={10} style={styles.close}>
        <AppText variant="bodyLarge" color={colors.bronze}>
          Close
        </AppText>
      </Pressable>
    </View>
  );
}

function HandoffError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (isApiError(error) && (error.code === 'conflict' || error.code === 'validation')) {
    return (
      <StateView
        kind="empty"
        icon="bag"
        title={error.code === 'conflict' ? 'Your bag changed' : 'Your bag is empty'}
        message={errorMessage(error)}
        actionLabel="Back to bag"
        onAction={() => router.back()}
      />
    );
  }
  return (
    <StateView
      kind={isNetworkError(error) ? 'offline' : 'error'}
      title={isNetworkError(error) ? "We can't reach the store" : "Checkout didn't open"}
      message="Your bag is saved. Try again in a moment."
      actionLabel="Try again"
      onAction={onRetry}
    />
  );
}

type Form = {
  email: string;
  firstName: string;
  lastName: string;
  address1: string;
  address2: string;
  city: string;
  region: string;
  postal: string;
  country: string;
};

const REQUIRED: (keyof Form)[] = ['email', 'firstName', 'lastName', 'address1', 'city', 'region', 'postal'];

function DemoStoreCheckout({ handoff }: { handoff: CheckoutHandoff }) {
  const submit = useSubmitDemoCheckout();
  const [form, setForm] = useState<Form>({
    email: '',
    firstName: '',
    lastName: '',
    address1: '',
    address2: '',
    city: '',
    region: '',
    postal: '',
    country: 'United States',
  });
  const [open, setOpen] = useState({ contact: false, delivery: true, payment: false });
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});

  const set = (key: keyof Form) => (value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const continueToPayment = () => {
    const next: Partial<Record<keyof Form, string>> = {};
    for (const key of REQUIRED) if (!form[key].trim()) next[key] = 'Required';
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) next.email = 'Enter a valid email address';
    setErrors(next);
    if (Object.keys(next).length > 0) {
      setOpen({ contact: !!next.email || open.contact, delivery: true, payment: open.payment });
      return;
    }
    submit.mutate(handoff.attemptId, {
      onSuccess: (receipt) => router.dismissTo(`/order/${receipt.id}`),
    });
  };

  const expired = isApiError(submit.error) && (submit.error.code === 'expired' || submit.error.code === 'conflict');

  return (
    <View style={styles.body}>
      <View style={styles.storeHeader}>
        <BrandLockup height={44} plate />
        <AppText variant="title" align="center" accessibilityRole="header">
          Checkout
        </AppText>
        <AppText variant="overline" color={colors.muted} align="center">
          Illustrative checkout layout
        </AppText>
      </View>

      <Card style={styles.summary}>
        {handoff.summary.lines.map((line) => (
          <View key={line.id} style={styles.summaryRow}>
            <GarmentImage kind={line.kind} colorHex={line.color.hex} image={line.image} aspectRatio={1.2} rounded={8} illustrationScale={0.78} style={styles.summaryThumb} />
            <View style={styles.summaryText}>
              <AppText variant="productTitle" numberOfLines={2}>
                {line.title}
              </AppText>
              <AppText variant="secondary" color={colors.muted}>
                {line.sizeLabel}
              </AppText>
              <View style={styles.summaryBottom}>
                <AppText variant="secondary" color={colors.muted}>
                  Qty {line.quantity}
                </AppText>
                <AppText variant="bodyLarge">{formatMoney(line.lineTotal)}</AppText>
              </View>
            </View>
          </View>
        ))}
        <Divider />
        <View style={styles.summaryBottom}>
          <AppText variant="body">Subtotal{handoff.summary.lines.some((l) => l.isIllustrative) ? ' (sample prices)' : ''}</AppText>
          <AppText variant="bodyLarge">{formatMoney(handoff.summary.subtotal)}</AppText>
        </View>
      </Card>

      <Section title="Contact" hint="Email for order updates" open={open.contact} onToggle={() => setOpen({ ...open, contact: !open.contact })}>
        <TextField
          placeholder="Email"
          value={form.email}
          onChangeText={set('email')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          error={errors.email}
        />
      </Section>

      <Section title="Delivery" hint="Where should we ship your order?" open={open.delivery} onToggle={() => setOpen({ ...open, delivery: !open.delivery })}>
        <View style={styles.row}>
          <TextField placeholder="First name" value={form.firstName} onChangeText={set('firstName')} autoComplete="given-name" error={errors.firstName} containerStyle={styles.flex} />
          <TextField placeholder="Last name" value={form.lastName} onChangeText={set('lastName')} autoComplete="family-name" error={errors.lastName} containerStyle={styles.flex} />
        </View>
        <TextField placeholder="Address line 1" value={form.address1} onChangeText={set('address1')} autoComplete="address-line1" error={errors.address1} />
        <TextField placeholder="Address line 2 (optional)" value={form.address2} onChangeText={set('address2')} autoComplete="address-line2" />
        <View style={styles.row}>
          <TextField placeholder="City" value={form.city} onChangeText={set('city')} error={errors.city} containerStyle={styles.flex} />
          <TextField placeholder="State" value={form.region} onChangeText={set('region')} error={errors.region} containerStyle={styles.flex} />
          <TextField placeholder="ZIP" value={form.postal} onChangeText={set('postal')} keyboardType="number-pad" autoComplete="postal-code" error={errors.postal} containerStyle={styles.flex} />
        </View>
        <SelectField
          label="Country"
          value={form.country}
          options={['United States', 'Canada', 'United Kingdom', 'South Africa', 'Other'].map((c) => ({ value: c, label: c }))}
          onChange={set('country')}
        />
        <AppText variant="secondary" color={colors.muted}>
          Shipping and taxes update after your address.
        </AppText>
      </Section>

      <Section title="Payment" hint="Choose a payment method" open={open.payment} onToggle={() => setOpen({ ...open, payment: !open.payment })}>
        <Banner
          tone="info"
          icon="lock"
          message="Payment is completed on the store's secure checkout. This app never asks for card details. In this demo no payment is taken; continuing simulates the store confirming your order."
        />
      </Section>

      {submit.isError ? (
        <Banner
          tone="error"
          title={expired ? 'This checkout session expired' : 'Checkout needs attention'}
          message={errorMessage(submit.error)}
          actionLabel={expired ? 'Start again from your bag' : undefined}
          onAction={expired ? () => router.back() : undefined}
        />
      ) : null}

      <Button title="Continue to payment" variant="gold" trailingIcon="arrowRight" onPress={continueToPayment} loading={submit.isPending} />
      <AppText variant="caption" color={colors.muted} align="center">
        Demo checkout · no payment is taken
      </AppText>
    </View>
  );
}

function Section({
  title,
  hint,
  open,
  onToggle,
  children,
}: {
  title: string;
  hint: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Divider />
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}. ${hint}`}
        style={styles.sectionHeader}>
        <View style={styles.flex}>
          <AppText variant="title" style={styles.sectionTitle}>
            {title}
          </AppText>
          <AppText variant="body" color={colors.muted}>
            {hint}
          </AppText>
        </View>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={26} color={colors.ink} />
      </Pressable>
      {open ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
}

/**
 * Until the store connection (checkout links) is live, orders are placed on nyonicouture.com.
 * Nothing is confirmed here: only the store confirms orders.
 */
/** With the store link live, the whole bag goes to the store's checkout in one step. */
function FinishOnStore() {
  const status = useStoreStatus();
  const [fallback, setFallback] = useState(false);
  if (status.isPending) {
    return (
      <Screen header={<AppHeader left="close" fallbackHref="/bag" title="Checkout" showBrand={false} />} bottomInset>
        <StateView kind="loading" />
      </Screen>
    );
  }
  return status.data?.checkout && !fallback ? <StoreCheckout onFallback={() => setFallback(true)} /> : <OpenEachPiece />;
}

function StoreCheckout({ onFallback }: { onFallback: () => void }) {
  const bag = useBag();
  const start = useStartStoreCheckout();
  const [checkout, setCheckout] = useState<{ ref: string; url: string } | null>(null);
  const ref = checkout?.ref ?? null;
  const order = useStoreCheckoutStatus(ref);
  const lines = bag.data?.lines ?? [];
  const header = <AppHeader left="close" fallbackHref="/bag" title="Checkout" showBrand={false} />;

  const open = () => {
    // The same checkout again: a new one would lose track of an order placed from the first.
    if (checkout) return void openExternal(checkout.url);
    start.mutate(undefined, {
      onSuccess: (next) => {
        setCheckout(next);
        track('checkout_started', { lines: lines.length });
        void openExternal(next.url);
      },
      // Pieces the store link doesn't cover yet: buy them one by one on the website.
      onError: (error) => {
        if (isApiError(error) && error.code === 'unavailable') onFallback();
      },
    });
  };

  const state = order.data?.status;
  if (state === 'paid') {
    return (
      <Screen header={header} bottomInset>
        <View style={styles.store}>
          <BrandLockup height={40} plate />
          <AppText variant="title" align="center" accessibilityRole="header">
            Order confirmed
          </AppText>
          <AppText variant="body" color={colors.muted} align="center">
            nyonicouture.com confirmed order {order.data?.orderNumber ? `#${order.data.orderNumber}` : ''}. Your receipt comes from the store by
            email.
          </AppText>
          <Button title="Continue shopping" variant="gold" onPress={() => router.dismissTo('/shop')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen header={header} bottomInset>
      <View style={styles.store}>
        <BrandLockup height={40} plate />
        <AppText variant="title" align="center" accessibilityRole="header">
          {ref ? 'Finish paying on nyonicouture.com' : 'Checkout on nyonicouture.com'}
        </AppText>
        <AppText variant="body" color={colors.muted} align="center">
          {ref
            ? 'Your bag is in the store’s checkout. Pay there; this screen updates once the store confirms your order.'
            : 'Your bag opens in the Nyoni Couture checkout, with the sizes you chose. Payment, delivery and your receipt are handled by the store.'}
        </AppText>
        {bag.isPending ? (
          <StateView compact kind="loading" />
        ) : lines.length === 0 && !ref ? (
          <StateView compact kind="empty" icon="bag" title="Your bag is empty" actionLabel="Continue shopping" onAction={() => router.dismissTo('/shop')} />
        ) : !ref ? (
          <Card padded={false}>
            {lines.map((line, index) => (
              <View key={line.id}>
                {index > 0 ? <Divider /> : null}
                <View style={styles.storeLine}>
                  <GarmentImage image={line.image} kind={line.kind} colorHex={line.color.hex} contentFit="contain" aspectRatio={0.8} rounded={8} style={styles.storeThumb} />
                  <View style={styles.storeLineText}>
                    <AppText variant="heading" numberOfLines={2}>
                      {line.title}
                    </AppText>
                    <AppText variant="secondary" color={colors.muted}>
                      Size {line.sizeLabel} · Qty {line.quantity} · {formatMoney(line.lineTotal)}
                    </AppText>
                  </View>
                </View>
              </View>
            ))}
          </Card>
        ) : null}
        {start.isError && !(isApiError(start.error) && start.error.code === 'unavailable') ? (
          <Banner tone={isNetworkError(start.error) ? 'offline' : 'error'} message={errorMessage(start.error)} />
        ) : null}
        {state === 'cancelled' || state === 'refunded' ? (
          <Banner tone="notice" title="The store didn’t complete this order" message="Nothing was charged by the app. Your bag is still here." />
        ) : null}
        {ref && (state === 'waiting' || state === 'pending' || !state) ? (
          <View style={styles.waiting}>
            <ProgressRing size={28} />
            <AppText variant="secondary" color={colors.muted} style={styles.flex}>
              {state === 'pending' ? 'The store has your order and is waiting for payment.' : 'Waiting for nyonicouture.com…'}
            </AppText>
          </View>
        ) : null}
        {lines.length > 0 || ref ? (
          <Button
            title={ref ? 'Open the checkout again' : 'Secure checkout'}
            icon="externalLink"
            variant={ref ? 'outline' : 'gold'}
            accessibilityRole="link"
            loading={start.isPending}
            onPress={open}
          />
        ) : null}
        <Button title="Back to bag" variant="link" tone="ink" onPress={() => (router.canGoBack() ? router.back() : router.replace('/bag'))} />
      </View>
    </Screen>
  );
}

/** Until the store link is live: open each piece on the website and buy it there. */
function OpenEachPiece() {
  const bag = useBag();
  const lines = bag.data?.lines ?? [];

  const close = () => (router.canGoBack() ? router.back() : router.replace('/bag'));

  return (
    <Screen header={<AppHeader left="close" fallbackHref="/bag" title="Checkout" showBrand={false} />} bottomInset>
      <View style={styles.store}>
        <BrandLockup height={40} plate />
        <AppText variant="title" align="center" accessibilityRole="header">
          Finish on nyonicouture.com
        </AppText>
        <AppText variant="body" color={colors.muted} align="center">
          Payment happens on the Nyoni Couture website. Open each piece below, choose the same size, and add it to
          your basket there.
        </AppText>
        {bag.isPending ? (
          <StateView compact kind="loading" />
        ) : lines.length === 0 ? (
          <StateView compact kind="empty" icon="bag" title="Your bag is empty" actionLabel="Continue shopping" onAction={() => router.dismissTo('/shop')} />
        ) : (
          <Card padded={false}>
            {lines.map((line, index) => (
              <View key={line.id}>
                {index > 0 ? <Divider /> : null}
                <View style={styles.storeLine}>
                  <GarmentImage image={line.image} kind={line.kind} colorHex={line.color.hex} contentFit="contain" aspectRatio={0.8} rounded={8} style={styles.storeThumb} />
                  <View style={styles.storeLineText}>
                    <AppText variant="heading" numberOfLines={2}>
                      {line.title}
                    </AppText>
                    <AppText variant="secondary" color={colors.muted}>
                      Size {line.sizeLabel} · Qty {line.quantity} · {formatMoney(line.lineTotal)}
                    </AppText>
                    <Button
                      title="Open on nyonicouture.com"
                      icon="externalLink"
                      size="sm"
                      variant="outline"
                      fullWidth={false}
                      accessibilityRole="link"
                      onPress={() => openExternal(line.storeUrl ?? STORE_URL)}
                    />
                  </View>
                </View>
              </View>
            ))}
          </Card>
        )}
        <AppText variant="caption" color={colors.muted} align="center">
          Your bag stays here until you remove the pieces. Orders placed on the website don’t appear in the app yet.
        </AppText>
        <Button title="Back to bag" variant="link" tone="ink" onPress={close} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  store: {
    gap: space.md,
    paddingTop: space.md,
  },
  storeLine: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.sm,
  },
  waiting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  storeThumb: {
    width: 72,
  },
  storeLineText: {
    flex: 1,
    gap: space.xxs,
    alignItems: 'flex-start',
  },
  browserBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: gutter,
    paddingVertical: space.xs,
  },
  urlPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    minHeight: 44,
    borderRadius: radius.control,
    backgroundColor: colors.surfaceSunken,
  },
  close: {
    minHeight: 44,
    justifyContent: 'center',
  },
  body: {
    gap: space.md,
  },
  storeHeader: {
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.sm,
  },
  summary: {
    gap: space.md,
    padding: space.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: space.md,
  },
  summaryThumb: {
    width: '38%',
  },
  summaryText: {
    flex: 1,
    gap: space.xxs,
    justifyContent: 'center',
  },
  summaryBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  section: {
    gap: space.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 64,
  },
  sectionTitle: {
    fontSize: 26,
    lineHeight: 32,
  },
  sectionBody: {
    gap: space.sm,
  },
  row: {
    flexDirection: 'row',
    gap: space.sm,
  },
  flex: {
    flex: 1,
  },
});
