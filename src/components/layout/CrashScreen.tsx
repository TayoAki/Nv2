import type { ErrorBoundaryProps } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { BrandLockup } from '@/components/brand/BrandLockup';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { track } from '@/lib/analytics';
import { colors, space } from '@/theme';

/** Shown instead of a blank screen when a screen crashes. Nothing the shopper saved is lost. */
export function CrashScreen({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    // The error name only: messages can carry shopper text.
    track('app_crashed', { error: error.name });
  }, [error]);

  return (
    <View style={styles.page} accessibilityRole="alert">
      <BrandLockup />
      <AppText variant="title" style={styles.center}>
        Something went wrong
      </AppText>
      <AppText variant="secondary" color={colors.muted} style={styles.center}>
        This screen stopped working. Your closet, bag and measurements are safe on this phone.
      </AppText>
      <Button title="Try again" variant="gold" onPress={() => void retry()} fullWidth={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.xl,
    backgroundColor: colors.ivory,
  },
  center: {
    textAlign: 'center',
  },
});
