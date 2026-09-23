import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { errorMessage, isApiError, isNetworkError, type Look } from '@/api';
import { AppHeader, goBack, HeaderMenuButton } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { GarmentIllustration, GarmentImage } from '@/components/media/GarmentImage';
import { SizeSheet } from '@/components/shop/SizeSheet';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Banner, StateView } from '@/components/ui/Feedback';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { OptionSheet } from '@/components/ui/SelectField';
import { useProduct } from '@/data/shop';
import { photoParamsFor, useDeleteLook, useLook, useReportLook, useSetLookSaved } from '@/data/tryOn';
import { track } from '@/lib/analytics';
import { confirm } from '@/lib/confirm';
import { expiryLabel } from '@/lib/format';
import { showToast } from '@/state/toast';
import { useTryOnSession } from '@/state/tryOnSession';
import { colors, radius, space } from '@/theme';

const REPORT_REASONS = [
  { value: 'identity', label: 'My face, skin tone or body changed' },
  { value: 'garment', label: 'The garment looks wrong (color, pattern, lapels…)' },
  { value: 'incomplete', label: 'Parts of the garment are missing' },
  { value: 'quality', label: 'The image is blurry or distorted' },
  { value: 'other', label: 'Something else' },
];

/** 06 · AI preview — /preview/:id */
export default function PreviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: look, isPending, isError, error, refetch } = useLook(id);
  const markSeen = useTryOnSession((state) => state.markSeen);

  const jobId = look?.jobId;
  useEffect(() => {
    if (!id || !jobId) return;
    markSeen(jobId);
    track('preview_viewed', { lookId: id });
  }, [id, jobId, markSeen]);

  const header = (
    <AppHeader tone="dark" left="back" fallbackHref="/shop" right={<HeaderMenuButton tone="dark" />} />
  );

  return (
    <Screen header={header} topInsetColor={colors.ink} statusBarStyle="light">
      {isPending ? (
        <StateView kind="loading" title="Opening your preview" />
      ) : isError || !look ? (
        <StateView
          kind={isNetworkError(error) ? 'offline' : isApiError(error) && error.code === 'not_found' ? 'empty' : 'error'}
          title={isApiError(error) && error.code === 'not_found' ? 'This preview was deleted' : undefined}
          message={isApiError(error) && error.code === 'not_found' ? 'Previews you delete are removed for good.' : undefined}
          actionLabel={isApiError(error) && error.code === 'not_found' ? 'Continue shopping' : 'Try again'}
          onAction={isApiError(error) && error.code === 'not_found' ? () => router.dismissTo('/shop') : () => refetch()}
        />
      ) : (
        <PreviewBody look={look} />
      )}
    </Screen>
  );
}

