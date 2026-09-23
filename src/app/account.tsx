import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { apiMode, errorMessage, isApiError, isNetworkError, type SignInLinkResult, type SignInResult } from '@/api';
import { COLORS } from '@/api/mock/fixtures';
import { BrandLockup } from '@/components/brand/BrandLockup';
import { Icon } from '@/components/icons/Icon';
import { AppHeader, goBack } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { GarmentImage } from '@/components/media/GarmentImage';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card, Divider } from '@/components/ui/Card';
import { Banner, StateView } from '@/components/ui/Feedback';
import { ListRow } from '@/components/ui/ListRow';
import { TextField } from '@/components/ui/TextField';
import {
  useCompleteDemoSignIn,
  useRequestSignInLink,
  useResolveGuestMigration,
  useSession,
  useSignOut,
} from '@/data/account';
import { confirm } from '@/lib/confirm';
import { pluralize } from '@/lib/format';
import { showToast } from '@/state/toast';
import { colors, space } from '@/theme';

type Mode = 'sign_in' | 'recover';

/** 16 · Account and recovery — /account. No tab bar. */
export default function AccountScreen() {
  const session = useSession();
  const [migration, setMigration] = useState<SignInResult | null>(null);

  const header = <AppHeader left="close" fallbackHref="/shop" showBrand={false} />;

  if (session.isPending) {
    return (
      <Screen header={header} bottomInset>
        <StateView kind="loading" />
      </Screen>
    );
  }

  return (
    <Screen header={header} bottomInset>
      {migration ? (
        <Migration result={migration} onDone={() => setMigration(null)} />
      ) : session.data?.kind === 'account' ? (
        <SignedIn email={session.data.email} />
      ) : (
        <SignInFlow onSignedIn={(result) => (result.guestItemCount > 0 ? setMigration(result) : showToast('Signed in'))} />
      )}
    </Screen>
  );
}

function SignInFlow({ onSignedIn }: { onSignedIn: (result: SignInResult) => void }) {
  const [mode, setMode] = useState<Mode>('sign_in');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<SignInLinkResult | null>(null);
  const request = useRequestSignInLink();
  const complete = useCompleteDemoSignIn();

  const send = () => request.mutate({ email, mode }, { onSuccess: setSent });

  const fieldError = isApiError(request.error) && request.error.code === 'validation' ? request.error.message : null;
  const offline = isNetworkError(request.error) || isNetworkError(complete.error);
  const expired = isApiError(complete.error) && complete.error.code === 'expired';

  if (sent) {
    return (
      <View style={styles.body}>
        <Hero />
        <AppText variant="display" align="center" accessibilityRole="header">
          Check your email
        </AppText>
        <AppText variant="bodyLarge" align="center">
          We sent a {sent.mode === 'recover' ? 'recovery' : 'sign-in'} link to{' '}
          <AppText variant="bodyLarge" style={styles.bold}>
            {sent.sentTo}
          </AppText>
          . It works once and expires in 15 minutes.
        </AppText>
        {expired ? (
          <Banner
            tone="notice"
            title="That link has expired"
            message="Sign-in links expire after 15 minutes. We can send you a new one."
            actionLabel="Send a new link"
            onAction={() => {
              complete.reset();
              send();
            }}
          />
        ) : null}
        {offline ? <Banner tone="offline" message="You're offline. Connect to the internet to finish signing in." /> : null}
        {apiMode === 'demo' ? (
          <Button
            title="Open the link (demo)"
            icon="mail"
            loading={complete.isPending}
            onPress={() => complete.mutate(undefined, { onSuccess: onSignedIn })}
            accessibilityHint="Simulates tapping the link in your email"
          />
        ) : null}
        <Button title="Resend link" variant="outline" loading={request.isPending} onPress={send} />
        <Button
          title="Use a different email"
          variant="link"
          tone="ink"
          onPress={() => {
            setSent(null);
            complete.reset();
            request.reset();
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.body}>
      <Hero />
      <AppText variant="display" align="center" accessibilityRole="header">
        {mode === 'sign_in' ? 'Keep your closet with you.' : 'Recover your account'}
      </AppText>
      <AppText variant="bodyLarge" align="center">
        {mode === 'sign_in'
          ? 'Sign in to save your wardrobe across devices.'
          : "Enter the email on your account. We'll send a link to restore your closet on this device."}
      </AppText>
      <TextField
        icon="mail"
        placeholder="Email address"
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          if (request.isError) request.reset();
        }}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={send}
        error={fieldError}
        accessibilityLabel="Email address"
      />
      {offline ? <Banner tone="offline" message="You're offline. Connect to the internet to get a sign-in link." /> : null}
      {request.isError && !fieldError && !offline ? <Banner tone="error" message={errorMessage(request.error)} /> : null}
      <Button
        title={mode === 'sign_in' ? 'Email me a sign-in link' : 'Email me a recovery link'}
        onPress={send}
        loading={request.isPending}
        disabled={!email.trim()}
      />
      <View style={styles.or}>
        <Divider />
        <AppText variant="secondary" color={colors.muted} style={styles.orText}>
          OR
        </AppText>
      </View>
      {mode === 'sign_in' ? (
        <>
          <Button title="Continue as guest" variant="outline" onPress={() => goBack('/shop')} />
          <Button title="Recover my account" variant="link" onPress={() => setMode('recover')} />
        </>
      ) : (
        <Button title="Back to sign in" variant="outline" onPress={() => setMode('sign_in')} />
      )}
      <View style={styles.private}>
        <Icon name="lock" size={22} color={colors.muted} />
        <AppText variant="secondary" color={colors.muted} align="center">
          Your photos and wardrobe stay private.
        </AppText>
      </View>
    </View>
  );
}

