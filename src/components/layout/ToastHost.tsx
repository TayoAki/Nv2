import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icons/Icon';
import { AppText } from '@/components/ui/AppText';
import { useToast } from '@/state/toast';
import { colors, radius, shadow, space } from '@/theme';

/** Short confirmations ("Added to your bag") with an optional action. */
export function ToastHost() {
  const toast = useToast((state) => state.toast);
  const hide = useToast((state) => state.hide);
  const insets = useSafeAreaInsets();
  if (!toast) return null;

  return (
    <View style={[styles.wrap, { bottom: insets.bottom + 96 }]} pointerEvents="box-none">
      <View
        style={[styles.toast, toast.tone === 'error' && styles.error]}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite">
        <Icon name={toast.tone === 'error' ? 'alert' : 'checkCircle'} size={20} color={colors.champagne} />
        <AppText variant="label" color={colors.ivory} style={styles.message}>
          {toast.message}
        </AppText>
        {toast.actionLabel && toast.onAction ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => {
              hide();
              toast.onAction?.();
            }}>
            <AppText variant="label" color={colors.champagne}>
              {toast.actionLabel}
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: space.md,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingHorizontal: space.md + 2,
    minHeight: 48,
    maxWidth: 480,
    ...shadow.raised,
  },
  error: {
    backgroundColor: '#2A1614',
  },
  message: {
    flexShrink: 1,
  },
});
