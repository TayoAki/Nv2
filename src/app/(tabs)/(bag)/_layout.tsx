import { Stack } from 'expo-router';

import { colors } from '@/theme';

export const unstable_settings = {
  anchor: 'bag',
};

export default function Layout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ivory } }} />;
}
