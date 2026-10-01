import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { errorMessage, isNetworkError, serverUrl, type PersonPhoto } from '@/api';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card, Divider } from '@/components/ui/Card';
import { Banner, StateView } from '@/components/ui/Feedback';
import { ListRow } from '@/components/ui/ListRow';
import { Sheet } from '@/components/ui/Sheet';
import { ToggleRow } from '@/components/ui/Toggle';
import {
  useDeleteAllPhotos,
  useDeletePhoto,
  usePrivacyOverview,
  useRequestAccountDeletion,
  useDeleteAllMyData,
  useSetAiConsent,
  useSetReuseTryOnPhoto,
} from '@/data/account';
import { demoMode } from '@/api/mode';
import { links, openExternal } from '@/lib/links';
import { useClearStylistHistory } from '@/data/stylist';
import { confirm } from '@/lib/confirm';
import { expiryLabel, pluralize, timeLabel } from '@/lib/format';
import { showToast } from '@/state/toast';
import { colors, space } from '@/theme';

/** 18 · Photos and privacy — /privacy. What's kept, for how long, and the controls. */
export default function PrivacyScreen() {
  const overview = usePrivacyOverview();
  const setReuse = useSetReuseTryOnPhoto();
  const clearHistory = useClearStylistHistory();
  const requestDeletion = useRequestAccountDeletion();
  const setAiConsent = useSetAiConsent();
  const deleteAll = useDeleteAllMyData();
  const [photosOpen, setPhotosOpen] = useState(false);
  const [cleanupRetrying, setCleanupRetrying] = useState(false);

  const data = overview.data;

  const onClearHistory = async () => {
    const ok = await confirm({
      title: 'Clear stylist history?',
      message: 'Your conversation and unsaved outfit suggestions are deleted. Saved outfits stay.',
      confirmLabel: 'Clear history',
      destructive: true,
    });
    if (ok) clearHistory.mutate(undefined, { onSuccess: () => showToast('Stylist history cleared') });
  };

  const onWithdrawAi = async (allow: boolean) => {
    if (allow) {
      setAiConsent.mutate(true);
      return;
    }
    const ok = await confirm({
      title: 'Turn off AI features?',
      message: 'Try-on previews, closet photo reading and the AI stylist stop until you allow them again. Nothing more is sent.',
      confirmLabel: 'Turn off',
      destructive: true,
    });
    if (ok) setAiConsent.mutate(false, { onSuccess: () => showToast('AI features turned off') });
  };

  const onDeleteAllData = async () => {
    const ok = await confirm({
      title: 'Delete all your data?',
      message:
        'Your closet, photos, previews, measurements, stylist conversation and saved outfits are deleted from this phone and from the Nyoni server. This cannot be undone.',
      confirmLabel: 'Delete everything',
      destructive: true,
    });
    if (!ok) return;
    deleteAll.mutate(undefined, {
      onSuccess: () => {
        showToast('Your data was deleted');
        router.dismissTo('/shop');
      },
      onError: (error) => showToast(errorMessage(error), { tone: 'error' }),
    });
  };

  const onDeleteAccount = async () => {
    const ok = await confirm({
      title: 'Delete your account?',
      message:
        'Your closet items, photos, crops, previews, stylist conversation and saved outfits will be deleted. Orders stay with the store for its records.',
      confirmLabel: 'Delete my account',
      destructive: true,
    });
    if (ok) requestDeletion.mutate(undefined, { onSuccess: () => showToast('Account deletion requested') });
  };

  return (
    <Screen header={<AppHeader left="back" fallbackHref="/shop" />}>
      <AppText variant="display" accessibilityRole="header">
        Your photos.{'\n'}
        <AppText variant="display" color={colors.bronze}>
          Your choice.
        </AppText>
      </AppText>

      {overview.isPending ? (
        <StateView compact kind="loading" />
      ) : overview.isError || !data ? (
        <StateView
          compact
          kind={isNetworkError(overview.error) ? 'offline' : 'error'}
          actionLabel="Try again"
          onAction={() => overview.refetch()}
        />
      ) : (
        <View style={styles.sections}>
          {data.accountDeletion === 'pending' ? (
            <Banner
              tone="notice"
              title="Account deletion requested"
              message="Your closet, photos, previews, conversation and saved outfits are being deleted. We'll confirm by email when it's finished."
            />
          ) : null}
          {cleanupRetrying ? (
            <Banner
              tone="notice"
              title="Removal still in progress"
              message="Your photos are gone from the app. Copies held by our processing provider couldn't be confirmed deleted yet. We'll keep retrying automatically."
            />
          ) : null}

          <SectionLabel>Photo settings</SectionLabel>
          <Card padded={false}>
            <ListRow
              icon="camera"
              iconBadge
              title="Try-on photos"
              subtitle={`Removed after 24 hours · ${data.tryOnPhotos.length} stored now`}
              onPress={() => setPhotosOpen(true)}
              style={styles.row}
            />
            <Divider inset={space.md} />
            <ListRow
              icon="image"
              iconBadge
              title="Saved previews"
              subtitle={`Removed 30 days after saving · ${data.savedPreviewCount} saved`}
              onPress={() => router.navigate({ pathname: '/closet/saved', params: { tab: 'previews' } })}
              style={styles.row}
            />
            <Divider inset={space.md} />
            <ListRow
              icon="closet"
              iconBadge
              title="Closet photos"
              subtitle="Kept until you delete the item"
              onPress={() => router.navigate('/closet')}
              style={styles.row}
            />
            <Divider inset={space.md} />
            <ListRow
              icon="ruler"
              iconBadge
              title="Body measurements"
              subtitle={
                data.hasBodyMeasurements
                  ? 'Measurements saved. The photos were deleted after measuring.'
                  : 'None saved. Measuring photos are never kept.'
              }
              onPress={() => router.navigate('/scan')}
              style={styles.row}
            />
          </Card>

          <SectionLabel>Preferences</SectionLabel>
          {serverUrl ? (
            <Card>
              <ToggleRow
                label="AI features"
                description="Try-on previews, closet photo reading and the stylist send the photos and messages you choose to OpenRouter, which uses models from OpenAI and Google. Your body scan stays on Nyoni's server."
                value={data.aiConsent}
                onValueChange={onWithdrawAi}
                accessibilityLabel="Allow AI features"
              />
            </Card>
          ) : null}
          <Card>
            <ToggleRow
              label="Reuse my try-on photo"
              description="Keep my latest try-on photo for up to 30 days so I don't need to upload it again. Off by default, and separate from any stylist personalization."
              value={data.reuseTryOnPhoto}
              onValueChange={(value) => setReuse.mutate(value)}
              accessibilityLabel="Reuse my try-on photo"
            />
          </Card>

          <SectionLabel>Account and data</SectionLabel>
          <Card padded={false}>
            <ListRow icon="settings" title="Manage photos" onPress={() => setPhotosOpen(true)} style={styles.row} />
            <Divider inset={space.md} />
            <ListRow
              icon="clock"
              title="Clear stylist history"
              subtitle={data.stylistMessageCount > 0 ? pluralize(data.stylistMessageCount, 'message') : 'No history'}
              onPress={onClearHistory}
              disabled={data.stylistMessageCount === 0}
              style={styles.row}
            />
            <Divider inset={space.md} />
            {demoMode ? (
              <ListRow
                icon="trash"
                title="Delete my account"
                onPress={onDeleteAccount}
                disabled={data.accountDeletion === 'pending'}
                style={styles.row}
              />
            ) : (
              <ListRow
                icon="trash"
                title="Delete all my data"
                subtitle="From this phone and the Nyoni server"
                onPress={onDeleteAllData}
                disabled={deleteAll.isPending}
                style={styles.row}
              />
            )}
          </Card>

          <View style={styles.legal}>
            <Button title="Privacy policy" variant="link" tone="ink" accessibilityRole="link" fullWidth={false} onPress={() => openExternal(links.privacyPolicy)} />
            <Button title="Terms and conditions" variant="link" tone="ink" accessibilityRole="link" fullWidth={false} onPress={() => openExternal(links.terms)} />
          </View>
        </View>
      )}

      <PhotosSheet
        visible={photosOpen}
        photos={data?.tryOnPhotos ?? []}
        onClose={() => setPhotosOpen(false)}
        onCleanupRetrying={() => setCleanupRetrying(true)}
      />
    </Screen>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <AppText variant="overline" color={colors.muted} style={styles.label}>
      {children}
    </AppText>
  );
}

