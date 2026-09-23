import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from '@/components/icons/Icon';
import { colors, radius, space } from '@/theme';

import { AppText } from './AppText';

type Props = {
  title: string;
  subtitle?: string;
  /** Trailing value, e.g. "Not added". */
  value?: string;
  icon?: IconName;
  /** Put the leading icon in a soft circle (privacy rows). */
  iconBadge?: boolean;
  onPress?: () => void;
  showChevron?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

export function ListRow({
  title,
  subtitle,
  value,
  icon,
  iconBadge = false,
  onPress,
  showChevron = !!onPress,
  destructive = false,
  disabled = false,
  accessibilityHint,
  style,
}: Props) {
  const tint = destructive ? colors.error : colors.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={[title, subtitle, value].filter(Boolean).join(', ')}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, style]}>
      {icon ? (
        <View style={iconBadge ? styles.iconBadge : styles.icon}>
          <Icon name={icon} size={iconBadge ? 24 : 22} color={destructive ? colors.error : colors.bronze} />
        </View>
      ) : null}
      <View style={styles.text}>
        <AppText variant="body" color={disabled ? colors.disabledText : tint}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="secondary" color={colors.muted}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText variant="secondary" color={colors.muted} numberOfLines={1} style={styles.value}>
          {value}
        </AppText>
      ) : null}
      {showChevron ? <Icon name="chevronRight" size={20} color={colors.ink} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingVertical: space.sm,
  },
  pressed: {
    opacity: 0.6,
  },
  icon: {
    width: 28,
    alignItems: 'center',
  },
  iconBadge: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
  value: {
    maxWidth: '45%',
  },
});
