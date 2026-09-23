import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from '@/components/icons/Icon';
import { colors, controlHeight, radius, space } from '@/theme';

import { AppText } from './AppText';

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  /** Strike through the label, e.g. a sold-out size. */
  unavailable?: boolean;
  icon?: IconName;
  /** `ink` for filters (closet), `gold` for preferences (style profile). */
  selectedTone?: 'ink' | 'gold';
  /** `onDark` renders translucent chips for use over photography. */
  surface?: 'light' | 'onDark';
  size?: 'md' | 'lg';
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function Chip({
  label,
  selected = false,
  onPress,
  disabled = false,
  unavailable = false,
  icon,
  selectedTone = 'ink',
  surface = 'light',
  size = 'md',
  accessibilityLabel,
  style,
}: Props) {
  const onDark = surface === 'onDark';
  const background = selected
    ? selectedTone === 'gold'
      ? colors.champagne
      : colors.ink
    : onDark
      ? 'rgba(11, 11, 12, 0.35)'
      : 'transparent';
  const border = selected
    ? background
    : onDark
      ? 'rgba(244, 240, 232, 0.7)'
      : unavailable
        ? colors.hairline
        : colors.border;
  const text = selected
    ? selectedTone === 'gold'
      ? colors.ink
      : colors.ivory
    : onDark
      ? colors.ivory
      : unavailable || disabled
        ? colors.disabledText
        : colors.ink;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      hitSlop={size === 'md' ? 4 : 0}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled: disabled || unavailable }}
      style={({ pressed }) => [
        styles.chip,
        {
          minHeight: size === 'lg' ? controlHeight.min : controlHeight.chip,
          paddingHorizontal: size === 'lg' ? space.md : space.md + 2,
          backgroundColor: background,
          borderColor: border,
        },
        pressed && styles.pressed,
        style,
      ]}>
      {icon ? <Icon name={icon} size={16} color={text} /> : null}
      <AppText
        variant={size === 'lg' ? 'bodyLarge' : 'label'}
        color={text}
        numberOfLines={1}
        style={unavailable ? styles.strike : null}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xxs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  strike: {
    textDecorationLine: 'line-through',
  },
  pressed: {
    opacity: 0.75,
  },
});
