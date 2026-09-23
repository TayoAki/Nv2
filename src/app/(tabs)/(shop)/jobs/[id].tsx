import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { isApiError, isNetworkError, type TryOnJob } from '@/api';
import { Icon } from '@/components/icons/Icon';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { GarmentImage } from '@/components/media/GarmentImage';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { ProgressRing, StateView } from '@/components/ui/Feedback';
import { photoParamsFor, usePhotos, useCancelTryOn, useTryOnJob } from '@/data/tryOn';
import { track } from '@/lib/analytics';
import { confirm } from '@/lib/confirm';
import { useTryOnSession } from '@/state/tryOnSession';
import { colors, space } from '@/theme';

/** 05 · Preview processing — /jobs/:id */
export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: job, isPending, isError, error, refetch } = useTryOnJob(id);
  const photos = usePhotos();
  const cancel = useCancelTryOn();
  const markSeen = useTryOnSession((state) => state.markSeen);

  const state = job?.state;
  const lookId = job?.lookId;
  const failureCode = job?.failureCode;
  const garmentKind = job?.garmentKind;

  // Record outcomes once, and open the preview when it's ready while the shopper is here.
  useEffect(() => {
    if (!id || !state) return;
    if (state === 'succeeded' && lookId) {
      track('tryon_succeeded', { jobId: id, garmentKind });
      markSeen(id);
      const timer = setTimeout(() => router.replace(`/preview/${lookId}`), 700);
      return () => clearTimeout(timer);
    }
    if (state === 'failed' || state === 'expired') {
      track('tryon_failed', { jobId: id, code: failureCode });
      markSeen(id);
    }
  }, [id, state, lookId, failureCode, garmentKind, markSeen]);

  const header = <AppHeader left="back" fallbackHref="/shop" />;

  if (isPending) {
    return (
      <Screen header={header}>
        <StateView kind="loading" title="Checking your preview" />
      </Screen>
    );
  }
  if (isError || !job) {
    return (
      <Screen header={header}>
        <StateView
          kind={isNetworkError(error) ? 'offline' : isApiError(error) && error.code === 'not_found' ? 'empty' : 'error'}
          title={isApiError(error) && error.code === 'not_found' ? "We couldn't find this preview" : undefined}
          actionLabel="Try again"
          onAction={() => refetch()}
          secondaryLabel="Continue shopping"
          onSecondary={() => router.dismissTo('/shop')}
        />
      </Screen>
    );
  }

  const photoUri = photos.data?.find((p) => p.id === job.photoId)?.localUri;
  const retryPhoto = () =>
    router.push({
      pathname: '/photo',
      params: photoParamsFor(job.garment),
    });

  const onCancel = async () => {
    const ok = await confirm({
      title: 'Cancel this preview?',
      message: 'Your photo stays private and is removed on the normal schedule.',
      confirmLabel: 'Cancel preview',
      cancelLabel: 'Keep creating',
      destructive: true,
    });
    if (ok) cancel.mutate(job.id);
  };

  const copy = describe(job);
  const running = job.state === 'validating' || job.state === 'queued' || job.state === 'processing';

  return (
    <Screen header={header}>
      <AppText variant="display" align="center" accessibilityRole="header" style={styles.title} accessibilityLiveRegion="polite">
        {copy.title}
      </AppText>

      <View style={styles.visuals}>
        <GarmentImage
          kind={job.garmentKind}
          colorHex={job.garmentColor.hex}
          aspectRatio={0.88}
          illustrationScale={0.8}
          accessibilityLabel={job.garmentTitle}
          style={styles.visual}
        />
        <View style={styles.ring}>
          {running ? (
            <ProgressRing size={64} />
          ) : (
            <View style={[styles.outcome, job.state === 'succeeded' ? styles.outcomeOk : styles.outcomeOff]}>
              <Icon
                name={job.state === 'succeeded' ? 'check' : job.state === 'cancelled' ? 'close' : 'alert'}
                size={26}
                color={job.state === 'succeeded' ? colors.white : colors.bronze}
                strokeWidth={2}
              />
            </View>
          )}
        </View>
        <GarmentImage
          kind="person"
          colorHex="#A39B8D"
          image={photoUri ? { uri: photoUri, alt: 'Your photo' } : undefined}
          aspectRatio={0.88}
          illustrationScale={0.8}
          style={styles.visual}
        />
      </View>

      <Steps job={job} />

      <AppText variant="bodyLarge" align="center" style={styles.message}>
        {copy.message}
      </AppText>

      <View style={styles.actions}>
        {copy.retry ? <Button title={copy.retry} onPress={retryPhoto} /> : null}
        {job.state === 'succeeded' && job.lookId ? (
          <Button title="View my preview" onPress={() => router.replace(`/preview/${job.lookId}`)} />
        ) : null}
        <Button
          title="Continue shopping"
          variant={copy.retry || job.state === 'succeeded' ? 'outline' : 'primary'}
          onPress={() => router.dismissTo('/shop')}
        />
        {running ? (
          <Button title="Cancel preview" variant="link" tone="ink" onPress={onCancel} loading={cancel.isPending} />
        ) : null}
      </View>
    </Screen>
  );
}

