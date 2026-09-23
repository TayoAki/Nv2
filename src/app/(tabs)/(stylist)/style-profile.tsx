import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { errorMessage, isNetworkError, type Occasion, type StyleDirection, type StyleProfile } from '@/api';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { OutfitCollage } from '@/components/media/OutfitCollage';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Banner, StateView } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/TextField';
import { ToggleRow } from '@/components/ui/Toggle';
import { useWardrobe } from '@/data/closet';
import { useStyleProfile, useUpdateStyleProfile } from '@/data/stylist';
import { confirm } from '@/lib/confirm';
import { OCCASION_LABELS } from '@/lib/format';
import { showToast } from '@/state/toast';
import { colors, space } from '@/theme';

const OCCASIONS: Occasion[] = ['business', 'dinner', 'wedding', 'everyday', 'black-tie'];
const DIRECTIONS: { value: StyleDirection; label: string }[] = [
  { value: 'classic', label: 'Classic' },
  { value: 'relaxed', label: 'Relaxed' },
  { value: 'statement', label: 'Statement' },
];

/** 17 · Style preferences — /style-profile */
export default function StyleProfileScreen() {
  const profile = useStyleProfile();

  return (
    <Screen header={<AppHeader left="back" fallbackHref="/stylist" />} contentStyle={styles.content}>
      {profile.isPending ? (
        <StateView kind="loading" title="Loading your preferences" />
      ) : profile.isError || !profile.data ? (
        <StateView
          kind={isNetworkError(profile.error) ? 'offline' : 'error'}
          actionLabel="Try again"
          onAction={() => profile.refetch()}
        />
      ) : (
        <PreferencesForm key={profile.data.updatedAt} profile={profile.data} />
      )}
    </Screen>
  );
}

function PreferencesForm({ profile }: { profile: StyleProfile }) {
  const navigation = useNavigation();
  const wardrobe = useWardrobe();
  const update = useUpdateStyleProfile();

  const initialBudget = profile.budget ? String(profile.budget.amountMinor / 100) : '';
  const [occasions, setOccasions] = useState<Occasion[]>(profile.occasions);
  const [direction, setDirection] = useState<StyleDirection>(profile.styleDirection);
  const [budget, setBudget] = useState(initialBudget);
  const [ownedFirst, setOwnedFirst] = useState(profile.ownedFirst);
  const [city, setCity] = useState(profile.city ?? '');
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const dirty =
    occasions.slice().sort().join() !== profile.occasions.slice().sort().join() ||
    direction !== profile.styleDirection ||
    budget.trim() !== initialBudget ||
    ownedFirst !== profile.ownedFirst ||
    city.trim() !== (profile.city ?? '');

  // Unsaved changes: confirm before leaving the screen.
  usePreventRemove(dirty && !update.isPending, ({ data }) => {
    confirm({
      title: 'Discard your changes?',
      message: "Your style preferences haven't been saved.",
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
      destructive: true,
    }).then((discard) => {
      if (discard) navigation.dispatch(data.action);
    });
  });

  const toggleOccasion = (value: Occasion) =>
    setOccasions((current) => (current.includes(value) ? current.filter((o) => o !== value) : [...current, value]));

  const save = () => {
    setSaveError(null);
    const trimmed = budget.trim().replace(/[$,\s]/g, '');
    let budgetMinor: number | null = null;
    if (trimmed) {
      if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
        setBudgetError('Enter an amount in dollars, like 500, or leave it blank.');
        return;
      }
      budgetMinor = Math.round(Number(trimmed) * 100);
    }
    setBudgetError(null);
    update.mutate(
      { occasions, styleDirection: direction, budgetMinor, ownedFirst, city: city.trim() || null },
      {
        onSuccess: () => showToast('Preferences saved'),
        onError: (error) => setSaveError(errorMessage(error)),
      },
    );
  };

  const collage = (wardrobe.data ?? [])
    .filter((item) => !item.archived)
    .slice(0, 5)
    .map((item) => ({ key: item.id, kind: item.kind, colorHex: item.color?.hex, image: item.image, name: item.name }));

  return (
    <View style={styles.form}>
      <AppText variant="display" align="center" accessibilityRole="header">
        Your style, <AppText variant="display" color={colors.bronze}>your rules.</AppText>
      </AppText>

      {collage.length >= 3 ? <OutfitCollage pieces={collage} layout="row" aspectRatio={2.6} /> : null}

      <Section title="Occasions" hint="What you dress for most. Choose any.">
        <View style={styles.chips}>
          {OCCASIONS.map((value) => (
            <Chip
              key={value}
              label={OCCASION_LABELS[value]}
              selected={occasions.includes(value)}
              selectedTone="gold"
              onPress={() => toggleOccasion(value)}
              style={styles.chip}
            />
          ))}
        </View>
      </Section>

      <Section title="Style direction">
        <View style={styles.chips} accessibilityRole="radiogroup">
          {DIRECTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={direction === option.value}
              selectedTone="gold"
              onPress={() => setDirection(option.value)}
              style={[styles.chip, styles.directionChip]}
            />
          ))}
        </View>
      </Section>

      <Section title="Shopping budget" hint="Optional budget per new outfit">
        <TextField
          prefix="$"
          value={budget}
          onChangeText={(value) => {
            setBudget(value);
            setBudgetError(null);
          }}
          keyboardType="decimal-pad"
          placeholder=""
          accessibilityLabel="Shopping budget in dollars"
          error={budgetError}
          hint={budgetError ? undefined : 'Nyoni suggestions stay within this amount. Leave blank for no limit.'}
        />
      </Section>

      <ToggleRow
        label="Use owned pieces first"
        labelVariant="heading"
        value={ownedFirst}
        onValueChange={setOwnedFirst}
        accessibilityLabel="Use owned pieces first"
      />

      <Section title="City" hint="Add a city for weather suggestions (optional)">
        <TextField
          icon="mapPin"
          value={city}
          onChangeText={setCity}
          placeholder="Enter a city"
          autoCapitalize="words"
          autoComplete="off"
          accessibilityLabel="City for weather suggestions"
        />
        {city.trim() ? (
          <Banner
            tone="info"
            icon="info"
            message="Live weather isn't connected yet. Your stylist will ask about the weather or say what it's assuming."
          />
        ) : null}
      </Section>

      {saveError ? <Banner tone="error" message={saveError} /> : null}
      <Button title={dirty ? 'Save preferences' : 'Preferences saved'} onPress={save} disabled={!dirty} loading={update.isPending} />
      <AppText variant="caption" color={colors.muted} align="center">
        Preferences are only what you choose here. Nothing is inferred from your photos.
      </AppText>
    </View>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View>
        <AppText variant="heading" accessibilityRole="header">
          {title}
        </AppText>
        {hint ? (
          <AppText variant="secondary" color={colors.muted}>
            {hint}
          </AppText>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: space.xs,
  },
  form: {
    gap: space.lg,
  },
  section: {
    gap: space.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  chip: {
    minWidth: 96,
  },
  directionChip: {
    flexGrow: 1,
  },
});
