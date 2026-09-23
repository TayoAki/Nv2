import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { Icon, type IconName } from '@/components/icons/Icon';
import { colors, radius, space } from '@/theme';

import { AppText } from './AppText';
import { Button } from './Button';
import { IconButton } from './IconButton';

/** The native animated module doesn't exist on web. */
const useNativeDriver = Platform.OS !== 'web';

/* -------------------------------------------------------------------------------------------------
 * StateView: loading / empty / error / offline states that fill a screen or section.
 * -----------------------------------------------------------------------------------------------*/

export type StateKind = 'loading' | 'empty' | 'error' | 'offline';

type StateViewProps = {
  kind: StateKind;
  title?: string;
  message?: string;
  icon?: IconName;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

const DEFAULTS: Record<StateKind, { icon: IconName; title: string; message?: string }> = {
  loading: { icon: 'clock', title: 'Loading' },
  empty: { icon: 'info', title: 'Nothing here yet' },
  error: {
    icon: 'alert',
    title: 'Something went wrong',
    message: 'Please try again. If it keeps happening, contact Nyoni.',
  },
  offline: {
    icon: 'wifiOff',
    title: "You're offline",
    message: 'Check your connection and try again.',
  },
};

export function StateView({
  kind,
  title,
  message,
  icon,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  compact = false,
  style,
}: StateViewProps) {
  const defaults = DEFAULTS[kind];
  return (
    <View
      style={[styles.state, compact && styles.stateCompact, style]}
      accessibilityLiveRegion="polite"
      accessibilityRole={kind === 'error' || kind === 'offline' ? 'alert' : undefined}>
      {kind === 'loading' ? (
        <ActivityIndicator color={colors.bronze} size="large" />
      ) : (
        <View style={styles.stateIcon}>
          <Icon name={icon ?? defaults.icon} size={28} color={colors.bronze} />
        </View>
      )}
      <View style={styles.stateText}>
        {kind !== 'loading' || title ? (
          <AppText variant="heading" align="center">
            {title ?? defaults.title}
          </AppText>
        ) : null}
        {(message ?? defaults.message) ? (
          <AppText variant="body" color={colors.muted} align="center">
            {message ?? defaults.message}
          </AppText>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <Button
          title={actionLabel}
          onPress={onAction}
          variant={kind === 'empty' ? 'gold' : 'primary'}
          fullWidth={false}
          style={styles.stateAction}
        />
      ) : null}
      {secondaryLabel && onSecondary ? (
        <Button title={secondaryLabel} onPress={onSecondary} variant="link" />
      ) : null}
    </View>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Banner: inline notice inside a screen (price changed, offline cache, partial failure…).
 * -----------------------------------------------------------------------------------------------*/

type BannerTone = 'info' | 'notice' | 'error' | 'success' | 'offline';

const BANNER_TONES: Record<BannerTone, { bg: string; fg: string; icon: IconName }> = {
  info: { bg: colors.surfaceSunken, fg: colors.ink, icon: 'info' },
  notice: { bg: colors.noticeBg, fg: colors.ink, icon: 'alert' },
  error: { bg: colors.errorBg, fg: colors.error, icon: 'alert' },
  success: { bg: colors.successBg, fg: colors.success, icon: 'checkCircle' },
  offline: { bg: colors.surfaceSunken, fg: colors.ink, icon: 'wifiOff' },
};

type BannerProps = {
  tone?: BannerTone;
  title?: string;
  message: string;
  icon?: IconName;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function Banner({
  tone = 'info',
  title,
  message,
  icon,
  actionLabel,
  onAction,
  onDismiss,
  style,
}: BannerProps) {
  const palette = BANNER_TONES[tone];
  return (
    <View
      style={[styles.banner, { backgroundColor: palette.bg }, style]}
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion="polite">
      <Icon name={icon ?? palette.icon} size={20} color={palette.fg} />
      <View style={styles.bannerText}>
        {title ? (
          <AppText variant="bodyStrong" color={palette.fg}>
            {title}
          </AppText>
        ) : null}
        <AppText variant="secondary" color={tone === 'error' ? palette.fg : colors.ink}>
          {message}
        </AppText>
        {actionLabel && onAction ? (
          <Button
            title={actionLabel}
            onPress={onAction}
            variant="link"
            tone="ink"
            style={styles.bannerAction}
          />
        ) : null}
      </View>
      {onDismiss ? (
        <IconButton icon="close" accessibilityLabel="Dismiss" size={32} iconSize={18} onPress={onDismiss} style={styles.bannerDismiss} />
      ) : null}
    </View>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Skeleton: placeholder blocks while content loads. Pulses unless reduced motion is on.
 * -----------------------------------------------------------------------------------------------*/

type SkeletonProps = {
  width?: DimensionValue;
  height?: DimensionValue;
  aspectRatio?: number;
  rounded?: number;
  style?: StyleProp<ViewStyle>;
};

export function Skeleton({ width = '100%', height, aspectRatio, rounded = radius.card, style }: SkeletonProps) {
  const reduceMotion = useReducedMotion();
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.45, duration: 700, useNativeDriver }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduceMotion]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width, height, aspectRatio, borderRadius: rounded, backgroundColor: colors.media, opacity },
        style,
      ]}
    />
  );
}

/* -------------------------------------------------------------------------------------------------
 * ProgressRing: indeterminate spinner. Never shows invented percentages (plan section 05).
 * -----------------------------------------------------------------------------------------------*/

export function ProgressRing({ size = 72, active = true }: { size?: number; active?: boolean }) {
  const reduceMotion = useReducedMotion();
  const [rotation] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!active || reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [active, reduceMotion, rotation]);

  const stroke = 4;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const spin = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View
      style={{ width: size, height: size, transform: [{ rotate: spin }] }}
      accessibilityRole="progressbar"
      accessibilityLabel="Creating preview"
      accessibilityState={{ busy: active }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.hairline} strokeWidth={stroke} fill="none" />
        {active ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={colors.champagne}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${circumference * 0.22} ${circumference}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  state: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.xxl,
    gap: space.md,
  },
  stateCompact: {
    flexGrow: 0,
    paddingVertical: space.xl,
  },
  stateIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateText: {
    gap: space.xs,
    maxWidth: 340,
  },
  stateAction: {
    minWidth: 200,
    marginTop: space.xs,
  },
  banner: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.card,
    alignItems: 'flex-start',
  },
  bannerText: {
    flex: 1,
    gap: 2,
  },
  bannerAction: {
    alignSelf: 'flex-start',
    marginTop: space.xxs,
  },
  bannerDismiss: {
    marginTop: -space.xxs,
    marginRight: -space.xxs,
  },
});
