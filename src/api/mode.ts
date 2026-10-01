import { demoToolsEnabled } from '@/state/devSettings';

import { serverUrl } from './server';

/**
 * Demo mode: no server configured, or a development build with demo tools. Demo builds seed
 * a full sample shopper (closet, bag, looks, chat) and simulate checkout and sign-in.
 * Everything else (beta and store builds) starts as a guest with only an example closet,
 * and never shows simulated orders or sign-ins.
 */
export const demoMode = demoToolsEnabled || !serverUrl;
