import { usePathname, router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icons/Icon';
import { AppText } from '@/components/ui/AppText';
import { useBag } from '@/data/shop';
import { useTryOnJob } from '@/data/tryOn';
import { useTryOnSession } from '@/state/tryOnSession';
import { colors, radius, shadow, space } from '@/theme';

const TABS: Record<string, { label: string; icon: IconName }> = {
  '(shop)': { label: 'Shop', icon: 'home' },
  '(closet)': { label: 'Closet', icon: 'closet' },
  '(stylist)': { label: 'Stylist', icon: 'stylist' },
  '(bag)': { label: 'Bag', icon: 'bag' },
};

/** Bottom navigation: exactly Shop / Closet / Stylist / Bag, thin icons, gold active indicator. */
export function TabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const { data: bag } = useBag();
  const bagCount = bag?.itemCount ?? 0;

  return (
    <View style={styles.wrap}>
      <PreviewReadyPill />
      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.xs) }]} accessibilityRole="tablist">
        {state.routes.map((route, index) => {
          const tab = TABS[route.name];
          if (!tab) return null;
          const focused = state.index === index;
          const { options } = descriptors[route.key];
          const color = focused ? colors.bronze : colors.ink;
          const badge = route.name === '(bag)' && bagCount > 0 ? bagCount : null;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={badge ? `${tab.label}, ${badge} item${badge === 1 ? '' : 's'}` : tab.label}
              testID={options.tabBarButtonTestID}
              style={({ pressed }) => [styles.tab, pressed && styles.pressed]}>
              <View>
                <Icon name={tab.icon} size={26} color={color} strokeWidth={focused ? 1.7 : 1.4} />
                {badge ? (
                  <View style={styles.badge}>
                    <AppText variant="caption" color={colors.ivory} style={styles.badgeText}>
                      {badge > 9 ? '9+' : badge}
                    </AppText>
                  </View>
                ) : null}
              </View>
              <AppText variant="label" color={color} style={styles.label}>
                {tab.label}
              </AppText>
              <View style={[styles.indicator, focused && styles.indicatorActive]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Lets shoppers keep browsing while a preview is created (plan section 05), then brings
 * them back when it is ready or if it failed.
 */
function PreviewReadyPill() {
  const pathname = usePathname();
  const unseenJobId = useTryOnSession((s) => s.unseenJobId);
  const markSeen = useTryOnSession((s) => s.markSeen);
  const { data: job } = useTryOnJob(unseenJobId);

  if (!job || !unseenJobId) return null;
  const onJobScreens = pathname.startsWith(`/jobs/${job.id}`) || (!!job.lookId && pathname.startsWith(`/preview/${job.lookId}`));
  if (onJobScreens) return null;

  const ready = job.state === 'succeeded' && !!job.lookId;
  const failed = job.state === 'failed' || job.state === 'expired';
  if (!ready && !failed) return null;

  const open = () => {
    markSeen(job.id);
    if (ready) router.push(`/preview/${job.lookId}`);
    else router.push(`/jobs/${job.id}`);
  };

  return (
    <View style={styles.pillWrap} pointerEvents="box-none">
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={ready ? 'Your preview is ready. View it.' : "Your preview couldn't be created. See details."}
        style={({ pressed }) => [styles.pill, pressed && styles.pressed]}>
        <Icon name={ready ? 'sparkle' : 'alert'} size={18} color={colors.champagne} />
        <AppText variant="label" color={colors.ivory} style={styles.pillText} numberOfLines={1}>
          {ready ? 'Your preview is ready' : "Your preview couldn't be created"}
        </AppText>
        <AppText variant="label" color={colors.champagne}>
          {ready ? 'View' : 'Details'}
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.ivory,
  },
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    backgroundColor: colors.ivory,
    paddingTop: space.xs,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    gap: 2,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    fontSize: 13,
  },
  indicator: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 2,
  },
  indicatorActive: {
    backgroundColor: colors.champagne,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -9,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.bronze,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
  },
  pillWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '100%',
    alignItems: 'center',
    paddingBottom: space.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    backgroundColor: colors.ink,
    paddingHorizontal: space.md,
    minHeight: 48,
    borderRadius: radius.pill,
    maxWidth: '92%',
    ...shadow.raised,
  },
  pillText: {
    flexShrink: 1,
  },
});
