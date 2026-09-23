import { router, type Href } from 'expo-router';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { BrandLockup } from '@/components/brand/BrandLockup';
import type { IconName } from '@/components/icons/Icon';
import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/IconButton';
import { useHeaderMenu } from '@/state/headerMenu';
import { colors, gutter, space } from '@/theme';

type Props = {
  left?: 'back' | 'close' | 'none' | React.ReactNode;
  right?: React.ReactNode;
  /** Plain title in place of the brand lockup (focused flows such as import review). */
  title?: string;
  subtitle?: string;
  showBrand?: boolean;
  tone?: 'light' | 'dark';
  onBack?: () => void;
  /** Where "back" goes when the screen was opened directly (deep link, reload). */
  fallbackHref?: Href;
  style?: StyleProp<ViewStyle>;
};

export function goBack(fallbackHref: Href = '/shop') {
  if (router.canGoBack()) router.back();
  else router.replace(fallbackHref);
}

export function AppHeader({
  left = 'none',
  right,
  title,
  subtitle,
  showBrand = true,
  tone = 'light',
  onBack,
  fallbackHref,
  style,
}: Props) {
  const dark = tone === 'dark';
  const iconColor = dark ? colors.ivory : colors.ink;

  let leftNode: React.ReactNode = null;
  if (left === 'back' || left === 'close') {
    leftNode = (
      <IconButton
        icon={left === 'back' ? 'back' : 'close'}
        accessibilityLabel={left === 'back' ? 'Back' : 'Close'}
        color={iconColor}
        iconSize={26}
        onPress={onBack ?? (() => goBack(fallbackHref))}
      />
    );
  } else if (left !== 'none') {
    leftNode = left;
  }

  return (
    <View style={[styles.header, dark && styles.dark, style]}>
      <View style={styles.side}>{leftNode}</View>
      <View style={styles.center} pointerEvents="box-none">
        {title ? (
          <View style={styles.titleBlock}>
            <AppText variant="title" align="center" accessibilityRole="header" numberOfLines={2}>
              {title}
            </AppText>
            {subtitle ? (
              <AppText variant="secondary" color={colors.muted} align="center">
                {subtitle}
              </AppText>
            ) : null}
          </View>
        ) : showBrand ? (
          <BrandLockup height={dark ? 40 : 44} />
        ) : null}
      </View>
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

/** Opens the header menu (account, style preferences, photos and privacy). */
export function HeaderMenuButton({
  icon = 'account',
  tone = 'light',
}: {
  icon?: Extract<IconName, 'account' | 'settings' | 'menu'>;
  tone?: 'light' | 'dark';
}) {
  const show = useHeaderMenu((state) => state.show);
  return (
    <IconButton
      icon={icon}
      accessibilityLabel={icon === 'settings' ? 'Settings and account' : 'Account and settings'}
      color={tone === 'dark' ? colors.ivory : colors.ink}
      iconSize={26}
      onPress={show}
    />
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 60,
    paddingHorizontal: gutter - 10,
    paddingVertical: space.xxs,
  },
  dark: {
    backgroundColor: colors.ink,
  },
  side: {
    width: 56,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1,
  },
  right: {
    justifyContent: 'flex-end',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    gap: space.xxs,
    paddingVertical: space.xs,
  },
});
