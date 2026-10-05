import type { BodyMeasurements, BodyMeasurementName, Product, Variant } from '@/api';

/**
 * The size a shopper's measurements point to for a product. Only a suggestion: the app
 * marks it, and the shopper still chooses (plan: the size is never pre-selected).
 */
export function suggestedVariant(product: Product, body: BodyMeasurements | null | undefined): Variant | null {
  if (!body) return null;
  const code = suggestedCode(product, body);
  return code ? (product.variants.find((v) => v.size.code === code) ?? null) : null;
}

export function suggestedCode(product: Product, body: BodyMeasurements): string | null {
  switch (product.category) {
    case 'suits':
    case 'tuxedos':
    case 'jackets':
    case 'waistcoats':
      // US suit and jacket sizes follow the chest in inches (even sizes).
      return String(parseInt(body.suggestedSizes.jacket, 10));
    case 'trousers':
      return String(body.suggestedSizes.trouserWaistIn);
    default:
      return null; // shoes and accessories aren't sized from body measurements
  }
}

/** The neighbouring size when the shopper is right between two (or null). */
export function alternativeCode(product: Product, body: BodyMeasurements): string | null {
  switch (product.category) {
    case 'suits':
    case 'tuxedos':
    case 'jackets':
    case 'waistcoats':
      return body.suggestedSizes.jacketAlternative ? String(parseInt(body.suggestedSizes.jacketAlternative, 10)) : null;
    case 'trousers':
      return body.suggestedSizes.trouserWaistAlternative ? String(body.suggestedSizes.trouserWaistAlternative) : null;
    default:
      return null;
  }
}

export const MEASUREMENT_LABELS: Record<BodyMeasurementName, string> = {
  chest: 'Chest',
  waist: 'Waist (natural)',
  trouserWaist: 'Trouser waist',
  hips: 'Seat',
  neck: 'Neck',
  thigh: 'Thigh',
  shoulderWidth: 'Shoulders',
  sleeve: 'Sleeve',
  inseam: 'Inseam',
  outseam: 'Outseam',
};

export function formatLength(cm: number, unit: 'cm' | 'in'): string {
  return unit === 'cm' ? `${cm.toFixed(1)} cm` : `${(cm / 2.54).toFixed(1)} in`;
}
