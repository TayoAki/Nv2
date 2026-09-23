import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from '@/components/icons/Icon';
import { colors, controlHeight, radius, space } from '@/theme';

import { AppText } from './AppText';

export type ButtonVariant = 'primary' | 'gold' | 'outline' | 'link' | 'quiet' | 'destructive';

type Props = {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  trailingIcon?: IconName;
  /** `edge` pins the trailing icon to the right edge, as on "Try it on →". */
  trailingIconPosition?: 'inline' | 'edge';
  shape?: 'rounded' | 'pill';
  size?: 'md' | 'sm';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  /** Link color: bronze by default; `ink` for underlined ink links. */
  tone?: 'bronze' | 'ink' | 'muted';
  accessibilityHint?: string;
  accessibilityLabel?: string;
  /** Use `link` only when the press opens a web page; text-style actions are still buttons. */
  accessibilityRole?: 'button' | 'link';
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const TEXT_VARIANTS: ButtonVariant[] = ['link', 'quiet', 'destructive'];

/**
 * Buttons follow the plan's rules: at least 48pt high, radius 10, and gold buttons always
 * use ink text (never white on pale gold).
 */
export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  trailingIcon,
  trailingIconPosition = 'inline',
  shape = 'rounded',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth,
  tone = 'bronze',
  accessibilityHint,
  accessibilityLabel,
  accessibilityRole = 'button',
  style,
  testID,
}: Props) {
  const isText = TEXT_VARIANTS.includes(variant);
  const inactive = disabled || loading;
  const block = fullWidth ?? !isText;

  const palette = getPalette(variant, inactive && !loading, tone);

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      hitSlop={isText || size === 'sm' ? 8 : undefined}
      style={({ pressed }) => [
        styles.base,
        !isText && {
          minHeight: size === 'md' ? controlHeight.button : controlHeight.min - 4,
          paddingHorizontal: size === 'md' ? space.lg : space.md,
          borderRadius: shape === 'pill' ? radius.pill : radius.control,
          backgroundColor: palette.background,
          borderWidth: variant === 'outline' ? 1 : 0,
          borderColor: palette.border,
        },
        isText && styles.textButton,
        block && styles.block,
        pressed && !inactive && (isText ? styles.pressedText : styles.pressed),
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={palette.text} />
      ) : (
        <View style={styles.content}>
          {icon ? <Icon name={icon} size={size === 'md' ? 20 : 18} color={palette.text} /> : null}
          <AppText
            variant={size === 'md' && !isText ? 'button' : 'label'}
            color={palette.text}
            numberOfLines={2}
            align="center"
            style={variant === 'link' ? styles.underline : null}>
            {title}
          </AppText>
          {trailingIcon && trailingIconPosition === 'inline' ? (
            <Icon name={trailingIcon} size={20} color={palette.text} />
          ) : null}
        </View>
      )}
      {trailingIcon && trailingIconPosition === 'edge' && !loading ? (
        <View style={styles.edgeIcon} pointerEvents="none">
          <Icon name={trailingIcon} size={22} color={palette.text} />
        </View>
      ) : null}
    </Pressable>
  );
}

function getPalette(variant: ButtonVariant, disabled: boolean, tone: 'bronze' | 'ink' | 'muted') {
  if (disabled) {
    switch (variant) {
      case 'primary':
      case 'gold':
        return { background: colors.disabledBg, text: colors.disabledText, border: 'transparent' };
      case 'outline':
        return { background: 'transparent', text: colors.disabledText, border: colors.hairline };
      default:
        return { background: 'transparent', text: colors.disabledText, border: 'transparent' };
    }
  }
  switch (variant) {
    case 'primary':
      return { background: colors.ink, text: colors.ivory, border: 'transparent' };
    case 'gold':
      return { background: colors.champagne, text: colors.ink, border: 'transparent' };
    case 'outline':
      return { background: 'transparent', text: colors.ink, border: colors.ink };
    case 'link':
      return {
        background: 'transparent',
        text: tone === 'ink' ? colors.ink : tone === 'muted' ? colors.muted : colors.bronze,
        border: 'transparent',
      };
    case 'quiet':
      return { background: 'transparent', text: colors.muted, border: 'transparent' };
    case 'destructive':
      return { background: 'transparent', text: colors.error, border: 'transparent' };
  }
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  block: {
    alignSelf: 'stretch',
  },
  textButton: {
    minHeight: 32,
    paddingHorizontal: space.xxs,
    alignSelf: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  edgeIcon: {
    position: 'absolute',
    right: space.lg,
  },
  underline: {
    textDecorationLine: 'underline',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.995 }],
  },
  pressedText: {
    opacity: 0.6,
  },
});
