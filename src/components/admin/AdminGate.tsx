import { Redirect, usePathname } from 'expo-router';
import { Platform } from 'react-native';

import { isNetworkError } from '@/api';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { StateView } from '@/components/ui/Feedback';
import { useAdminSession } from '@/data/admin';

/**
 * The store admin is a staff tool for the web only. On iOS and Android it redirects to the
 * shop; on the web it asks for a staff sign-in first.
 */
export function AdminGate({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== 'web') return <Redirect href="/shop" />;
  return <SessionGate>{children}</SessionGate>;
}

function SessionGate({ children }: { children: React.ReactNode }) {
  const session = useAdminSession();
  const pathname = usePathname();

  if (session.isPending) {
    return (
      <Screen header={<AppHeader left="none" title="Store admin" />}>
        <StateView kind="loading" title="Checking your sign-in" />
      </Screen>
    );
  }
  if (session.isError) {
    return (
      <Screen header={<AppHeader left="none" title="Store admin" />}>
        <StateView
          kind={isNetworkError(session.error) ? 'offline' : 'error'}
          actionLabel="Try again"
          onAction={() => session.refetch()}
        />
      </Screen>
    );
  }
  if (!session.data) return <Redirect href={{ pathname: '/admin/login', params: { next: pathname } }} />;
  return <>{children}</>;
}
