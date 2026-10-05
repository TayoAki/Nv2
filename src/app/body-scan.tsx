import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Speech from 'expo-speech';
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorMessage, isApiError, type LocalPhoto } from '@/api';
import { Icon } from '@/components/icons/Icon';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Banner, ProgressRing } from '@/components/ui/Feedback';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TextField } from '@/components/ui/TextField';
import { useBodyMeasurements, useCheckScanPhoto, useMeasureBody } from '@/data/measurements';
import { track } from '@/lib/analytics';
import { colors, radius, space } from '@/theme';

type Pose = 'front' | 'side';
type Helper = 'propped' | 'friend';
type Stage =
  | { pose: Pose; status: 'counting'; count: number }
  | { pose: Pose; status: 'checking' }
  | { pose: Pose; status: 'fix'; message: string }
  | { pose: Pose; status: 'paused' }
  | { pose: Pose; status: 'error'; title: string; message: string };

const POSES: Record<Pose, { title: string; instruction: string; speech: string }> = {
  front: {
    title: 'Front',
    instruction: 'Face the camera. Feet apart, arms out and down in an A. Fit inside the frame, head to feet.',
    speech: 'Front photo. Step back until your whole body fits the frame. Face the camera, feet apart, arms out and down. Hold still.',
  },
  side: {
    title: 'Side',
    instruction: 'Turn 90° so your side faces the camera. Feet together, arms relaxed at your sides.',
    speech: 'Great. Now turn so your side faces the camera. Feet together, arms relaxed at your sides. Hold still.',
  },
};

/** Seconds before each photo: time to walk back for the first one, less for the turn. */
const COUNTDOWN: Record<Pose, number> = { front: 10, side: 6 };

/** Retakes in a row before the scan stops retrying on its own and offers help. */
const MAX_RETAKES = 4;

const KEEP_AWAKE_TAG = 'body-scan';

/** Body scan — /body-scan. Guided camera capture: front and side, voice countdown, checked per shot. */
export default function BodyScanScreen() {
  const { productId } = useLocalSearchParams<{ productId?: string }>();
  const saved = useBodyMeasurements();
  const [setup, setSetup] = useState<{ heightCm: number; helper: Helper } | null>(null);

  const finish = () => (productId ? router.dismissTo(`/product/${productId}`) : router.dismissTo('/scan'));

  if (!setup) {
    return <Setup initialHeight={saved.data?.heightCm} onStart={setSetup} />;
  }
  return <Capture heightCm={setup.heightCm} helper={setup.helper} onDone={finish} onCancel={() => setSetup(null)} />;
}

/* ------------------------------------------------------------------------------------ setup */

