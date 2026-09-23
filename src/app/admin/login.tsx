import { Redirect, router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { adminBackend, errorMessage } from '@/api';
import { BrandLockup } from '@/components/brand/BrandLockup';
import { Icon } from '@/components/icons/Icon';
import { Screen } from '@/components/layout/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Banner, StateView } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/TextField';
import { useAdminSession, useAdminSignIn } from '@/data/admin';
import { colors, space } from '@/theme';

/** Store admin sign-in — /admin/login. Web only; staff accounts only. */
export default function AdminLoginScreen() {
  if (Platform.OS !== 'web') return <Redirect href="/shop" />;
  return <AdminLogin />;
}

/** Only return to admin pages after signing in, never to an arbitrary address. */
function safeNext(next: string | undefined): Href {
  return next && /^\/admin(\/[\w-]+)?$/.test(next) && next !== '/admin/login' ? (next as Href) : '/admin';
}

function AdminLogin() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const session = useAdminSession();
  const signIn = useAdminSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (session.data) return <Redirect href={safeNext(next)} />;

  const submit = () => {
    if (!email.trim() || !password) return;
    signIn.mutate({ email, password }, { onSuccess: () => router.replace(safeNext(next)) });
  };

  return (
    <Screen contentStyle={styles.content}>
      {session.isPending ? (
        <StateView kind="loading" />
      ) : (
        <View style={styles.form}>
          <BrandLockup height={44} style={styles.brand} />
          <View style={styles.heading}>
            <AppText variant="title" align="center" accessibilityRole="header">
              Store admin
            </AppText>
            <AppText variant="body" color={colors.muted} align="center">
              Staff sign-in to manage sizes, stock and prices.
            </AppText>
          </View>

          <TextField
            label="Work email"
            icon="mail"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="username"
            accessibilityLabel="Work email"
          />
          <TextField
            label="Password"
            icon="lock"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
            accessibilityLabel="Password"
          />
          {signIn.isError ? <Banner tone="error" message={errorMessage(signIn.error)} /> : null}
          <Button title="Sign in" onPress={submit} loading={signIn.isPending} disabled={!email.trim() || !password} />
          <Button title="Back to the shop" variant="link" tone="muted" onPress={() => router.replace('/shop')} />

          {adminBackend === 'demo' ? (
            <Card style={styles.demo}>
              <View style={styles.demoTitle}>
                <Icon name="info" size={18} color={colors.bronze} />
                <AppText variant="label">Demo staff account</AppText>
              </View>
              <AppText variant="secondary" color={colors.muted} selectable>
                staff@nyonicouture.com · nyoni-admin
              </AppText>
              <AppText variant="caption" color={colors.muted}>
                Works only with the demo data in this build. The live admin signs in against the store&apos;s server.
              </AppText>
            </Card>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    justifyContent: 'center',
    flexGrow: 1,
  },
  form: {
    gap: space.md,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    paddingVertical: space.xl,
  },
  brand: {
    alignSelf: 'center',
  },
  heading: {
    gap: space.xxs,
    marginBottom: space.xs,
  },
  demo: {
    gap: space.xxs,
    marginTop: space.md,
  },
  demoTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
});
