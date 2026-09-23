/**
 * Measurement events from plan section 11. Payloads carry opaque IDs only: never photos,
 * image URLs, face features, chat text or signed URLs.
 */
export type AnalyticsEvent =
  | 'product_view'
  | 'tryon_started'
  | 'tryon_succeeded'
  | 'tryon_failed'
  | 'preview_viewed'
  | 'preview_saved'
  | 'variant_selected'
  | 'add_to_bag'
  | 'checkout_started'
  | 'order_paid'
  | 'fitting_link_opened'
  | 'closet_item_saved'
  | 'outfit_saved'
  | 'stylist_request';

type Props = Record<string, string | number | boolean | undefined>;

const FORBIDDEN = /uri|url|photo|image|text|email/i;

export function track(event: AnalyticsEvent, props: Props = {}) {
  const safe = Object.fromEntries(Object.entries(props).filter(([key]) => !FORBIDDEN.test(key)));
  if (__DEV__) {
    console.log(`[analytics] ${event}`, safe);
  }
  // TODO: forward `safe` to the analytics provider chosen for the pilot.
}
