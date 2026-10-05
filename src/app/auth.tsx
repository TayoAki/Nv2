import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { errorMessage } from '@/api';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { Banner, StateView } from '@/components/ui/Feedback';
import { useFinishNyoniSignIn } from '@/data/member';
import { space } from '@/theme';

// On the web the store's login opens in a pop-up; this hands its result back and closes it.
const popup = WebBrowser.maybeCompleteAuthSession();

/**
 * Auth return — /auth. Where nyonicouture.com sends the shopper after signing in
 * (nyonicouture://auth in the app, /auth on the web), with `token` and `state`.
 */
export default function AuthReturnScreen() {
  const { token, state } = useLocalSearchParams<{ token?: string; state?: string }>();
  const finish = useFinishNyoniSignIn();
  const started = useRef(false);

  useEffect(() => {
    if (popup.type === 'success' || started.current || !token || !state) return;
    started.current = true;
    const params = new URLSearchParams({ token, state });
    finish.mutate(`nyonicouture://auth?${params.toString()}`, { onSuccess: () => router.replace('/account') });
  }, [token, state, finish]);

  return (
    <Screen header={<AppHeader left="close" fallbackHref="/account" showBrand={false} />} bottomInset>
      <View style={styles.body}>
        {finish.isError || !token || !state ? (
          <>
            <Banner tone="error" title="Sign-in didn’t finish" message={finish.isError ? errorMessage(finish.error) : 'The sign-in link is incomplete.'} />
            <Button title="Try again" variant="gold" onPress={() => router.replace('/account')} />
          </>
        ) : (
          <StateView kind="loading" title="Signing you in…" />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: space.md,
    paddingTop: space.lg,
  },
});
