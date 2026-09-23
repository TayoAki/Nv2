import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { Platform } from 'react-native';

import { track } from './analytics';

/**
 * Store destinations. The store (nyonicouture.com) keeps ownership of fittings, contact and
 * checkout. TODO(F01): confirm the exact booking and contact URLs with the store owner.
 */
export const STORE_URL = 'https://nyonicouture.com/';
export const STORE_HOST = 'nyonicouture.com';

export const links = {
  bookFitting: STORE_URL,
  contact: STORE_URL,
  privacyPolicy: STORE_URL,
};

export async function openExternal(url: string) {
  if (Platform.OS === 'web') {
    window.open(url, '_blank', 'noopener');
    return;
  }
  await openBrowserAsync(url, { presentationStyle: WebBrowserPresentationStyle.AUTOMATIC });
}

export function openBookFitting(productId?: string) {
  track('fitting_link_opened', { productId });
  return openExternal(links.bookFitting);
}
