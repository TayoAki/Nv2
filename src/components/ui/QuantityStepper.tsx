import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icons/Icon';
import { colors, radius } from '@/theme';

import { AppText } from './AppText';

type Props = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  itemName?: string;
};

export function QuantityStepper({ value, onChange, min = 1, max = 10, disabled, itemName }: Props) {
  const canDecrease = !disabled && value > min;
  const canIncrease = !disabled && value < max;
  return (
    <View
      style={styles.container}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={itemName ? `Quantity of ${itemName}` : 'Quantity'}
      accessibilityValue={{ min, max, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment' && canIncrease) onChange(value + 1);
        if (event.nativeEvent.actionName === 'decrement' && canDecrease) onChange(value - 1);
      }}>
      <Pressable
        onPress={() => onChange(value - 1)}
        disabled={!canDecrease}
        accessibilityLabel="Decrease quantity"
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
        <Icon name="minus" size={20} color={canDecrease ? colors.ink : colors.disabledText} />
      </Pressable>
      <View style={styles.value}>
        <AppText variant="bodyLarge">{value}</AppText>
      </View>
      <Pressable
        onPress={() => onChange(value + 1)}
        disabled={!canIncrease}
        accessibilityLabel="Increase quantity"
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
        <Icon name="plus" size={20} color={canIncrease ? colors.ink : colors.disabledText} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    height: 48,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  button: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    backgroundColor: colors.surfaceSunken,
  },
  value: {
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
  },
});
