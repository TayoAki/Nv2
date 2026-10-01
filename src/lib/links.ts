import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { Platform } from 'react-native';

import { track } from './analytics';

/**
 * Store destinations. The store keeps ownership of fittings, contact, checkout and the legal
 * pages. Fittings are booked on Nyoni's Square booking site. TODO(F01): confirm a dedicated
 * contact page URL; until then it opens the store home page.
 */
export const STORE_URL = 'https://nyonicouture.com/';
export const STORE_HOST = 'nyonicouture.com';

export const links = {
  bookFitting: 'https://nyoni-couture.square.site/',
  contact: STORE_URL,
  privacyPolicy: 'https://nyonicouture.com/privacy-policy/',
  terms: 'https://nyonicouture.com/terms-and-conditions/',
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