function Hero() {
  return (
    <View style={styles.hero}>
      <BrandLockup height={46} plate />
      <View style={styles.garments} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <GarmentImage kind="jacket" colorHex={COLORS.navy.hex} bare aspectRatio={0.9} illustrationScale={0.95} style={styles.garment} />
        <GarmentImage kind="shirt" colorHex={COLORS.ivory.hex} bare aspectRatio={0.9} illustrationScale={0.72} style={styles.garment} />
      </View>
    </View>
  );
}

function Migration({ result, onDone }: { result: SignInResult; onDone: () => void }) {
  const resolve = useResolveGuestMigration();
  const choose = (choice: 'move' | 'merge' | 'keep_account' | 'skip', message: string) =>
    resolve.mutate(choice, {
      onSuccess: () => {
        showToast(message);
        onDone();
      },
    });

  return (
    <View style={styles.body}>
      <View style={styles.migrationIcon}>
        <Icon name="closet" size={32} color={colors.bronze} />
      </View>
      {result.accountHasData ? (
        <>
          <AppText variant="title" align="center" accessibilityRole="header">
            This account already has a closet
          </AppText>
          <AppText variant="bodyLarge" align="center">
            You signed in on another device before. You also have {pluralize(result.guestItemCount, 'piece')} saved here as a
            guest. Nothing is merged unless you choose to.
          </AppText>
          <Button title="Merge both closets" loading={resolve.isPending} onPress={() => choose('merge', 'Closets merged')} />
          <Button
            title="Keep the account's closet only"
            variant="outline"
            onPress={() => choose('keep_account', "Using your account's closet")}
          />
        </>
      ) : (
        <>
          <AppText variant="title" align="center" accessibilityRole="header">
            Move your closet to your account?
          </AppText>
          <AppText variant="bodyLarge" align="center">
            We found {pluralize(result.guestItemCount, 'piece')} saved on this device as a guest. Move them to{' '}
            {result.session.kind === 'account' ? result.session.email : 'your account'} to see them on your other devices.
          </AppText>
          <Button title="Move to my account" loading={resolve.isPending} onPress={() => choose('move', 'Closet moved to your account')} />
          <Button title="Not now" variant="outline" onPress={() => choose('skip', 'Your guest closet stays on this device')} />
        </>
      )}
    </View>
  );
}

function SignedIn({ email }: { email: string }) {
  const signOut = useSignOut();
  return (
    <View style={styles.body}>
      <Hero />
      <AppText variant="title" align="center" accessibilityRole="header">
        You&apos;re signed in
      </AppText>
      <AppText variant="bodyLarge" align="center" color={colors.muted}>
        {email}
      </AppText>
      <AppText variant="body" align="center">
        Your closet, saved looks and preferences are kept with your account.
      </AppText>
      <Card padded={false}>
        <ListRow icon="sliders" title="Style preferences" onPress={() => router.push('/style-profile')} style={styles.row} />
        <Divider />
        <ListRow icon="shieldCheck" title="Photos and privacy" onPress={() => router.push('/privacy')} style={styles.row} />
      </Card>
      <Button
        title="Sign out"
        variant="outline"
        loading={signOut.isPending}
        onPress={async () => {
          const ok = await confirm({ title: 'Sign out?', message: 'Your closet stays with your account.', confirmLabel: 'Sign out' });
          if (ok) signOut.mutate(undefined, { onSuccess: () => showToast('Signed out') });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: space.md,
    paddingTop: space.xs,
  },
  hero: {
    alignItems: 'center',
    gap: space.md,
  },
  garments: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: space.xs,
    width: '78%',
  },
  garment: {
    flex: 1,
  },
  bold: {
    fontWeight: '600',
  },
  or: {
    justifyContent: 'center',
    marginVertical: space.xs,
  },
  orText: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: colors.ivory,
    paddingHorizontal: space.md,
  },
  private: {
    alignItems: 'center',
    gap: space.xs,
    marginTop: space.md,
  },
  migrationIcon: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.lg,
  },
  row: {
    paddingHorizontal: space.md,
  },
});
