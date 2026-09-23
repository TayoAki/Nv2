import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { errorMessage, isNetworkError, type WardrobeCategory, type WardrobeItem } from '@/api';
import { ClosetItemCard } from '@/components/closet/ClosetItemCard';
import { AppHeader, HeaderMenuButton } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card, Divider } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Banner, Skeleton, StateView } from '@/components/ui/Feedback';
import { TwoColumnGrid } from '@/components/ui/Grid';
import { ListRow } from '@/components/ui/ListRow';
import { Sheet } from '@/components/ui/Sheet';
import { useSession } from '@/data/account';
import { useDeleteWardrobeItem, useUpdateWardrobeItem, useWardrobe } from '@/data/closet';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { confirm } from '@/lib/confirm';
import { pluralize } from '@/lib/format';
import { explainDeniedPermission, pickFromLibrary, takePhoto } from '@/lib/photos';
import { showToast } from '@/state/toast';
import { usePendingImport } from '@/state/tryOnSession';
import { colors, gutter, space } from '@/theme';

type Filter = WardrobeCategory | 'all' | 'archived';

const CATEGORY_LABELS: Record<WardrobeCategory, string> = {
  jackets: 'Jackets',
  shirts: 'Shirts',
  knitwear: 'Knitwear',
  trousers: 'Trousers',
  shoes: 'Shoes',
  accessories: 'Accessories',
};

const CATEGORY_ORDER: WardrobeCategory[] = ['jackets', 'shirts', 'trousers', 'shoes', 'knitwear', 'accessories'];

/** 07 · My closet — /closet */
export default function ClosetScreen() {
  const wardrobe = useWardrobe();
  const session = useSession();
  const [filter, setFilter] = useState<Filter>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [actionsFor, setActionsFor] = useState<WardrobeItem | null>(null);
  const [accountHintDismissed, setAccountHintDismissed] = useState(false);
  const setPending = usePendingImport((state) => state.setPending);
  useRefreshOnFocus(wardrobe.refetch);

  const items = wardrobe.data ?? [];
  const active = items.filter((item) => !item.archived);
  const archivedCount = items.length - active.length;
  const categories = CATEGORY_ORDER.filter((category) => active.some((item) => item.category === category));
  const visible =
    filter === 'all'
      ? active
      : filter === 'archived'
        ? items.filter((item) => item.archived)
        : active.filter((item) => item.category === filter);
  const isDemo = items.some((item) => item.provenance === 'demo');

  const startImport = async (source: 'library' | 'camera' | 'manual') => {
    setAddOpen(false);
    if (source === 'manual') {
      setPending([], true);
      router.push('/closet/import');
      return;
    }
    const result = source === 'library' ? await pickFromLibrary({ multiple: true, limit: 12 }) : await takePhoto();
    if (result.status === 'denied') {
      explainDeniedPermission(result.source);
      return;
    }
    if (result.status !== 'picked') return;
    setPending(result.photos);
    router.push('/closet/import');
  };

  const header = <AppHeader right={<HeaderMenuButton icon="settings" />} />;

  return (
    <Screen header={header} onRefresh={wardrobe.refetch} refreshing={wardrobe.isRefetching}>
      <View style={styles.titleRow}>
        <AppText variant="display" accessibilityRole="header" style={styles.titleText}>
          My closet
        </AppText>
        <Button title="Add clothes" icon="plus" variant="gold" shape="pill" fullWidth={false} onPress={() => setAddOpen(true)} />
      </View>
      {wardrobe.data ? (
        <AppText variant="bodyLarge" color={colors.muted}>
          {pluralize(active.length, 'piece')}
          {isDemo ? ' · Demo wardrobe' : ''}
        </AppText>
      ) : null}

      {session.data?.kind === 'guest' && active.length > 0 && !accountHintDismissed ? (
        <Banner
          tone="info"
          icon="shieldCheck"
          title="Keep your closet across devices"
          message="Sign in so your wardrobe is saved to your account, not just this phone."
          actionLabel="Sign in"
          onAction={() => router.push('/account')}
          onDismiss={() => setAccountHintDismissed(true)}
          style={styles.banner}
        />
      ) : null}

      {wardrobe.isError && wardrobe.data ? (
        <Banner
          tone={isNetworkError(wardrobe.error) ? 'offline' : 'notice'}
          message={
            isNetworkError(wardrobe.error)
              ? "You're offline. Showing the closet saved on this device."
              : "We couldn't sync your closet. Showing what's saved on this device."
          }
          actionLabel="Try again"
          onAction={() => wardrobe.refetch()}
          style={styles.banner}
        />
      ) : null}

      {wardrobe.isPending ? (
        <View style={styles.grid}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.cell}>
              <Skeleton aspectRatio={0.96} />
              <Skeleton height={16} width="60%" rounded={4} />
            </View>
          ))}
        </View>
      ) : wardrobe.isError && !wardrobe.data ? (
        <StateView
          kind={isNetworkError(wardrobe.error) ? 'offline' : 'error'}
          title={isNetworkError(wardrobe.error) ? "You're offline" : "We couldn't sync your closet"}
          message={errorMessage(wardrobe.error)}
          actionLabel="Try again"
          onAction={() => wardrobe.refetch()}
        />
      ) : active.length === 0 && archivedCount === 0 ? (
        <StateView
          kind="empty"
          icon="closet"
          title="Your closet is empty"
          message="Add photos of clothes you own. We'll suggest the details and you check them before anything is saved."
          actionLabel="Add clothes"
          onAction={() => setAddOpen(true)}
          secondaryLabel="Add a piece without a photo"
          onSecondary={() => startImport('manual')}
        />
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroller} contentContainerStyle={styles.chips}>
            <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
            {categories.map((category) => (
              <Chip
                key={category}
                label={CATEGORY_LABELS[category]}
                selected={filter === category}
                onPress={() => setFilter(category)}
              />
            ))}
            {archivedCount > 0 ? (
              <Chip label={`Archived (${archivedCount})`} selected={filter === 'archived'} onPress={() => setFilter('archived')} />
            ) : null}
          </ScrollView>

          {visible.length === 0 ? (
            <StateView compact kind="empty" icon="closet" title="Nothing in this category yet" actionLabel="Add clothes" onAction={() => setAddOpen(true)} />
          ) : (
            <TwoColumnGrid
              items={visible}
              keyOf={(item) => item.id}
              style={styles.gridTop}
              renderItem={(item) => (
                <ClosetItemCard
                  item={item}
                  onPress={() => router.push(`/closet/items/${item.id}`)}
                  onMore={() => setActionsFor(item)}
                />
              )}
            />
          )}
        </>
      )}

      <Card padded={false} style={styles.links}>
        <ListRow
          icon="closet"
          title="Saved outfits"
          onPress={() => router.push({ pathname: '/closet/saved', params: { tab: 'outfits' } })}
          style={styles.linkRow}
        />
        <Divider inset={gutter} />
        <ListRow
          icon="image"
          title="Saved previews"
          onPress={() => router.push({ pathname: '/closet/saved', params: { tab: 'previews' } })}
          style={styles.linkRow}
        />
      </Card>

      <Sheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add clothes"
        subtitle="Choose the photos yourself. Nyoni never scans your photo library.">
        <ListRow icon="images" title="Choose photos" subtitle="Hangers, flat lays or worn — one or more pieces" onPress={() => startImport('library')} />
        <ListRow icon="camera" title="Take a photo" onPress={() => startImport('camera')} />
        <ListRow icon="plus" title="Add without a photo" subtitle="Enter the details yourself" onPress={() => startImport('manual')} />
      </Sheet>

      <ItemActionsSheet item={actionsFor} onClose={() => setActionsFor(null)} />
    </Screen>
  );
}

