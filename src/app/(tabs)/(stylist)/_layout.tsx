import { Stack } from 'expo-router';

import { colors } from '@/theme';

export const unstable_settings = {
  anchor: 'stylist',
};

export default function Layout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ivory } }} />;
}
