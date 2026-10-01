import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icons/Icon';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { useSetAiConsent } from '@/data/account';
import { links, openExternal } from '@/lib/links';
import { useAiConsentPrompt } from '@/state/aiConsentPrompt';
import { showToast } from '@/state/toast';
import { colors, space } from '@/theme';

/** What leaves the phone, and to whom (Apple 5.1.2(i): name the providers and the data). */
const SENT: { icon: IconName; text: string }[] = [
  { icon: 'camera', text: 'The photo you choose for a try-on preview, and the pieces you try on' },
  { icon: 'images', text: 'Photos you add to your closet' },
  { icon: 'message', text: 'Your stylist messages, and the names and colours of your closet pieces' },
];

/**
 * Asked once, before the first AI feature sends anything. Mounted at the root; screens open it
 * through useEnsureAiConsent().
 */
export function AiConsentSheet() {
  const open = useAiConsentPrompt((state) => state.open);
  const answer = useAiConsentPrompt((state) => state.answer);
  const consent = useSetAiConsent();

  const allow = () =>
    consent.mutate(true, {
      onSuccess: () => answer(true),
      onError: () => showToast("We couldn't save that. Please try again.", { tone: 'error' }),
    });

  return (
    <Sheet
      visible={open}
      onClose={() => answer(false)}
      title="Use AI features?"
      subtitle="Try-on previews, closet photo reading and the stylist use AI services."
      footer={
        <View style={styles.buttons}>
          <Button title="Allow AI features" variant="gold" onPress={allow} loading={consent.isPending} />
          <Button title="Not now" variant="link" tone="ink" onPress={() => answer(false)} />
        </View>
      }>
      <View style={styles.body}>
        <AppText variant="label">What we send</AppText>
        {SENT.map((row) => (
          <View key={row.text} style={styles.row}>
            <Icon name={row.icon} size={18} color={colors.bronze} />
            <AppText variant="secondary" style={styles.flex}>
              {row.text}
            </AppText>
          </View>
        ))}
        <AppText variant="label" style={styles.gap}>
          Who processes it
        </AppText>
        <AppText variant="secondary" color={colors.muted}>
          OpenRouter, the AI service Nyoni uses, sends it to models from OpenAI (try-on images and photo reading) and
          Google (Gemini, the stylist). It’s used only to give you the result. Try-on photos are deleted after 24 hours.
        </AppText>
        <AppText variant="secondary" color={colors.muted}>
          Your body scan doesn’t use these services: it runs on Nyoni’s own server, and the photos are deleted straight
          after measuring.
        </AppText>
        <AppText variant="secondary" color={colors.muted}>
          You can turn this off at any time in Photos and privacy.
        </AppText>
        <Button title="Privacy policy" variant="link" tone="ink" accessibilityRole="link" onPress={() => openExternal(links.privacyPolicy)} style={styles.link} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: space.sm,
  },
  row: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
  },
  flex: {
    flex: 1,
  },
  gap: {
    marginTop: space.xs,
  },
  link: {
    alignSelf: 'flex-start',
  },
  buttons: {
    gap: space.xs,
  },
});
