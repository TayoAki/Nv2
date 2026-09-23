import { StyleSheet, View, type ViewProps } from 'react-native';

import { colors, radius } from '@/theme';

type Props = ViewProps & { padded?: boolean };

export function Card({ padded = true, style, ...rest }: Props) {
  return <View {...rest} style={[styles.card, padded && styles.padded, style]} />;
}

export function Divider({ inset = 0, spacing = 0 }: { inset?: number; spacing?: number }) {
  return <View style={[styles.divider, { marginLeft: inset, marginVertical: spacing }]} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    overflow: 'hidden',
  },
  padded: {
    padding: 16,
  },
  divider: {
    height: 1,
    backgroundColor: colors.hairline,
  },
});
