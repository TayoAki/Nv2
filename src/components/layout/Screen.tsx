import { StatusBar } from 'expo-status-bar';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/icons/Icon';
import { useIsOffline } from '@/hooks/useIsOffline';
import { colors, gutter, space } from '@/theme';

type Props = {
  children: React.ReactNode;
  /** Rendered above the scroll area (usually <AppHeader />). */
  header?: React.ReactNode;
  /** Pinned below the scroll area, for primary actions. */
  footer?: React.ReactNode;
  scroll?: boolean;
  /** Let content run under the status bar (hero photography). */
  edgeToEdge?: boolean;
  /** Add the bottom safe-area inset (screens outside the tab bar). */
  bottomInset?: boolean;
  padded?: boolean;
  background?: string;
  /** Color behind the status bar, e.g. ink when the header is a dark band. */
  topInsetColor?: string;
  statusBarStyle?: 'dark' | 'light';
  contentStyle?: StyleProp<ViewStyle>;
  refreshing?: boolean;
  onRefresh?: () => void;
  scrollRef?: React.Ref<ScrollView>;
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
  onContentSizeChange?: ScrollViewProps['onContentSizeChange'];
};

export function Screen({
  children,
  header,
  footer,
  scroll = true,
  edgeToEdge = false,
  bottomInset = false,
  padded = true,
  background = colors.background,
  topInsetColor,
  statusBarStyle = 'dark',
  contentStyle,
  refreshing,
  onRefresh,
  scrollRef,
  keyboardShouldPersistTaps = 'handled',
  onContentSizeChange,
}: Props) {
  const insets = useSafeAreaInsets();
  const offline = useIsOffline();
  const topPadding = edgeToEdge ? 0 : insets.top;
  const bottomPadding = bottomInset ? Math.max(insets.bottom, space.md) : 0;

  const body = scroll ? (
    <ScrollView
      ref={scrollRef}
      style={styles.flex}
      contentContainerStyle={[
        padded && styles.padded,
        { paddingBottom: (footer ? space.lg : space.xxl) + (footer ? 0 : bottomPadding) },
        contentStyle,
      ]}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      keyboardDismissMode="on-drag"
      onContentSizeChange={onContentSizeChange}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.bronze} />
        ) : undefined
      }>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, padded && styles.padded, contentStyle]}>{children}</View>
  );

  return (
    <View style={[styles.flex, { backgroundColor: background }]}>
      <StatusBar style={statusBarStyle} />
      {topPadding > 0 ? <View style={{ height: topPadding, backgroundColor: topInsetColor ?? background }} /> : null}
      {header}
      {offline ? <OfflineStrip topInset={edgeToEdge ? insets.top : 0} /> : null}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}>
        {body}
        {footer ? (
          <View style={[styles.footer, { paddingBottom: space.md + bottomPadding, backgroundColor: background }]}>
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

function OfflineStrip({ topInset }: { topInset: number }) {
  return (
    <View
      style={[styles.offline, { paddingTop: styles.offline.paddingVertical + topInset }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite">
      <Icon name="wifiOff" size={16} color={colors.ivory} />
      <AppText variant="secondary" color={colors.ivory}>
        {"You're offline. Showing what's saved on this device."}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: gutter,
  },
  footer: {
    paddingHorizontal: gutter,
    paddingTop: space.sm,
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    backgroundColor: colors.ink,
    paddingVertical: space.xs,
    paddingHorizontal: gutter,
  },
});