function describe(job: TryOnJob): { title: string; message: string; retry?: string } {
  switch (job.state) {
    case 'succeeded':
      return { title: 'Your preview is ready', message: 'Opening your preview…' };
    case 'cancelled':
      return {
        title: 'Preview cancelled',
        message: 'No preview was created. You can start again whenever you like.',
        retry: 'Start again',
      };
    case 'expired':
      return {
        title: 'This preview expired',
        message: 'Previews that are not saved are removed after 24 hours.',
        retry: 'Create a new preview',
      };
    case 'failed':
      if (job.failureCode === 'quota_reached') {
        return {
          title: 'Preview limit reached',
          message:
            "You've reached the preview limit for now. Previews are limited to keep them fair for everyone. You can keep shopping and try again later.",
        };
      }
      if (job.failureCode === 'service_unavailable') {
        return {
          title: 'Previews are paused',
          message: "Previews aren't available right now. Your photo is fine; please try again later.",
        };
      }
      if (job.failureCode === 'timeout') {
        return {
          title: 'This is taking too long',
          message: "We couldn't finish your preview in time. Try again, or continue shopping.",
          retry: 'Try again',
        };
      }
      return {
        title: "We couldn't create a reliable preview",
        message: 'Try a clearer photo or continue shopping.',
        retry: 'Try another photo',
      };
    default:
      return job.slow
        ? { title: 'Still creating your preview', message: 'Your preview is still processing. You can keep browsing.' }
        : {
            title: 'Creating your preview',
            message: 'You can keep browsing. Your preview will be here when it is ready.',
          };
  }
}

function Steps({ job }: { job: TryOnJob }) {
  // Real states only: no invented percentages or promised times (plan section 05).
  const labels = ['Photo checked', 'Creating preview', 'Ready to view'];
  const current =
    job.state === 'validating' ? 0 : job.state === 'queued' || job.state === 'processing' ? 1 : job.state === 'succeeded' ? 3 : -1;
  const failedAt = job.state === 'failed' || job.state === 'cancelled' || job.state === 'expired' ? 1 : -1;

  return (
    <View style={styles.steps} accessibilityRole="progressbar" accessibilityLabel={`Step: ${labels[Math.min(Math.max(current, 0), 2)]}`}>
      {labels.map((label, index) => {
        const done = index < current || (failedAt >= 0 && index < failedAt);
        const active = index === current;
        const failed = index === failedAt;
        return (
          <View key={label} style={styles.step}>
            <View style={styles.stepMarkerRow}>
              <View style={[styles.line, index === 0 && styles.lineHidden, (done || active || failed) && styles.lineDone]} />
              <View
                style={[
                  styles.marker,
                  done && styles.markerDone,
                  active && styles.markerActive,
                  failed && styles.markerFailed,
                ]}>
                {done ? <Icon name="check" size={16} color={colors.white} strokeWidth={2.4} /> : null}
                {active ? <View style={styles.markerDot} /> : null}
                {failed ? <Icon name="close" size={14} color={colors.error} strokeWidth={2.4} /> : null}
              </View>
              <View style={[styles.line, index === labels.length - 1 && styles.lineHidden, done && styles.lineDone]} />
            </View>
            <AppText variant="secondary" color={done || active ? colors.ink : colors.muted} align="center">
              {label}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: space.sm,
  },
  visuals: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.xl,
  },
  visual: {
    flex: 1,
  },
  ring: {
    width: 72,
    alignItems: 'center',
  },
  outcome: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outcomeOk: {
    backgroundColor: colors.bronze,
  },
  outcomeOff: {
    backgroundColor: colors.surfaceSunken,
  },
  steps: {
    flexDirection: 'row',
    marginTop: space.xl,
  },
  step: {
    flex: 1,
    alignItems: 'center',
    gap: space.xs,
  },
  stepMarkerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  line: {
    flex: 1,
    height: 1.5,
    backgroundColor: colors.hairline,
  },
  lineHidden: {
    opacity: 0,
  },
  lineDone: {
    backgroundColor: colors.champagne,
  },
  marker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ivory,
  },
  markerDone: {
    backgroundColor: colors.bronze,
    borderColor: colors.bronze,
  },
  markerActive: {
    borderColor: colors.champagne,
    borderWidth: 2,
  },
  markerFailed: {
    borderColor: colors.error,
  },
  markerDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.champagne,
  },
  message: {
    marginTop: space.xl,
    paddingHorizontal: space.xs,
  },
  actions: {
    gap: space.sm,
    marginTop: space.xl,
  },
});