function PhotosSheet({
  visible,
  photos,
  onClose,
  onCleanupRetrying,
}: {
  visible: boolean;
  photos: PersonPhoto[];
  onClose: () => void;
  onCleanupRetrying: () => void;
}) {
  const deletePhoto = useDeletePhoto();
  const deleteAll = useDeleteAllPhotos();

  const afterDelete = (result: { providerCleanup: 'done' | 'retrying' }, message: string) => {
    if (result.providerCleanup === 'retrying') onCleanupRetrying();
    showToast(message);
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Try-on photos" subtitle="Photos you uploaded for AI previews.">
      {photos.length === 0 ? (
        <AppText variant="body" color={colors.muted} style={styles.empty}>
          No try-on photos are stored right now.
        </AppText>
      ) : (
        <View style={styles.photoList}>
          {photos.map((photo) => (
            <View key={photo.id} style={styles.photoRow}>
              <Image source={{ uri: photo.localUri }} style={styles.photoThumb} contentFit="cover" accessibilityLabel="Your try-on photo" />
              <View style={styles.flex}>
                <AppText variant="body">Uploaded {timeLabel(photo.createdAt)}</AppText>
                <AppText variant="secondary" color={colors.muted}>
                  {expiryLabel(photo.expiresAt).replace('Expires', 'Removed')}
                </AppText>
              </View>
              <Button
                title="Delete"
                variant="destructive"
                onPress={() => deletePhoto.mutate(photo.id, { onSuccess: (result) => afterDelete(result, 'Photo deleted') })}
              />
            </View>
          ))}
          <Button
            title="Delete all try-on photos"
            variant="outline"
            loading={deleteAll.isPending}
            onPress={async () => {
              const ok = await confirm({
                title: 'Delete all try-on photos?',
                message: 'Previews still being created are cancelled.',
                confirmLabel: 'Delete all',
                destructive: true,
              });
              if (ok) deleteAll.mutate(undefined, { onSuccess: (result) => afterDelete(result, 'All try-on photos deleted') });
            }}
          />
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  legal: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: space.md,
  },
  sections: {
    gap: space.sm,
    marginTop: space.lg,
  },
  label: {
    marginTop: space.md,
  },
  row: {
    paddingHorizontal: space.md,
  },
  empty: {
    paddingVertical: space.lg,
  },
  photoList: {
    gap: space.md,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  photoThumb: {
    width: 56,
    height: 72,
    borderRadius: 8,
    backgroundColor: colors.media,
  },
  flex: {
    flex: 1,
  },
});
