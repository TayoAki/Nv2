import type { Money, Occasion } from '@/api';

/** Formats integer minor units in the store's currency. Whole amounts drop the cents. */
export function formatMoney(money: Money): string {
  const major = money.amountMinor / 100;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: money.currency,
      minimumFractionDigits: Number.isInteger(major) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(major);
  } catch {
    return `${money.currency} ${major.toFixed(2)}`;
  }
}

export const OCCASION_LABELS: Record<Occasion, string> = {
  wedding: 'Wedding',
  business: 'Business',
  'black-tie': 'Black tie',
  dinner: 'Dinner',
  everyday: 'Everyday',
};

export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** "Expires in 3 days" / "Expires today" / "Expired". */
export function expiryLabel(expiresAt: string, now = Date.now()): string {
  const ms = Date.parse(expiresAt) - now;
  if (ms <= 0) return 'Expired';
  const days = Math.floor(ms / 864e5);
  if (days >= 1) return `Expires in ${pluralize(days, 'day')}`;
  const hours = Math.max(1, Math.floor(ms / 36e5));
  return `Expires in ${pluralize(hours, 'hour')}`;
}

export function timeLabel(isoDate: string): string {
  return new Date(isoDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
