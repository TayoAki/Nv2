import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from '@/components/icons/Icon';
import { colors, radius, space } from '@/theme';

import { AppText } from './AppText';

export type BadgeTone = 'overlay' | 'neutral' | 'ai' | 'success' | 'notice' | 'error' | 'dark';

type Props = {
  label: string;
  tone?: BadgeTone;
  icon?: IconName;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
};

const TONES: Record<BadgeTone, { bg: string; fg: string; border?: string }> = {
  /** Translucent ivory pill used over garment photography ("Owned", "Try-on eligible"). */
  overlay: { bg: 'rgba(251, 249, 245, 0.92)', fg: colors.ink },
  neutral: { bg: colors.surfaceSunken, fg: colors.muted },
  /** "AI preview": gold with ink text. */
  ai: { bg: colors.champagne, fg: colors.ink },
  success: { bg: colors.success, fg: colors.white },
  notice: { bg: colors.noticeBg, fg: colors.bronze },
  error: { bg: colors.errorBg, fg: colors.error },
  dark: { bg: 'rgba(11, 11, 12, 0.72)', fg: colors.ivory },
};

export function Badge({ label, tone = 'neutral', icon, size = 'sm', style }: Props) {
  const palette = TONES[tone];
  return (
    <View
      style={[
        styles.badge,
        size === 'md' && styles.md,
        { backgroundColor: palette.bg },
        style,
      ]}>
      {icon ? <Icon name={icon} size={size === 'md' ? 18 : 15} color={palette.fg} /> : null}
      <AppText variant={size === 'md' ? 'label' : 'caption'} color={palette.fg} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.xxs + 1,
    paddingHorizontal: space.sm - 2,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  md: {
    paddingHorizontal: space.md,
    paddingVertical: 8,
  },
});
