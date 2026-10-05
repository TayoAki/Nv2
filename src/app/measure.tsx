import { Image } from 'expo-image';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';

import { FitProfile } from '@/components/fit/FitProfile';
import { Pressable, StyleSheet, View } from 'react-native';

import { errorMessage, isNetworkError, type BodyMeasurements, type LocalPhoto } from '@/api';
import { Icon } from '@/components/icons/Icon';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { GarmentImage } from '@/components/media/GarmentImage';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Banner, StateView } from '@/components/ui/Feedback';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TextField } from '@/components/ui/TextField';
import { useBodyMeasurements, useMeasureBody } from '@/data/measurements';
import { track } from '@/lib/analytics';
import { openBookFitting } from '@/lib/links';
import { explainDeniedPermission, pickFromLibrary, takePhoto } from '@/lib/photos';
import { colors, radius, space } from '@/theme';

type Unit = 'cm' | 'in';
type Pose = 'front' | 'side';

/** Measure me — /measure. Two photos and a height give measurements and suggested sizes. */
export default function MeasureScreen() {
  const { productId } = useLocalSearchParams<{ productId?: string }>();
  const saved = useBodyMeasurements();
  const [retake, setRetake] = useState(false);
  const back: Href = productId ? `/product/${productId}` : '/style-profile';

  return (
    <Screen header={<AppHeader left="back" fallbackHref={back} />} bottomInset>
      {saved.isPending ? (
        <StateView kind="loading" title="Loading your measurements" />
      ) : saved.isError ? (
        <StateView kind={isNetworkError(saved.error) ? 'offline' : 'error'} actionLabel="Try again" onAction={() => saved.refetch()} />
      ) : saved.data && !retake ? (
        <Results body={saved.data} productId={productId} onRetake={() => setRetake(true)} />
      ) : (
        <MeasureForm initialHeight={saved.data?.heightCm} onDone={() => setRetake(false)} />
      )}
    </Screen>
  );
}

function MeasureForm({ initialHeight, onDone }: { initialHeight?: number; onDone: () => void }) {
  const measure = useMeasureBody();
  const [unit, setUnit] = useState<Unit>('cm');
  const [cm, setCm] = useState(initialHeight ? String(Math.round(initialHeight)) : '');
  const [feet, setFeet] = useState('');
  const [inches, setInches] = useState('');
  const [photos, setPhotos] = useState<Record<Pose, LocalPhoto | null>>({ front: null, side: null });
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const heightCm =
    unit === 'cm' ? Number(cm) : (Number(feet || 0) * 12 + Number(inches || 0)) * 2.54;
  const heightValid = Number.isFinite(heightCm) && heightCm >= 120 && heightCm <= 230;
  const ready = heightValid && !!photos.front && !!photos.side && consent;

  const choose = async (pose: Pose, source: 'library' | 'camera') => {
    setError(null);
    const result = source === 'library' ? await pickFromLibrary() : await takePhoto();
    if (result.status === 'denied') {
      explainDeniedPermission(result.source);
      return;
    }
    if (result.status !== 'picked') return;
    setPhotos((current) => ({ ...current, [pose]: result.photos[0] }));
  };

  const submit = () => {
    if (!ready || !photos.front || !photos.side) return;
    setError(null);
    measure.mutate(
      { front: photos.front, side: photos.side, heightCm: Math.round(heightCm * 10) / 10 },
      {
        onSuccess: () => {
          track('measurement_completed');
          onDone();
        },
        onError: (problem) => {
          track('measurement_failed');
          setError(errorMessage(problem));
        },
      },
    );
  };

  return (
    <View style={styles.body}>
      <View style={styles.heading}>
        <AppText variant="display" align="center" accessibilityRole="header">
          Measure me
        </AppText>
        <AppText variant="bodyLarge" color={colors.muted} align="center">
          Two photos and your height. About a minute, for your suit size.
        </AppText>
      </View>

      <Card style={styles.tips}>
        <AppText variant="label">For the best result</AppText>
        {[
          'Wear fitted clothes (no jacket or loose layers) and stand barefoot.',
          'Plain background, good light. Only you in the photo.',
          'Phone at waist height, 2–3 m away, so you fill most of the frame head to feet. Ask someone to help, or use a timer.',
        ].map((tip) => (
          <View key={tip} style={styles.tip}>
            <Icon name="check" size={16} color={colors.bronze} />
            <AppText variant="secondary" style={styles.flex}>
              {tip}
            </AppText>
          </View>
        ))}
      </Card>

      <View style={styles.section}>
        <AppText variant="heading">Your height</AppText>
        <AppText variant="secondary" color={colors.muted}>
          Height sets the scale for every measurement, so be exact.
        </AppText>
        <SegmentedControl
          accessibilityLabel="Height units"
          options={[
            { value: 'cm', label: 'cm' },
            { value: 'in', label: 'ft / in' },
          ]}
          value={unit}
          onChange={setUnit}
          style={styles.units}
        />
        {unit === 'cm' ? (
          <TextField label="Height (cm)" value={cm} onChangeText={setCm} keyboardType="number-pad" placeholder="e.g. 180" accessibilityLabel="Height in centimetres" />
        ) : (
          <View style={styles.row}>
            <TextField label="Feet" value={feet} onChangeText={setFeet} keyboardType="number-pad" placeholder="5" containerStyle={styles.flex} accessibilityLabel="Height, feet" />
            <TextField label="Inches" value={inches} onChangeText={setInches} keyboardType="number-pad" placeholder="11" containerStyle={styles.flex} accessibilityLabel="Height, inches" />
          </View>
        )}
      </View>

      <View style={styles.section}>
        <AppText variant="heading">Two photos</AppText>
        <View style={styles.row}>
          <PhotoSlot
            pose="front"
            title="Front"
            instruction="Face the camera, feet apart, arms out and down in an A."
            photo={photos.front}
            onChoose={choose}
          />
          <PhotoSlot
            pose="side"
            title="Side"
            instruction="Turn 90°, arms relaxed at your sides, feet together."
            photo={photos.side}
            onChoose={choose}
          />
        </View>
      </View>

      <Checkbox checked={consent} onChange={setConsent} label="Use these photos to measure me.">
        <AppText variant="secondary" color={colors.muted}>
          Nyoni measures the two photos and deletes them straight away. Only your measurements are kept, separately
          from your try-on photos, and you can delete them at any time.
        </AppText>
      </Checkbox>

      {error ? <Banner tone="error" title="Let's try that again" message={error} /> : null}

      <Button
        title={measure.isPending ? 'Measuring…' : 'Measure me'}
        icon="ruler"
        onPress={submit}
        disabled={!ready}
        loading={measure.isPending}
        accessibilityHint={ready ? undefined : 'Enter your height, add both photos and agree to the photo use first'}
      />
      <AppText variant="caption" color={colors.muted} align="center">
        Estimates from photos, not a tailor’s fitting. Confirm with a tape measure or a fitting before alterations.
      </AppText>
    </View>
  );
}

