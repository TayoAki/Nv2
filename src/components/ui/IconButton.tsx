import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from '@/components/icons/Icon';
import { colors, radius } from '@/theme';

type Props = {
  icon: IconName;
  accessibilityLabel: string;
  onPress?: () => void;
  /** `plain` icon only; `outline` thin ring; `gold`/`ink` filled circles. */
  variant?: 'plain' | 'outline' | 'gold' | 'ink';
  size?: number;
  iconSize?: number;
  color?: string;
  disabled?: boolean;
  selected?: boolean;
  fill?: string;
  style?: StyleProp<ViewStyle>;
};

export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  variant = 'plain',
  size = 44,
  iconSize = 24,
  color,
  disabled = false,
  selected,
  fill,
  style,
}: Props) {
  const iconColor =
    color ?? (variant === 'ink' ? colors.ivory : disabled ? colors.disabledText : colors.ink);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, selected }}
      hitSlop={Math.max(0, (48 - size) / 2)}
      style={({ pressed }) => [
        styles.base,
        { width: size, height: size, borderRadius: radius.pill },
        variant === 'outline' && styles.outline,
        variant === 'gold' && styles.gold,
        variant === 'ink' && styles.ink,
        pressed && !disabled && styles.pressed,
        style,
      ]}>
      <Icon name={icon} size={iconSize} color={iconColor} fill={fill} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  outline: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  gold: {
    backgroundColor: colors.champagne,
  },
  ink: {
    backgroundColor: colors.ink,
  },
  pressed: {
    opacity: 0.6,
  },
});
