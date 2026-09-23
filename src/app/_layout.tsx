import { QueryClientProvider } from '@tanstack/react-query';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { getDb } from '@/api/mock/db';
import { HeaderMenuSheet } from '@/components/layout/HeaderMenuSheet';
import { ToastHost } from '@/components/layout/ToastHost';
import { queryClient, wireQueryEnvironment } from '@/data/queryClient';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export const unstable_settings = {
  anchor: '(tabs)',
};

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.bronze,
    background: colors.ivory,
    card: colors.ivory,
    text: colors.ink,
    border: colors.hairline,
  },
};

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    wireQueryEnvironment();
    // Load saved demo data before the first screen renders.
    getDb().finally(() => {
      setReady(true);
      SplashScreen.hideAsync().catch(() => undefined);
    });
  }, []);

  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={navigationTheme}>
        <View style={styles.page}>
          <View style={styles.app}>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.ivory },
              }}>
              <Stack.Screen name="(tabs)" />
              {/* Focused steps without the tab bar. */}
              <Stack.Screen name="photo" />
              <Stack.Screen name="closet/import" />
              <Stack.Screen name="privacy" />
              <Stack.Screen name="checkout" options={{ presentation: 'modal' }} />
              <Stack.Screen name="account" options={{ presentation: 'modal' }} />
            </Stack>
            <ToastHost />
          </View>
        </View>
        <HeaderMenuSheet />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: Platform.OS === 'web' ? '#E7E1D6' : colors.ivory,
  },
  // On web, keep the phone layout centered instead of stretching across a desktop window.
  app: {
    flex: 1,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 480 : undefined,
    alignSelf: 'center',
    backgroundColor: colors.ivory,
    overflow: 'hidden',
  },
});
