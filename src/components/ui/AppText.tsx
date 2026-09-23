import { Text, type TextProps, type TextStyle } from 'react-native';

import { colors, typography, type TypographyVariant } from '@/theme';

type Props = TextProps & {
  variant?: TypographyVariant;
  color?: string;
  align?: TextStyle['textAlign'];
};

const LARGE_VARIANTS: TypographyVariant[] = ['display', 'title', 'price'];

export function AppText({ variant = 'body', color = colors.text, align, style, ...rest }: Props) {
  return (
    <Text
      // Large editorial type still scales with the user's text size, but capped so it reflows.
      maxFontSizeMultiplier={LARGE_VARIANTS.includes(variant) ? 1.35 : undefined}
      {...rest}
      style={[typography[variant], { color }, align ? { textAlign: align } : null, style]}
    />
  );
}