function PreviewBody({ look }: { look: Look }) {
  const [view, setView] = useState<'preview' | 'original'>('preview');
  const [sizeOpen, setSizeOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const product = useProduct(look.garment.kind === 'product' ? look.garment.productId : undefined);
  const setSaved = useSetLookSaved();
  const deleteLook = useDeleteLook();
  const report = useReportLook();

  const expired = look.status === 'expired';
  const isProduct = look.garment.kind === 'product';

  const toggleSave = () =>
    setSaved.mutate(
      { id: look.id, saved: !look.saved },
      {
        onSuccess: (updated) => {
          if (updated.saved) {
            track('preview_saved', { lookId: look.id });
            showToast('Saved to your looks', {
              actionLabel: 'View',
              onAction: () => router.navigate({ pathname: '/closet/saved', params: { tab: 'previews' } }),
            });
          } else {
            showToast('Removed from saved looks');
          }
        },
        onError: (err) => showToast(errorMessage(err), { tone: 'error' }),
      },
    );

  const onDelete = async () => {
    const ok = await confirm({
      title: 'Delete this preview?',
      message: 'The preview is removed from your account. This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    deleteLook.mutate(look.id, {
      onSuccess: () => {
        showToast('Preview deleted');
        goBack('/shop');
      },
    });
  };

  const retry = () =>
    router.push({
      pathname: '/photo',
      params: photoParamsFor(look.garment),
    });

  return (
    <View style={styles.body}>
      <AppText variant="title" accessibilityRole="header">
        Your Nyoni preview
      </AppText>

      <View style={styles.frame}>
        {view === 'original' ? (
          look.originalPhotoUri ? (
            <Image source={{ uri: look.originalPhotoUri }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel="Your original photo" />
          ) : (
            <GarmentImage kind="person" colorHex="#A39B8D" illustrationScale={0.85} style={StyleSheet.absoluteFill} rounded={0} accessibilityLabel="Original photo no longer stored" />
          )
        ) : look.resultImage ? (
          <Image source={look.resultImage.uri ? { uri: look.resultImage.uri } : look.resultImage.asset} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={`AI preview of ${look.garmentTitle}`} />
        ) : (
          <DemoPreview look={look} />
        )}
        {view === 'preview' ? <Badge label="AI preview" tone="ai" icon="sparkle" size="md" style={styles.aiBadge} /> : null}
        {expired ? <View style={styles.expiredVeil} /> : null}
      </View>

      <SegmentedControl
        accessibilityLabel="Compare your original photo with the preview"
        options={[
          { value: 'original', label: 'Original' },
          { value: 'preview', label: 'Preview' },
        ]}
        value={view}
        onChange={setView}
        style={styles.toggle}
      />

      {look.simulated ? (
        <Banner
          tone="notice"
          title="Simulated preview"
          message="AI rendering isn't connected yet, so this image is a placeholder made from your photo and the pieces. Real previews appear here once it's switched on."
        />
      ) : null}
      <AppText variant="secondary" color={colors.muted} align="center">
        A style preview, not a fit measurement. Appearance may vary. Use the size guide or book a fitting to confirm fit.
      </AppText>
      {look.scopeNote ? (
        <AppText variant="secondary" color={colors.bronze} align="center">
          {look.scopeNote}
        </AppText>
      ) : null}

      {expired ? (
        <Banner
          tone="notice"
          title="This preview has expired"
          message="Unsaved previews are removed after 24 hours and saved ones after 30 days. Create a new one any time."
          actionLabel="Create a new preview"
          onAction={retry}
        />
      ) : null}
      {!look.garmentAvailable ? (
        <Banner tone="notice" title="This piece is no longer available" message="You can keep the preview, but the item can't be added to your bag." />
      ) : null}
      {look.reported ? <Banner tone="success" message="Thanks for reporting this. The Nyoni team reviews reported previews." /> : null}

      <View style={styles.actions}>
        {isProduct && look.garmentAvailable && !expired ? (
          <Button title="Choose size" variant="gold" onPress={() => setSizeOpen(true)} />
        ) : null}
        {look.garment.kind === 'closet' && !expired ? (
          <Button
            title="View in my closet"
            variant="gold"
            onPress={() => look.garment.kind === 'closet' && router.navigate(`/closet/items/${look.garment.itemId}`)}
          />
        ) : null}
        {look.garment.kind === 'outfit' && look.garmentAvailable && !expired ? (
          <Button
            title="View the outfit"
            variant="gold"
            onPress={() => look.garment.kind === 'outfit' && router.navigate(`/outfits/${look.garment.outfitId}`)}
          />
        ) : null}
        {!expired ? (
          <Button
            title={look.saved ? 'Saved to your looks' : 'Save look'}
            icon={look.saved ? 'check' : undefined}
            variant="outline"
            loading={setSaved.isPending}
            onPress={toggleSave}
            accessibilityHint={look.saved ? 'Removes this look from your saved looks' : 'Keeps this preview for 30 days'}
          />
        ) : null}
        {!expired ? (
          <AppText variant="caption" color={colors.muted} align="center">
            {look.saved ? `Saved · ${expiryLabel(look.expiresAt)}` : `Not saved · ${expiryLabel(look.expiresAt)}`}
          </AppText>
        ) : null}
        <View style={styles.links}>
          {!look.reported ? (
            <Button title="Report a problem" variant="link" tone="muted" onPress={() => setReportOpen(true)} />
          ) : null}
          <Button title="Delete preview" variant="link" tone="muted" onPress={onDelete} />
        </View>
      </View>

      <SizeSheet product={product.data} visible={sizeOpen} onClose={() => setSizeOpen(false)} />
      <OptionSheet
        visible={reportOpen}
        title="Report a problem"
        subtitle="What looks wrong in this preview?"
        options={REPORT_REASONS}
        value={null}
        onClose={() => setReportOpen(false)}
        onSelect={(reason) => {
          setReportOpen(false);
          report.mutate({ id: look.id, reason });
        }}
      />
    </View>
  );
}

/**
 * Demo builds have no try-on provider, so no image is generated. Rather than fake an AI
 * result, show the shopper's own photo with the selected garment and say so plainly.
 */
function DemoPreview({ look }: { look: Look }) {
  return (
    <View style={styles.demo}>
      {look.originalPhotoUri ? (
        <Image source={{ uri: look.originalPhotoUri }} style={[StyleSheet.absoluteFill, styles.demoPhoto]} contentFit="cover" />
      ) : null}
      <View style={styles.demoGarment}>
        <GarmentIllustration kind={look.garmentKind} colorHex={look.garmentColor.hex} scale={0.9} />
      </View>
      <View style={styles.demoCaption}>
        <AppText variant="label" align="center">
          Demo preview
        </AppText>
        <AppText variant="caption" color={colors.muted} align="center">
          The generated look for {look.garmentTitle} appears here once a try-on provider is connected.
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: space.md,
    paddingTop: space.md,
  },
  frame: {
    width: '100%',
    // Renders are 2:3 portraits, head to toe.
    aspectRatio: 2 / 3,
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: '#EEE9E0',
  },
  aiBadge: {
    position: 'absolute',
    top: space.md,
    right: space.md,
  },
  expiredVeil: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(244, 240, 232, 0.6)',
  },
  toggle: {
    width: '72%',
    alignSelf: 'center',
  },
  actions: {
    gap: space.sm,
  },
  links: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.lg,
  },
  demo: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoPhoto: {
    opacity: 0.35,
  },
  demoGarment: {
    width: '62%',
    aspectRatio: 1,
  },
  demoCaption: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    bottom: space.md,
    backgroundColor: 'rgba(251, 249, 245, 0.94)',
    borderRadius: radius.card,
    padding: space.sm,
    gap: 2,
  },
});
