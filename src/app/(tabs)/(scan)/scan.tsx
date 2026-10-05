import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { isNetworkError } from '@/api';
import { FitProfile } from '@/components/fit/FitProfile';
import { Icon, type IconName } from '@/components/icons/Icon';
import { AppHeader, HeaderMenuButton } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StateView } from '@/components/ui/Feedback';
import { useBodyMeasurements } from '@/data/measurements';
import { openBookFitting } from '@/lib/links';
import { colors, radius, space } from '@/theme';

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'camera', title: 'Prop up your phone', text: 'At waist height, 2–3 m away. Or ask a friend to hold it.' },
  { icon: 'person', title: 'Two quick poses', text: 'Front, then side. A voice counts you down and takes each photo.' },
  { icon: 'ruler', title: 'Your sizes, everywhere', text: 'Suit, trouser and shirt sizes, marked “For you” across the collection.' },
];

/** Scan — /scan. The shopper's fit profile, or a way to create one. */
export default function ScanScreen() {
  const body = useBodyMeasurements();

  return (
    <Screen header={<AppHeader right={<HeaderMenuButton />} />} onRefresh={body.refetch} refreshing={body.isRefetching}>
      {body.isPending ? (
        <StateView kind="loading" title="Loading your fit profile" />
      ) : body.isError ? (
        <StateView kind={isNetworkError(body.error) ? 'offline' : 'error'} actionLabel="Try again" onAction={() => body.refetch()} />
      ) : body.data ? (
        <View style={styles.profile}>
          <FitProfile body={body.data} title="Your fit profile">
            <Button title="Shop in my size" variant="gold" onPress={() => router.navigate('/shop')} />
            <Button title="Scan again" variant="outline" icon="scan" onPress={() => router.push('/body-scan')} />
            <Button title="Book a fitting" variant="link" tone="ink" icon="calendar" onPress={openBookFitting} />
          </FitProfile>
        </View>
      ) : (
        <Intro />
      )}
    </Screen>
  );
}

function Intro() {
  return (
    <View style={styles.intro}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Icon name="scan" size={40} color={colors.bronze} />
        </View>
        <AppText variant="display" align="center" accessibilityRole="header">
          Your fit, scanned.
        </AppText>
        <AppText variant="bodyLarge" color={colors.muted} align="center">
          A one-minute body scan with your phone gives your suit, trouser and shirt sizes.
        </AppText>
      </View>

      <Card style={styles.steps}>
        {STEPS.map((step, index) => (
          <View key={step.title} style={styles.step}>
            <View style={styles.stepNumber}>
              <AppText variant="label" color={colors.ivory}>
                {index + 1}
              </AppText>
            </View>
            <View style={styles.flex}>
              <AppText variant="label">{step.title}</AppText>
              <AppText variant="secondary" color={colors.muted}>
                {step.text}
              </AppText>
            </View>
            <Icon name={step.icon} size={22} color={colors.bronze} />
          </View>
        ))}
      </Card>

      <Button title="Start my scan" variant="gold" icon="scan" onPress={() => router.push('/body-scan')} />
      <Button title="Use photos I already have" variant="link" tone="ink" icon="image" onPress={() => router.push('/measure')} />

      <View style={styles.privacy}>
        <Icon name="shieldCheck" size={18} color={colors.muted} />
        <AppText variant="caption" color={colors.muted} style={styles.flex}>
          Wear fitted clothes. Your scan photos are measured and deleted straight away; only your measurements are kept,
          and you can delete them any time.
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  profile: {
    paddingTop: space.sm,
  },
  intro: {
    gap: space.lg,
    paddingTop: space.md,
  },
  hero: {
    alignItems: 'center',
    gap: space.sm,
  },
  heroIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.champagne,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  steps: {
    gap: space.md,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
  privacy: {
    flexDirection: 'row',
    gap: space.xs,
    alignItems: 'flex-start',
  },
});
