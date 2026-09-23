import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '@/theme';

const LOGO = require('@/assets/images/nyoni-logo.png');
const LOGO_ASPECT = 938 / 537;

type Props = {
  height?: number;
  /** Draws the mark on an ink plate, as the plan prefers for the original logo. */
  plate?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * The owner-supplied Nyoni Couture logo, used unchanged (transparent margin trimmed only).
 * The screen concepts typeset "NYONI COUTURE" in this position; the handoff notes say to
 * use the original logo for the brand lockup instead. Swap here if that decision changes.
 */
export function BrandLockup({ height = 40, plate = false, style }: Props) {
  return (
    <View
      style={[plate && styles.plate, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Nyoni Couture">
      <Image
        source={LOGO}
        style={{ height, width: height * LOGO_ASPECT }}
        contentFit="contain"
        accessible={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  plate: {
    backgroundColor: colors.ink,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
