import { Platform, StyleSheet, Switch, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, space } from '@/theme';

import { AppText } from './AppText';

type SwitchProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel: string;
  disabled?: boolean;
};

export function GoldSwitch({ value, onValueChange, accessibilityLabel, disabled }: SwitchProps) {
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      trackColor={{ false: '#D3CCC0', true: colors.champagne }}
      thumbColor={Platform.OS === 'android' ? colors.white : undefined}
      ios_backgroundColor="#D3CCC0"
      // react-native-web renders the thumb from this prop.
      {...(Platform.OS === 'web' ? { activeThumbColor: colors.white } : null)}
    />
  );
}

type RowProps = SwitchProps & {
  label: string;
  description?: string;
  /** Text under the switch, e.g. "Ready to wear". */
  stateLabel?: string;
  labelVariant?: 'body' | 'heading';
  style?: StyleProp<ViewStyle>;
};

export function ToggleRow({
  label,
  description,
  stateLabel,
  labelVariant = 'body',
  style,
  ...switchProps
}: RowProps) {
  return (
    <View style={[styles.row, style]}>
      <View style={styles.text}>
        <AppText variant={labelVariant}>{label}</AppText>
        {description ? (
          <AppText variant="secondary" color={colors.muted}>
            {description}
          </AppText>
        ) : null}
      </View>
      <View style={styles.control}>
        <GoldSwitch {...switchProps} />
        {stateLabel ? (
          <AppText variant="secondary" color={colors.text}>
            {stateLabel}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  control: {
    alignItems: 'flex-end',
    gap: space.xxs,
  },
});
