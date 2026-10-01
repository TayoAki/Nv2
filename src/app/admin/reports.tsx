import { Image } from 'expo-image';
import { Redirect } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { errorMessage, isApiError, isNetworkError, type AdminReport } from '@/api';
import { AdminGate } from '@/components/admin/AdminGate';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StateView } from '@/components/ui/Feedback';
import { useAdminReports, useMarkReportReviewed } from '@/data/admin';
import { showToast } from '@/state/toast';
import { colors, radius, space } from '@/theme';

const REASONS: Record<string, string> = {
  offensive: 'Offensive or inappropriate',
  identity: 'Face, skin tone or body changed',
  body: 'Body changed',
  garment: 'Garment looks wrong',
  incomplete: 'Parts of the garment missing',
  quality: 'Blurry or distorted',
  other: 'Something else',
};

/** Store admin · preview reports — /admin/reports. Google Play requires acting on these. */
export default function AdminReportsScreen() {
  return (
    <AdminGate>
      <Reports />
    </AdminGate>
  );
}

function Reports() {
  const reports = useAdminReports();
  if (isApiError(reports.error) && reports.error.code === 'unauthorized') return <Redirect href="/admin/login" />;

  return (
    <Screen header={<AppHeader left="back" fallbackHref="/admin" title="Preview reports" />}>
      <View style={styles.body}>
        <AppText variant="body" color={colors.muted}>
          Shoppers report AI previews that look wrong or offensive. The reported image is kept for 7 days for review.
        </AppText>
        {reports.isPending ? (
          <StateView kind="loading" title="Loading reports" />
        ) : reports.isError ? (
          <StateView kind={isNetworkError(reports.error) ? 'offline' : 'error'} message={errorMessage(reports.error)} actionLabel="Try again" onAction={() => reports.refetch()} />
        ) : reports.data.length === 0 ? (
          <StateView kind="empty" icon="checkCircle" title="No reports" message="Nothing has been reported." />
        ) : (
          reports.data.map((report) => <ReportCard key={report.id} report={report} />)
        )}
      </View>
    </Screen>
  );
}

function ReportCard({ report }: { report: AdminReport }) {
  const mark = useMarkReportReviewed();
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        {report.imageUrl ? (
          <Image source={{ uri: report.imageUrl }} style={styles.image} contentFit="cover" accessibilityLabel="Reported preview" />
        ) : (
          <View style={[styles.image, styles.noImage]}>
            <AppText variant="caption" color={colors.muted} align="center">
              Image expired
            </AppText>
          </View>
        )}
        <View style={styles.text}>
          <Badge label={report.status === 'open' ? 'Open' : 'Reviewed'} tone={report.status === 'open' ? 'notice' : 'success'} />
          <AppText variant="heading">{REASONS[report.reason] ?? report.reason}</AppText>
          {report.subject ? (
            <AppText variant="secondary" color={colors.muted}>
              {report.subject}
            </AppText>
          ) : null}
          <AppText variant="caption" color={colors.muted}>
            {new Date(report.createdAt).toLocaleString()}
          </AppText>
          {report.status === 'open' ? (
            <Button
              title="Mark reviewed"
              size="sm"
              variant="outline"
              fullWidth={false}
              loading={mark.isPending}
              onPress={() => mark.mutate(report.id, { onError: (err) => showToast(errorMessage(err), { tone: 'error' }) })}
            />
          ) : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: space.md,
    paddingTop: space.sm,
  },
  card: {
    gap: space.sm,
  },
  row: {
    flexDirection: 'row',
    gap: space.md,
  },
  image: {
    width: 96,
    aspectRatio: 2 / 3,
    borderRadius: radius.control,
    backgroundColor: colors.surfaceSunken,
  },
  noImage: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xs,
  },
  text: {
    flex: 1,
    gap: space.xxs,
    alignItems: 'flex-start',
  },
});
