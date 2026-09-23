import { Tabs } from 'expo-router';

import { TabBar } from '@/components/layout/TabBar';
import { colors } from '@/theme';

export const unstable_settings = {
  anchor: '(shop)',
};

/** Bottom tabs: Shop / Closet / Stylist / Bag (plan section 04). */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.ivory } }}>
      <Tabs.Screen name="(shop)" options={{ title: 'Shop' }} />
      <Tabs.Screen name="(closet)" options={{ title: 'Closet' }} />
      <Tabs.Screen name="(stylist)" options={{ title: 'Stylist' }} />
      <Tabs.Screen name="(bag)" options={{ title: 'Bag' }} />
    </Tabs>
  );
}
