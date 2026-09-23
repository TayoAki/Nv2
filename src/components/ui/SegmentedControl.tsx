import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, controlHeight, radius } from '@/theme';

import { AppText } from './AppText';

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/** Gold selected segment with ink text, on a sunken ivory track. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
  accessibilityLabel,
}: Props<T>) {
  return (
    <View style={[styles.track, style]} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && styles.selected]}>
            <AppText variant="label" color={selected ? colors.ink : colors.text} numberOfLines={1}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.pill,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  segment: {
    flex: 1,
    minHeight: controlHeight.min - 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: 12,
  },
  selected: {
    backgroundColor: colors.champagne,
  },
});
