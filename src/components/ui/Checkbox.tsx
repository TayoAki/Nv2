import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/icons/Icon';
import { colors, space } from '@/theme';

import { AppText } from './AppText';

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

export function Checkbox({ checked, onChange, label, disabled = false, style, children }: Props) {
  return (
    <View style={[styles.wrap, style]}>
      <Pressable
        onPress={() => onChange(!checked)}
        disabled={disabled}
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        accessibilityState={{ checked, disabled }}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <View style={[styles.box, checked && styles.boxChecked, disabled && styles.boxDisabled]}>
          {checked ? <Icon name="check" size={18} color={colors.ivory} strokeWidth={2} /> : null}
        </View>
        <AppText variant="body" style={styles.label}>
          {label}
        </AppText>
      </Pressable>
      {children ? <View style={styles.extra}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.xxs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 48,
  },
  pressed: {
    opacity: 0.7,
  },
  box: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  boxChecked: {
    backgroundColor: colors.ink,
  },
  boxDisabled: {
    borderColor: colors.disabledText,
  },
  label: {
    flex: 1,
  },
  extra: {
    paddingLeft: 26 + space.md,
  },
});