function Setup({ initialHeight, onStart }: { initialHeight?: number; onStart: (setup: { heightCm: number; helper: Helper }) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [unit, setUnit] = useState<'cm' | 'in'>('cm');
  const [cm, setCm] = useState(initialHeight ? String(Math.round(initialHeight)) : '');
  const [feet, setFeet] = useState('');
  const [inches, setInches] = useState('');
  const [helper, setHelper] = useState<Helper>('propped');
  const [consent, setConsent] = useState(false);
  const [denied, setDenied] = useState(false);

  const heightCm = unit === 'cm' ? Number(cm) : (Number(feet || 0) * 12 + Number(inches || 0)) * 2.54;
  const heightValid = Number.isFinite(heightCm) && heightCm >= 120 && heightCm <= 230;
  const ready = heightValid && consent;

  const start = async () => {
    if (!ready) return;
    const granted = permission?.granted || (await requestPermission()).granted;
    if (!granted) {
      setDenied(true);
      return;
    }
    onStart({ heightCm: Math.round(heightCm * 10) / 10, helper });
  };

  return (
    <Screen
      header={<AppHeader left="close" fallbackHref="/scan" title="Body scan" />}
      bottomInset
      footer={
        <Button
          title="Start the scan"
          icon="scan"
          variant="gold"
          onPress={start}
          disabled={!ready}
          accessibilityHint={ready ? undefined : 'Enter your height and agree to the photo use first'}
        />
      }>
      <View style={styles.setup}>
        <Card style={styles.tips}>
          <AppText variant="label">Before you start</AppText>
          {[
            'Wear fitted clothes (no jacket or loose layers) and stand barefoot.',
            'Plain background, good light. Only you in view.',
            'Turn your sound on: a voice tells you when to pose.',
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
          <AppText variant="heading">Who holds the phone?</AppText>
          <SegmentedControl
            accessibilityLabel="Who holds the phone"
            options={[
              { value: 'propped', label: 'Propped up' },
              { value: 'friend', label: 'A friend' },
            ]}
            value={helper}
            onChange={setHelper}
          />
          <AppText variant="secondary" color={colors.muted}>
            {helper === 'propped'
              ? 'Lean the phone against something at waist height, screen facing you, then step back 2–3 m.'
              : 'Your friend stands 2–3 m away and holds the phone upright at your waist height.'}
          </AppText>
        </View>

        <Checkbox checked={consent} onChange={setConsent} label="Use my scan photos to measure me.">
          <AppText variant="secondary" color={colors.muted}>
            Nyoni measures the two photos and deletes them straight away. Only your measurements are kept, separately
            from your try-on photos, and you can delete them at any time.
          </AppText>
        </Checkbox>

        {denied ? (
          <Banner
            tone="notice"
            title="Camera access is off"
            message="Turn on camera access for Nyoni in Settings, or measure from photos you already have."
            actionLabel={Platform.OS === 'web' ? 'Use my photos instead' : 'Open Settings'}
            onAction={() => (Platform.OS === 'web' ? router.replace('/measure') : Linking.openSettings())}
          />
        ) : null}
        <Button title="Use photos I already have" variant="link" tone="ink" onPress={() => router.replace('/measure')} />
      </View>
    </Screen>
  );
}

/* ---------------------------------------------------------------------------------- capture */

function Capture({ heightCm, helper, onDone, onCancel }: { heightCm: number; helper: Helper; onDone: () => void; onCancel: () => void }) {
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraView>(null);
  const check = useCheckScanPhoto();
  const measure = useMeasureBody();
  const [cameraReady, setCameraReady] = useState(false);
  const [voice, setVoice] = useState(true);
  const [stage, setStage] = useState<Stage>({ pose: 'front', status: 'counting', count: COUNTDOWN.front });
  const [photos, setPhotos] = useState<Partial<Record<Pose, LocalPhoto>>>({});
  const [measureError, setMeasureError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState(false);
  const [retakes, setRetakes] = useState(0);
  const finished = useRef(false);
  const facing: CameraType = helper === 'propped' ? 'front' : 'back';

  const say = (text: string) => {
    if (!voice) return;
    Speech.stop();
    Speech.speak(text, { language: 'en-US', rate: 1 });
  };

  // The screen stays on for the whole scan; nobody can tap it from 2–3 m away. Failures are
  // ignored: on web the lock can be refused, or released before it activates.
  useEffect(() => {
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    return () => void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
  }, []);

  // Stop talking when the screen closes, unless it's the last line after measuring.
  useEffect(
    () => () => {
      if (!finished.current) void Speech.stop();
    },
    [],
  );

  // Pause the countdown while the app is in the background.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') return;
      Speech.stop();
      setStage((current) => (current.status === 'counting' ? { pose: current.pose, status: 'paused' } : current));
    });
    return () => subscription.remove();
  }, []);

  // Announce each pose when its countdown starts from the top.
  const pose = stage.pose;
  const announce = stage.status === 'counting' && stage.count === COUNTDOWN[stage.pose];
  useEffect(() => {
    if (cameraReady && announce) say(POSES[pose].speech);
    // `say` reads the current voice setting; re-announcing on toggle isn't wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraReady, announce, pose]);

  // The countdown: one tick a second, spoken for the last three, then the photo.
  useEffect(() => {
    if (!cameraReady || stage.status !== 'counting') return;
    if (stage.count === 0) {
      void capture(stage.pose);
      return;
    }
    if (stage.count <= 3) say(String(stage.count));
    const timer = setTimeout(
      () => setStage((current) => (current.status === 'counting' ? { ...current, count: current.count - 1 } : current)),
      1000,
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraReady, stage]);

  // After a pose problem, try again on its own after a few seconds. Only `fix` stages get here;
  // anything else (offline, service down, limit reached) waits for the shopper.
  useEffect(() => {
    if (stage.status !== 'fix') return;
    const timer = setTimeout(() => setStage({ pose: stage.pose, status: 'counting', count: 6 }), 6000);
    return () => clearTimeout(timer);
  }, [stage]);

  async function capture(current: Pose) {
    setStage({ pose: current, status: 'checking' });
    let shot: LocalPhoto;
    try {
      const picture = await camera.current?.takePictureAsync({ quality: 0.85, shutterSound: false });
      if (!picture) throw new Error('no picture');
      shot = { uri: picture.uri, width: picture.width, height: picture.height, mimeType: 'image/jpeg' };
    } catch {
      retake(current, "The camera didn't take the photo. Let's try again.");
      return;
    }
    check.mutate(
      { photo: shot, view: current },
      {
        onSuccess: () => {
          setRetakes(0);
          const next = { ...photos, [current]: shot };
          setPhotos(next);
          if (current === 'front') {
            setStage({ pose: 'side', status: 'counting', count: COUNTDOWN.side });
          } else if (next.front) {
            say('Got it. Measuring you now.');
            measureNow(next.front, shot);
          }
        },
        onError: (problem) => {
          // Only a pose problem is worth an automatic retake.
          if (isApiError(problem) && problem.code === 'validation') {
            retake(current, errorMessage(problem));
            return;
          }
          const title = isApiError(problem) && problem.code === 'network' ? 'You’re offline' : 'We couldn’t check the photo';
          say(title);
          setStage({ pose: current, status: 'error', title, message: errorMessage(problem) });
        },
      },
    );
  }

  function retake(current: Pose, message: string) {
    const count = retakes + 1;
    setRetakes(count);
    if (count >= MAX_RETAKES) {
      const title = 'Still not quite right';
      say(title);
      setStage({
        pose: current,
        status: 'error',
        title,
        message: `${message} Check that only you are in view, in good light, with your whole body inside the frame. Or measure from photos you already have.`,
      });
      return;
    }
    say(message);
    setStage({ pose: current, status: 'fix', message });
  }

  function measureNow(front: LocalPhoto, side: LocalPhoto) {
    setMeasureError(null);
    measure.mutate(
      { front, side, heightCm },
      {
        onSuccess: () => {
          track('measurement_completed', { method: 'scan' });
          finished.current = true;
          say('All done. Here are your sizes.');
          onDone();
        },
        onError: (problem) => {
          track('measurement_failed', { method: 'scan' });
          setMeasureError(errorMessage(problem));
        },
      },
    );
  }

  const restart = () => {
    setPhotos({});
    setMeasureError(null);
    setRetakes(0);
    setStage({ pose: 'front', status: 'counting', count: COUNTDOWN.front });
  };

  const tryAgain = () => {
    setRetakes(0);
    setStage({ pose: stage.pose, status: 'counting', count: 6 });
  };

  const paused = stage.status === 'paused';
  const measuring = measure.isPending || (!!photos.front && !!photos.side && !measureError);
  const info = POSES[stage.pose];

  return (
    <View style={styles.capture}>
      <CameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        facing={facing}
        onCameraReady={() => setCameraReady(true)}
        onMountError={() => setCameraError(true)}
        accessibilityLabel="Camera preview"
      />

      {/* Framing guide: head near the top line, feet near the bottom line. */}
      <View pointerEvents="none" style={[styles.guide, { top: insets.top + 72, bottom: 230 + insets.bottom }]}>
        <View style={styles.guideLine} />
        <AppText variant="caption" color={colors.ivory} style={styles.guideLabel}>
          Head here
        </AppText>
        <View style={styles.flex} />
        <AppText variant="caption" color={colors.ivory} style={styles.guideLabel}>
          Feet here
        </AppText>
        <View style={styles.guideLine} />
      </View>

      <View style={[styles.topBar, { paddingTop: insets.top + space.sm }]}>
        <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="Stop the scan" style={styles.roundButton}>
          <Icon name="close" size={22} color={colors.ivory} />
        </Pressable>
        <View style={styles.progress}>
          {(['front', 'side'] as Pose[]).map((p) => (
            <View key={p} style={[styles.progressDot, (photos[p] || stage.pose === p) && styles.progressDotOn]}>
              {photos[p] ? <Image source={{ uri: photos[p]!.uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
            </View>
          ))}
        </View>
        <Pressable
          onPress={() => {
            if (voice) Speech.stop();
            setVoice(!voice);
          }}
          accessibilityRole="switch"
          accessibilityState={{ checked: voice }}
          accessibilityLabel="Voice guidance"
          style={styles.roundButton}>
          <Icon name={voice ? 'volume' : 'volumeOff'} size={22} color={colors.ivory} />
        </Pressable>
      </View>

      <View style={[styles.panel, { paddingBottom: insets.bottom + space.md }]} accessibilityLiveRegion="polite">
        {cameraError ? (
          <View style={styles.flex}>
            <AppText variant="heading" color={colors.ivory}>
              The camera didn’t start
            </AppText>
            <AppText variant="secondary" color={colors.champagne}>
              Close any other app using the camera and try again, or measure from photos you already have.
            </AppText>
            <View style={styles.panelButtons}>
              <Button title="Use my photos" size="sm" variant="gold" onPress={() => router.replace('/measure')} fullWidth={false} />
              <Button title="Back" size="sm" variant="link" tone="bronze" onPress={onCancel} fullWidth={false} />
            </View>
          </View>
        ) : stage.status === 'error' ? (
          <View style={styles.flex}>
            <AppText variant="heading" color={colors.ivory}>
              {stage.title}
            </AppText>
            <AppText variant="secondary" color={colors.champagne}>
              {stage.message}
            </AppText>
            <View style={styles.panelButtons}>
              <Button title="Try again" size="sm" variant="gold" onPress={tryAgain} fullWidth={false} />
              <Button title="Use my photos" size="sm" variant="link" tone="bronze" onPress={() => router.replace('/measure')} fullWidth={false} />
            </View>
          </View>
        ) : measuring || measureError ? (
          <View style={styles.panelRow}>
            {measureError ? (
              <View style={styles.flex}>
                <AppText variant="heading" color={colors.ivory}>
                  We couldn’t measure you
                </AppText>
                <AppText variant="secondary" color={colors.champagne}>
                  {measureError}
                </AppText>
                <View style={styles.panelButtons}>
                  <Button title="Scan again" size="sm" variant="gold" onPress={restart} fullWidth={false} />
                  <Button title="Try measuring again" size="sm" variant="link" tone="bronze" onPress={() => photos.front && photos.side && measureNow(photos.front, photos.side)} fullWidth={false} />
                </View>
              </View>
            ) : (
              <>
                <ProgressRing size={40} />
                <View style={styles.flex}>
                  <AppText variant="heading" color={colors.ivory}>
                    Measuring you
                  </AppText>
                  <AppText variant="secondary" color={colors.champagne}>
                    Finding your outline, then your measurements and sizes.
                  </AppText>
                </View>
              </>
            )}
          </View>
        ) : (
          <>
            <View style={styles.panelRow}>
              <View style={styles.flex}>
                <AppText variant="overline" color={colors.champagne}>
                  {stage.pose === 'front' ? 'Photo 1 of 2' : 'Photo 2 of 2'}
                </AppText>
                <AppText variant="title" color={colors.ivory}>
                  {info.title}
                </AppText>
              </View>
              <View style={styles.counter} accessibilityLabel={stage.status === 'counting' ? `${stage.count} seconds` : undefined}>
                {stage.status === 'counting' ? (
                  <AppText variant="display" color={colors.ink}>
                    {cameraReady ? stage.count : '…'}
                  </AppText>
                ) : stage.status === 'checking' ? (
                  <ProgressRing size={32} />
                ) : (
                  <Icon name={paused ? 'clock' : 'alert'} size={28} color={colors.ink} />
                )}
              </View>
            </View>
            <AppText variant="body" color={colors.ivory}>
              {stage.status === 'fix' ? stage.message : stage.status === 'checking' ? 'Checking your pose…' : info.instruction}
            </AppText>
            {stage.status === 'fix' ? (
              <AppText variant="caption" color={colors.champagne}>
                Trying again in a moment.
              </AppText>
            ) : null}
            <View style={styles.panelButtons}>
              {paused ? (
                <Button title="Resume" size="sm" variant="gold" fullWidth={false} onPress={() => setStage({ pose: stage.pose, status: 'counting', count: 6 })} />
              ) : stage.status === 'counting' ? (
                <Button title="Pause" size="sm" variant="link" tone="bronze" fullWidth={false} onPress={() => { Speech.stop(); setStage({ pose: stage.pose, status: 'paused' }); }} />
              ) : null}
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  setup: {
    gap: space.lg,
    paddingTop: space.sm,
  },
  tips: {
    gap: space.sm,
  },
  tip: {
    flexDirection: 'row',
    gap: space.xs,
    alignItems: 'flex-start',
  },
  section: {
    gap: space.sm,
  },
  units: {
    alignSelf: 'flex-start',
    width: 200,
  },
  row: {
    flexDirection: 'row',
    gap: space.sm,
  },
  flex: {
    flex: 1,
  },
  capture: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  guide: {
    position: 'absolute',
    left: '18%',
    right: '18%',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(244, 240, 232, 0.7)',
    borderRadius: radius.card,
    paddingVertical: space.xs,
    alignItems: 'center',
  },
  guideLine: {
    height: 2,
    alignSelf: 'stretch',
    backgroundColor: colors.champagne,
    marginHorizontal: space.md,
  },
  guideLabel: {
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
  },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
  },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(11, 11, 12, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progress: {
    flexDirection: 'row',
    gap: space.xs,
  },
  progressDot: {
    width: 30,
    height: 44,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(244, 240, 232, 0.5)',
    overflow: 'hidden',
  },
  progressDotOn: {
    borderColor: colors.champagne,
  },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: space.sm,
    backgroundColor: 'rgba(11, 11, 12, 0.82)',
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
  },
  panelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  panelButtons: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.xs,
  },
  counter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.champagne,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
