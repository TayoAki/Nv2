import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { space } from '@/theme';

type Props<T> = {
  items: T[];
  keyOf: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  gap?: number;
  rowGap?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityRole?: 'radiogroup' | 'list';
};

/** Two equal columns; an odd last item keeps its column width instead of stretching. */
export function TwoColumnGrid<T>({
  items,
  keyOf,
  renderItem,
  gap = space.md,
  rowGap = space.lg,
  style,
  accessibilityRole,
}: Props<T>) {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <View style={[{ gap: rowGap }, style]} accessibilityRole={accessibilityRole}>
      {rows.map((row) => (
        <View key={row.map(keyOf).join('|')} style={[styles.row, { gap }]}>
          {row.map((item) => (
            <View key={keyOf(item)} style={styles.cell}>
              {renderItem(item)}
            </View>
          ))}
          {row.length === 1 ? <View style={styles.cell} /> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    minWidth: 0,
  },
});
