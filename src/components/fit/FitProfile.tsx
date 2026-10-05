import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { BodyMeasurementName, BodyMeasurements } from '@/api';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, Divider } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Feedback';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useDeleteBodyMeasurements } from '@/data/measurements';
import { confirm } from '@/lib/confirm';
import { formatLength, MEASUREMENT_LABELS } from '@/lib/sizing';
import { showToast } from '@/state/toast';
import { colors, space } from '@/theme';

const ORDER: BodyMeasurementName[] = [
  'chest', 'waist', 'trouserWaist', 'hips', 'neck', 'shoulderWidth', 'sleeve', 'inseam', 'outseam', 'thigh',
];

/**
 * A shopper's measurements and suggested sizes (Scan tab and the photo-upload route).
 * `children` are the screen's own actions, shown above the delete link.
 */
export function FitProfile({ body, title = 'Your measurements', children }: { body: BodyMeasurements; title?: string; children?: React.ReactNode }) {
  const [unit, setUnit] = useState<'cm' | 'in'>('in');
  const remove = useDeleteBodyMeasurements();
  const sizes = body.suggestedSizes;

  const onDelete = async () => {
    const ok = await confirm({
      title: 'Delete your measurements?',
      message: 'Size suggestions stop until you scan again.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (ok) remove.mutate(undefined, { onSuccess: () => showToast('Measurements deleted') });
  };

  return (
    <View style={styles.body}>
      <View style={styles.heading}>
        <AppText variant="title" align="center" accessibilityRole="header">
          {title}
        </AppText>
        <View style={styles.badges}>
          <Badge label="Estimated from your photos" tone="ai" icon="sparkle" />
          {body.isDemo ? <Badge label="Sample values" tone="notice" /> : null}
        </View>
        <AppText variant="caption" color={colors.muted} align="center">
          Measured {new Date(body.measuredAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
        </AppText>
      </View>

      {body.isDemo ? (
        <Banner
          tone="notice"
          message="This demo build has no measuring service, so these are sample values for your height, not measured from your photos."
        />
      ) : null}

      <Card style={styles.sizes}>
        <AppText variant="overline" color={colors.bronze}>
          Suggested sizes
        </AppText>
        <SizeRow label="Suit and jacket" value={sizes.jacketAlternative ? `${sizes.jacket} or ${sizes.jacketAlternative}` : sizes.jacket} />
        <SizeRow
          label="Trousers"
          value={`${sizes.trouserWaistIn}${sizes.trouserWaistAlternative ? ` or ${sizes.trouserWaistAlternative}` : ''} waist · ${sizes.inseamIn} inseam`}
        />
        {sizes.jacketAlternative || sizes.trouserWaistAlternative ? (
          <AppText variant="secondary" color={colors.bronze}>
            You’re right between two sizes. Try both, or book a fitting to choose.
          </AppText>
        ) : null}
        {sizes.shirtNeckIn ? <SizeRow label="Shirt" value={`${sizes.shirtNeckIn} neck · ${sizes.shirtSleeveIn} sleeve`} /> : null}
        <AppText variant="caption" color={colors.muted}>
          You’ll see these marked “For you” on product pages. You always choose the size.
        </AppText>
      </Card>

      <View style={styles.section}>
        <View style={styles.listHeader}>
          <AppText variant="heading">Body</AppText>
          <SegmentedControl
            accessibilityLabel="Measurement units"
            options={[
              { value: 'in', label: 'in' },
              { value: 'cm', label: 'cm' },
            ]}
            value={unit}
            onChange={setUnit}
            style={styles.unitToggle}
          />
        </View>
        <Card padded={false}>
          <View style={styles.measureRow}>
            <AppText variant="body">Height</AppText>
            <AppText variant="bodyStrong">{formatLength(body.heightCm, unit)}</AppText>
          </View>
          {ORDER.filter((name) => body.measurementsCm[name] != null).map((name) => (
            <View key={name}>
              <Divider />
              <View style={styles.measureRow}>
                <AppText variant="body">{MEASUREMENT_LABELS[name]}</AppText>
                <AppText variant="bodyStrong">{formatLength(body.measurementsCm[name]!, unit)}</AppText>
              </View>
            </View>
          ))}
        </Card>
        <AppText variant="caption" color={colors.muted}>
          Estimates from photos, not a tailor’s fitting. Confirm with a tape measure or a fitting before alterations.
          {body.calibrated ? '' : ' Early version: accuracy is still being checked against tape measurements.'}
        </AppText>
      </View>

      {children}
      <Button title="Delete my measurements" variant="link" tone="muted" onPress={onDelete} loading={remove.isPending} />
    </View>
  );
}

function SizeRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.sizeRow}>
      <AppText variant="body" color={colors.muted}>
        {label}
      </AppText>
      <AppText variant="heading">{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: space.lg,
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
  sizes: {
    gap: space.sm,
  },
  sizeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: space.sm,
  },
  section: {
    gap: space.sm,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  unitToggle: {
    width: 130,
  },
  measureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
});
