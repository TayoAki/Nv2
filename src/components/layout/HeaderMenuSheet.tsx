import { useQueryClient } from '@tanstack/react-query';
import { router, useNavigationContainerRef, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { apiMode, demoControls } from '@/api';
import { Icon } from '@/components/icons/Icon';
import { AppText } from '@/components/ui/AppText';
import { Divider } from '@/components/ui/Card';
import { ListRow } from '@/components/ui/ListRow';
import { Sheet } from '@/components/ui/Sheet';
import { useSession } from '@/data/account';
import { confirm } from '@/lib/confirm';
import { links, openBookFitting, openExternal } from '@/lib/links';
import { resetToShop } from '@/lib/navigation';
import { DEMO_SCENARIOS, useDevSettings } from '@/state/devSettings';
import { useHeaderMenu } from '@/state/headerMenu';
import { showToast } from '@/state/toast';
import { useTryOnSession } from '@/state/tryOnSession';
import { colors, radius, space } from '@/theme';

export function HeaderMenuSheet() {
  const open = useHeaderMenu((state) => state.open);
  const hide = useHeaderMenu((state) => state.hide);
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const navigationRef = useNavigationContainerRef();
  const scenario = useDevSettings((state) => state.scenario);
  const setScenario = useDevSettings((state) => state.setScenario);
  const clearTryOn = useTryOnSession((state) => state.clear);

  const go = (href: Href) => {
    hide();
    router.push(href);
  };

  const refreshAll = () => queryClient.invalidateQueries();

  const resetDemo = async (seed: 'demo' | 'empty') => {
    const ok = await confirm({
      title: seed === 'demo' ? 'Restore demo data?' : 'Start as a new shopper?',
      message:
        seed === 'demo'
          ? 'Your demo closet, bag, looks and conversation return to the sample data.'
          : 'This empties the demo closet, bag, saved looks and stylist conversation so you can see first-run states.',
      confirmLabel: seed === 'demo' ? 'Restore' : 'Start fresh',
      destructive: seed === 'empty',
    });
    if (!ok) return;
    hide();
    await demoControls.reset(seed);
    clearTryOn();
    await queryClient.resetQueries();
    resetToShop(navigationRef);
    showToast(seed === 'demo' ? 'Demo data restored' : 'Started as a new shopper');
  };

  return (
    <Sheet visible={open} onClose={hide} title="Your account" subtitle={sessionLabel(session)}>
      <ListRow icon="account" title="Account and sign-in" onPress={() => go('/account')} />
      <ListRow icon="sliders" title="Style preferences" onPress={() => go('/style-profile')} />
      <ListRow icon="shieldCheck" title="Photos and privacy" onPress={() => go('/privacy')} />
      <Divider spacing={space.xs} />
      <ListRow
        icon="calendar"
        title="Book a fitting"
        subtitle="Bespoke and sizing help from the Nyoni team"
        onPress={() => {
          hide();
          openBookFitting();
        }}
      />
      <ListRow
        icon="message"
        title="Contact Nyoni"
        onPress={() => {
          hide();
          openExternal(links.contact);
        }}
      />

      {apiMode === 'demo' ? (
        <View style={styles.demo}>
          <AppText variant="overline" color={colors.bronze}>
            Demo mode
          </AppText>
          <AppText variant="secondary" color={colors.muted}>
            Sample data only. Nothing is sent to a store or an AI provider. Pick a scenario to preview
            the alternative states from the screen index.
          </AppText>
          <View style={styles.scenarios} accessibilityRole="radiogroup">
            {DEMO_SCENARIOS.map((option) => {
              const selected = option.value === scenario;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => {
                    setScenario(option.value);
                    refreshAll();
                  }}
                  style={({ pressed }) => [styles.scenario, selected && styles.scenarioSelected, pressed && styles.pressed]}>
                  <View style={[styles.radio, selected && styles.radioSelected]}>
                    {selected ? <View style={styles.radioDot} /> : null}
                  </View>
                  <View style={styles.flex}>
                    <AppText variant="label">{option.label}</AppText>
                    <AppText variant="caption" color={colors.muted}>
                      {option.description}
                    </AppText>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <ListRow
            icon="retry"
            title="Simulate a price change in your bag"
            subtitle="Shows the bag's review-before-checkout state"
            onPress={async () => {
              await demoControls.simulateBagChanges();
              hide();
              await refreshAll();
              showToast('Store prices updated', { actionLabel: 'View bag', onAction: () => router.navigate('/bag') });
            }}
          />
          <ListRow icon="undo" title="Restore demo data" onPress={() => resetDemo('demo')} />
          <ListRow icon="trash" title="Start as a new shopper" subtitle="Empty closet, bag and saved looks" onPress={() => resetDemo('empty')} />
          <View style={styles.note}>
            <Icon name="info" size={16} color={colors.muted} />
            <AppText variant="caption" color={colors.muted} style={styles.flex}>
              To preview the account migration conflict, sign in with an email that contains the word
              “existing”.
            </AppText>
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

function sessionLabel(session: ReturnType<typeof useSession>['data']) {
  if (!session) return undefined;
  return session.kind === 'account' ? `Signed in as ${session.email}` : 'Browsing as a guest';
}

const styles = StyleSheet.create({
  demo: {
    marginTop: space.lg,
    padding: space.md,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    gap: space.sm,
  },
  scenarios: {
    gap: space.xs,
  },
  scenario: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.hairline,
    minHeight: 48,
  },
  scenarioSelected: {
    borderColor: colors.champagne,
    backgroundColor: colors.noticeBg,
  },
  pressed: {
    opacity: 0.7,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.bronze,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.bronze,
  },
  flex: {
    flex: 1,
  },
  note: {
    flexDirection: 'row',
    gap: space.xs,
    alignItems: 'flex-start',
  },
});