function PhotoSlot({
  pose,
  title,
  instruction,
  photo,
  onChoose,
}: {
  pose: Pose;
  title: string;
  instruction: string;
  photo: LocalPhoto | null;
  onChoose: (pose: Pose, source: 'library' | 'camera') => void;
}) {
  return (
    <View style={styles.slot}>
      <Pressable
        onPress={() => onChoose(pose, 'library')}
        accessibilityRole="button"
        accessibilityLabel={photo ? `${title} photo added. Choose a different photo` : `Add ${title.toLowerCase()} photo`}
        style={({ pressed }) => [styles.slotFrame, pressed && styles.pressed]}>
        {photo ? (
          <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={`Your ${title.toLowerCase()} photo`} />
        ) : (
          <GarmentImage kind="person" colorHex="#A39B8D" aspectRatio={0.66} illustrationScale={0.8} rounded={0} style={StyleSheet.absoluteFill} />
        )}
        <Badge label={photo ? `${title} ✓` : title} tone={photo ? 'success' : 'overlay'} style={styles.slotBadge} />
      </Pressable>
      <AppText variant="caption" color={colors.muted}>
        {instruction}
      </AppText>
      {/* Pushes the buttons to the bottom so both columns line up. */}
      <View style={styles.flex} />
      <Button title="Choose photo" size="sm" variant="outline" icon="image" onPress={() => onChoose(pose, 'library')} />
      <Button title="Take photo" size="sm" variant="outline" icon="camera" onPress={() => onChoose(pose, 'camera')} />
    </View>
  );
}

function Results({ body, productId, onRetake }: { body: BodyMeasurements; productId?: string; onRetake: () => void }) {
  return (
    <View style={styles.resultsBody}>
      <FitProfile body={body}>
        {productId ? (
          <Button title="Back to the product" variant="gold" onPress={() => router.dismissTo(`/product/${productId}`)} />
        ) : (
          <Button title="Shop in my size" variant="gold" onPress={() => router.dismissTo('/shop')} />
        )}
        <Button title="Book a fitting" variant="outline" icon="calendar" onPress={openBookFitting} />
        <Button title="Measure again" variant="link" tone="ink" onPress={onRetake} />
      </FitProfile>
    </View>
  );
}

const styles = StyleSheet.create({
  resultsBody: {
    paddingTop: space.sm,
  },
  body: {
    gap: space.lg,
    paddingTop: space.sm,
  },
  heading: {
    gap: space.xs,
    alignItems: 'center',
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    justifyContent: 'center',
  },
  tips: {
    gap: space.sm,
  },
  tip: {
    flexDirection: 'row',
    gap: space.xs,
    alignItems: 'flex-start',
  },
  flex: {
    flex: 1,
  },
  section: {
    gap: space.sm,
  },
  units: {
    alignSelf: 'flex-start',
    width: 200,
  },
  unitToggle: {
    width: 130,
  },
  row: {
    flexDirection: 'row',
    gap: space.sm,
  },
  slot: {
    flex: 1,
    gap: space.xs,
  },
  slotFrame: {
    aspectRatio: 0.66,
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  slotBadge: {
    position: 'absolute',
    left: space.xs,
    top: space.xs,
  },
  pressed: {
    opacity: 0.8,
  },
  sizes: {
    gap: space.sm,
  },
  sizeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: space.sm,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  measureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  links: {
    alignItems: 'center',
  },
});
