import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { errorMessage, isApiError, isNetworkError, type CheckoutHandoff } from '@/api';
import { BrandLockup } from '@/components/brand/BrandLockup';
import { Icon } from '@/components/icons/Icon';
import { Screen } from '@/components/layout/Screen';
import { GarmentImage } from '@/components/media/GarmentImage';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card, Divider } from '@/components/ui/Card';
import { Banner, StateView } from '@/components/ui/Feedback';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { useCancelCheckout, useCreateCheckoutHandoff, useSubmitDemoCheckout } from '@/data/shop';
import { formatMoney } from '@/lib/format';
import { STORE_HOST } from '@/lib/links';
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
export default function CheckoutScreen() {
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

const styles = StyleSheet.create({
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
