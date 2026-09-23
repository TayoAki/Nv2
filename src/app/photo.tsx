import * as Crypto from 'expo-crypto';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { errorMessage, type GarmentRef, type LocalPhoto, type PersonPhoto } from '@/api';
import { Icon } from '@/components/icons/Icon';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { GarmentImage } from '@/components/media/GarmentImage';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Banner, StateView } from '@/components/ui/Feedback';
import { useWardrobeItem } from '@/data/closet';
import { useProduct } from '@/data/shop';
import { usePhotos, useStartTryOn } from '@/data/tryOn';
import { track } from '@/lib/analytics';
import { explainDeniedPermission, pickFromLibrary, takePhoto, validatePersonPhoto } from '@/lib/photos';
import { useTryOnSession } from '@/state/tryOnSession';
import { colors, radius, space } from '@/theme';

type Selection =
  | { kind: 'new'; photo: LocalPhoto }
  | { kind: 'recent'; photo: PersonPhoto }
  | null;

/** 04 · Your photo — /photo. Focused step: no tab bar. */
export default function PhotoScreen() {
  const { productId, closetItemId } = useLocalSearchParams<{ productId?: string; closetItemId?: string }>();
  const product = useProduct(productId);
  const closetItem = useWardrobeItem(closetItemId);
  const photos = usePhotos();
  const startTryOn = useStartTryOn();
  const setActiveJob = useTryOnSession((state) => state.setActiveJob);

  const [selection, setSelection] = useState<Selection>(null);
  const [consent, setConsent] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState<'camera' | 'library' | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // One key per attempt: retrying after a network error reuses it, so no duplicate job is created.
  const [idempotencyKey, setIdempotencyKey] = useState(() => Crypto.randomUUID());

  const garment: GarmentRef | null = productId
    ? { kind: 'product', productId }
    : closetItemId
      ? { kind: 'closet', itemId: closetItemId }
      : null;
  const garmentName = product.data?.title ?? closetItem.data?.name;
  const garmentKind = product.data?.kind ?? closetItem.data?.kind ?? 'jacket';
  const garmentColor = product.data?.color.hex ?? closetItem.data?.color?.hex;
  const recentPhoto = photos.data?.[photos.data.length - 1];

  const choose = async (source: 'library' | 'camera') => {
    setPhotoError(null);
    setSubmitError(null);
    const result = source === 'library' ? await pickFromLibrary() : await takePhoto();
    if (result.status === 'denied') {
      setPermissionDenied(result.source);
      explainDeniedPermission(result.source);
      return;
    }
    if (result.status !== 'picked') return;
    setPermissionDenied(null);
    const photo = result.photos[0];
    const problem = validatePersonPhoto(photo);
    if (problem) {
      setSelection(null);
      setPhotoError(problem);
      return;
    }
    setSelection({ kind: 'new', photo });
    setIdempotencyKey(Crypto.randomUUID());
  };

  const create = () => {
    if (!garment || !selection || !consent) return;
    setSubmitError(null);
    startTryOn.mutate(
      {
        photo: selection.kind === 'new' ? selection.photo : null,
        existingPhotoId: selection.kind === 'recent' ? selection.photo.id : undefined,
        garment,
        idempotencyKey,
      },
      {
        onSuccess: (job) => {
          track('tryon_started', { jobId: job.id, garmentKind: job.garmentKind });
          setActiveJob(job.id);
          // Leave the focused step and continue inside the Shop tab.
          router.dismissTo(`/jobs/${job.id}`);
        },
        onError: (error) => setSubmitError(errorMessage(error)),
      },
    );
  };

  if (!garment) {
    return (
      <Screen header={<AppHeader left="back" fallbackHref="/shop" />} bottomInset>
        <StateView
          kind="empty"
          icon="closet"
          title="Choose a piece first"
          message="Pick a garment from the collection or your closet, then add your photo."
          actionLabel="Choose a piece"
          onAction={() => router.replace('/try-on')}
        />
      </Screen>
    );
  }

  const previewUri =
    selection?.kind === 'new' ? selection.photo.uri : selection?.kind === 'recent' ? selection.photo.localUri : null;
  const canCreate = !!selection && consent;

  return (
    <Screen
      header={<AppHeader left="back" fallbackHref="/shop" />}
      bottomInset
      footer={
        <Button
          title="Create my preview"
          onPress={create}
          disabled={!canCreate}
          loading={startTryOn.isPending}
          accessibilityHint={
            canCreate ? undefined : 'Add a photo and confirm you have permission to use it first'
          }
        />
      }>
      <AppText variant="display" align="center" accessibilityRole="header" style={styles.title}>
        See it on you.
      </AppText>

      <Pressable
        onPress={() => router.replace('/try-on')}
        accessibilityRole="button"
        accessibilityLabel={`Trying on ${garmentName ?? 'your piece'}. Change piece`}
        style={({ pressed }) => [styles.garment, pressed && styles.pressed]}>
        <GarmentImage kind={garmentKind} colorHex={garmentColor} aspectRatio={1} rounded={8} illustrationScale={0.8} style={styles.garmentThumb} />
        <View style={styles.flex}>
          <AppText variant="caption" color={colors.muted}>
            Trying on
          </AppText>
          <AppText variant="label" numberOfLines={1}>
            {garmentName ?? '…'}
          </AppText>
        </View>
        <AppText variant="label" color={colors.bronze}>
          Change
        </AppText>
      </Pressable>

      <View style={styles.frame}>
        {previewUri ? (
          <Image
            source={{ uri: previewUri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            accessibilityLabel="Your selected photo"
          />
        ) : (
          <GarmentImage
            kind="person"
            colorHex="#A39B8D"
            aspectRatio={0.78}
            illustrationScale={0.86}
            accessibilityLabel="Example: one person, standing, full body visible from head to feet, plain background"
            style={styles.example}
          />
        )}
        {!previewUri ? (
          <View style={styles.exampleTag}>
            <AppText variant="caption" color={colors.ink}>
              Example
            </AppText>
          </View>
        ) : null}
      </View>

      <AppText variant="bodyLarge" align="center" style={styles.guidance}>
        One person. Good light. Full body.
      </AppText>

      {photoError ? <Banner tone="error" title="Let's try a different photo" message={photoError} style={styles.banner} /> : null}
      {permissionDenied ? (
        <Banner
          tone="notice"
          message={
            permissionDenied === 'camera'
              ? 'Camera access is off. You can turn it on in Settings, or choose an existing photo instead.'
              : 'Photo access is off. You can turn it on in Settings, or take a new photo instead.'
          }
          style={styles.banner}
        />
      ) : null}

      <View style={styles.pickers}>
        <Button title="Use a photo" variant="gold" icon="image" onPress={() => choose('library')} style={styles.pickerButton} />
        <Button title="Take a photo" variant="gold" icon="camera" onPress={() => choose('camera')} style={styles.pickerButton} />
      </View>

      {recentPhoto && selection?.kind !== 'recent' ? (
        <Button
          title="Use my recent photo"
          variant="link"
          tone="ink"
          onPress={() => {
            setSelection({ kind: 'recent', photo: recentPhoto });
            setPhotoError(null);
            setIdempotencyKey(Crypto.randomUUID());
          }}
          accessibilityHint="Uses the photo you uploaded earlier today"
        />
      ) : null}

      <Checkbox
        checked={consent}
        onChange={setConsent}
        label="I have permission to use this photo."
        style={styles.consent}>
        <AppText variant="secondary" color={colors.muted}>
          Use a photo of yourself or someone who has agreed to this use. We send the photo to our AI processing
          provider to create your preview.
        </AppText>
        <Button
          title="How photos are used"
          variant="link"
          tone="ink"
          onPress={() => router.push('/privacy')}
          style={styles.inlineLink}
        />
      </Checkbox>

      {submitError ? <Banner tone="error" message={submitError} style={styles.banner} /> : null}
      <View style={styles.privateNote}>
        <Icon name="lock" size={16} color={colors.muted} />
        <AppText variant="caption" color={colors.muted}>
          Nothing is uploaded until you tap Create my preview.
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: space.xxs,
  },
  garment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    alignSelf: 'center',
    marginTop: space.md,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    maxWidth: '100%',
  },
  garmentThumb: {
    width: 36,
  },
  flex: {
    flexShrink: 1,
    flexGrow: 1,
  },
  pressed: {
    opacity: 0.75,
  },
  frame: {
    marginTop: space.md,
    width: '84%',
    alignSelf: 'center',
    aspectRatio: 0.78,
    borderRadius: radius.card + 4,
    overflow: 'hidden',
    backgroundColor: colors.media,
  },
  example: {
    flex: 1,
  },
  exampleTag: {
    position: 'absolute',
    top: space.sm,
    left: space.sm,
    backgroundColor: 'rgba(251, 249, 245, 0.92)',
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
  },
  guidance: {
    marginTop: space.md,
  },
  banner: {
    marginTop: space.md,
  },
  pickers: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.md,
  },
  pickerButton: {
    flex: 1,
    paddingHorizontal: space.sm,
  },
  consent: {
    marginTop: space.lg,
  },
  inlineLink: {
    alignSelf: 'flex-start',
  },
  privateNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    marginTop: space.lg,
  },
});
