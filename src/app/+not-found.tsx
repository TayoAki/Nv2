import { router } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { StateView } from '@/components/ui/Feedback';

export default function NotFoundScreen() {
  return (
    <Screen header={<AppHeader />} bottomInset>
      <StateView
        kind="empty"
        icon="search"
        title="This page doesn't exist"
        message="The link may be out of date."
        actionLabel="Go to the shop"
        onAction={() => router.replace('/shop')}
      />
    </Screen>
  );
}