function ItemActionsSheet({ item, onClose }: { item: WardrobeItem | null; onClose: () => void }) {
  const update = useUpdateWardrobeItem();
  const remove = useDeleteWardrobeItem();
  if (!item) return null;

  const patch = (changes: Parameters<typeof update.mutate>[0]['patch'], message: string) => {
    onClose();
    update.mutate(
      { id: item.id, patch: changes },
      {
        onSuccess: () => showToast(message),
        onError: (error) => showToast(errorMessage(error), { tone: 'error' }),
      },
    );
  };

  const onDelete = async () => {
    onClose();
    const ok = await confirm({
      title: `Delete ${item.name}?`,
      message: 'The piece and its photos are removed from your closet. Outfits that use it will ask you to swap it.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    remove.mutate(item.id, {
      onSuccess: ({ affectedOutfitIds }) =>
        showToast(
          affectedOutfitIds.length > 0
            ? `Deleted. ${pluralize(affectedOutfitIds.length, 'outfit')} will ask for a replacement.`
            : 'Deleted from your closet',
        ),
    });
  };

  return (
    <Sheet visible={!!item} onClose={onClose} title={item.name}>
      <ListRow
        icon="eye"
        title="View details"
        onPress={() => {
          onClose();
          router.push(`/closet/items/${item.id}`);
        }}
      />
      <ListRow
        icon="clock"
        title={item.availability === 'ready' ? 'Mark unavailable (in laundry)' : 'Mark ready to wear'}
        onPress={() =>
          patch(
            { availability: item.availability === 'ready' ? 'unavailable' : 'ready' },
            item.availability === 'ready' ? 'Marked unavailable' : 'Marked ready to wear',
          )
        }
      />
      <ListRow
        icon="archive"
        title={item.archived ? 'Restore from archive' : 'Archive'}
        onPress={() => patch({ archived: !item.archived }, item.archived ? 'Restored to your closet' : 'Archived')}
      />
      <ListRow icon="trash" title="Delete" destructive onPress={onDelete} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.xs,
  },
  titleText: {
    flex: 1,
  },
  banner: {
    marginTop: space.md,
  },
  chipsScroller: {
    marginHorizontal: -gutter,
    marginTop: space.lg,
  },
  chips: {
    paddingHorizontal: gutter,
    gap: space.xs,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
    marginTop: space.md,
  },
  cell: {
    width: '47%',
    flexGrow: 1,
    gap: space.xs,
  },
  gridTop: {
    marginTop: space.md,
  },
  links: {
    marginTop: space.lg,
  },
  linkRow: {
    paddingHorizontal: gutter,
  },
});
