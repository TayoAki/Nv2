import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { apiMode, errorMessage, isApiError, isNetworkError, type SignInLinkResult, type SignInResult, type StoreMemberView } from '@/api';
import { COLORS } from '@/api/mock/fixtures';
import { demoMode } from '@/api/mode';
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
import { useDeleteMemberAccount, useMember, useSignInWithNyoni, useSignOutMember, useStoreStatus } from '@/data/member';
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
/**
 * Beta and store builds: "Sign in with Nyoni" once the store plugin is connected (the server
 * says so), and a guest-only screen until then.
 */
export default function AccountScreen() {
  return demoMode ? <DemoAccountScreen /> : <StoreAccount />;
}

function StoreAccount() {
  const status = useStoreStatus();
  const member = useMember();
  const header = <AppHeader left="close" fallbackHref="/shop" showBrand={false} />;
  if (status.isPending || (status.data?.signIn && member.isPending)) {
    return (
      <Screen header={header} bottomInset>
        <StateView kind="loading" />
      </Screen>
    );
  }
  if (!status.data?.signIn) return <GuestAccount />;
  return (
    <Screen header={header} bottomInset>
      {member.data ? <MemberAccount member={member.data} /> : <NyoniSignIn />}
    </Screen>
  );
}

function NyoniSignIn() {
  const signIn = useSignInWithNyoni();
  const start = () =>
    signIn.mutate(undefined, {
      onSuccess: (result) => {
        if (result === 'signed_in') showToast('Signed in');
      },
    });
  return (
    <View style={styles.guest}>
      <Hero />
      <AppText variant="title" align="center" accessibilityRole="header">
        Sign in with your Nyoni account
      </AppText>
      <AppText variant="body" color={colors.muted} align="center">
        Use the account you shop with on nyonicouture.com. The pieces you’ve bought appear in your closet, and Nyoni Club
        benefits switch on.
      </AppText>
      {signIn.isError ? <Banner tone={isNetworkError(signIn.error) ? 'offline' : 'error'} message={errorMessage(signIn.error)} /> : null}
      <Button title="Sign in with Nyoni" variant="gold" icon="account" loading={signIn.isPending} onPress={start} />
      <AppText variant="caption" color={colors.muted} align="center">
        No account yet? Choose “Register” on the Nyoni page that opens. You can keep using the app as a guest.
      </AppText>
      <Button title="Photos and privacy" variant="outline" icon="shieldCheck" onPress={() => router.replace('/privacy')} />
      <Button title="Continue as a guest" variant="link" tone="ink" onPress={() => goBack('/shop')} />
    </View>
  );
}

function MemberAccount({ member }: { member: StoreMemberView }) {
  const signOut = useSignOutMember();
  const remove = useDeleteMemberAccount();
  const name = [member.member.firstName, member.member.lastName].filter(Boolean).join(' ');
  const pieces = member.orders.reduce((sum, order) => sum + order.items.length, 0);

  const deleteAccount = async () => {
    const ok = await confirm({
      title: 'Delete your Nyoni account?',
      message:
        'Your purchases, Club status and sign-in are removed from the app now, and the Nyoni team erases your nyonicouture.com account. Order records the law requires are kept. This can’t be undone.',
      confirmLabel: 'Delete my account',
      destructive: true,
    });
    if (!ok) return;
    remove.mutate(undefined, {
      onSuccess: () => showToast('Your account is being deleted'),
      onError: (error) => showToast(errorMessage(error), { tone: 'error' }),
    });
  };

  return (
    <View style={styles.guest}>
      <Hero />
      <AppText variant="title" align="center" accessibilityRole="header">
        {name ? `Signed in as ${name}` : 'Signed in'}
      </AppText>
      {member.member.email ? (
        <AppText variant="body" color={colors.muted} align="center">
          {member.member.email}
        </AppText>
      ) : null}
      <Card padded={false}>
        <ListRow
          icon="closet"
          title="Your purchases"
          subtitle={pieces ? `${pluralize(pieces, 'piece')} in your closet` : 'Pieces you buy on nyonicouture.com appear here'}
          onPress={() => router.dismissTo('/closet')}
        />
        <Divider />
        <ListRow
          icon="sparkle"
          title="Nyoni Club"
          subtitle={member.club.active ? `Member${member.club.expiresAt ? ` until ${new Date(member.club.expiresAt).toLocaleDateString()}` : ''}` : 'Not a member'}
        />
      </Card>
      <Button title="Photos and privacy" variant="outline" icon="shieldCheck" onPress={() => router.replace('/privacy')} />
      <Button title="Sign out" variant="outline" loading={signOut.isPending} onPress={() => signOut.mutate(undefined, { onSuccess: () => showToast('Signed out') })} />
      <Button title="Delete my account" variant="link" tone="ink" loading={remove.isPending} onPress={deleteAccount} />
    </View>
  );
}

function DemoAccountScreen() {
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

function GuestAccount() {
  return (
    <Screen header={<AppHeader left="close" fallbackHref="/shop" showBrand={false} />} bottomInset>
      <View style={styles.guest}>
        <Hero />
        <AppText variant="title" align="center" accessibilityRole="header">
          You’re using Nyoni as a guest
        </AppText>
        <AppText variant="body" color={colors.muted} align="center">
          Your closet, looks and measurements are saved on this phone. No account is needed to shop, try on, scan or
          use the stylist.
        </AppText>
        <Card style={styles.guestCard}>
          <View style={styles.guestRow}>
            <Icon name="account" size={20} color={colors.bronze} />
            <AppText variant="body" style={styles.flex}>
              Sign in with your Nyoni account is coming soon. It will add the pieces you’ve bought to your closet and
              keep everything across your devices.
            </AppText>
          </View>
        </Card>
        <Button title="Photos and privacy" variant="outline" icon="shieldCheck" onPress={() => router.replace('/privacy')} />
        <Button title="Continue shopping" variant="link" tone="ink" onPress={() => goBack('/shop')} />
      </View>
    </Screen>
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
  guest: {
    gap: space.md,
    paddingTop: space.md,
  },
  guestCard: {
    gap: space.sm,
  },
  flex: {
    flex: 1,
  },
  guestRow: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
  },
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
