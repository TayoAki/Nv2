import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { exchangeLoginToken, type StoreMemberView } from './ai';
import { ApiError } from './errors';
import { http, readStored, serverUrl, writeStored } from './server';

/**
 * "Sign in with Nyoni": the store's own login page (nyonicouture.com, Nyoni App Bridge plugin)
 * opens in a browser, the shopper signs in or registers there, and the store sends them back
 * with a two-minute token that the server exchanges for a member session.
 */

const MEMBER_KEY = 'nyoni.member-token';
const STATE_KEY = 'nyoni.signin-state';

export type StoreStatus = { signIn: boolean; checkout: boolean; storeUrl: string };

let statusCache: { value: StoreStatus | null; at: number } | null = null;

/** Which store features are live. Null without a server or when it can't be reached. */
export async function storeStatus(): Promise<StoreStatus | null> {
  if (!serverUrl) return null;
  if (statusCache && Date.now() - statusCache.at < 60_000) return statusCache.value;
  try {
    const value = await http<StoreStatus>('/v1/store/status');
    statusCache = { value, at: Date.now() };
    return value;
  } catch {
    statusCache = { value: null, at: Date.now() - 50_000 };
    return null;
  }
}

export const memberToken = () => readStored(MEMBER_KEY);

/** Where the store sends the shopper back: nyonicouture://auth in the app, /auth on the web. */
const returnUrl = () => Linking.createURL('auth');

/** One exchange per sign-in, even if the redirect arrives twice (deep link and browser result). */
const exchanges = new Map<string, Promise<StoreMemberView>>();

/** Finishes a sign-in from the URL the store redirected to. */
export async function finishSignIn(url: string): Promise<StoreMemberView> {
  const { queryParams } = Linking.parse(url);
  const token = typeof queryParams?.token === 'string' ? queryParams.token : '';
  const state = typeof queryParams?.state === 'string' ? queryParams.state : '';
  if (!token || !state) throw new ApiError('validation', 'The sign-in didn’t finish. Try again.');
  const running = exchanges.get(state);
  if (running) return running;
  const exchange = (async () => {
    // The state must be the one this app started, so a link from someone else can't sign us in.
    if ((await readStored(STATE_KEY)) !== state) throw new ApiError('expired', 'This sign-in has expired. Sign in again.');
    const result = await exchangeLoginToken(token, state);
    await writeStored(MEMBER_KEY, result.sessionToken);
    await writeStored(STATE_KEY, null);
    return result.member;
  })();
  exchanges.set(state, exchange);
  return exchange;
}

/** Opens the store's login page and waits for the shopper to come back signed in. */
export async function signInWithNyoni(): Promise<'signed_in' | 'cancelled'> {
  const status = await storeStatus();
  if (!status?.signIn) throw new ApiError('unavailable', 'Signing in with your Nyoni account isn’t available yet.');
  const state = Crypto.randomUUID().replace(/-/g, '');
  await writeStored(STATE_KEY, state);
  const back = returnUrl();
  const loginUrl = `${status.storeUrl}/nyoni-app-login/?state=${state}&return=${encodeURIComponent(back)}`;
  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    result = await WebBrowser.openAuthSessionAsync(loginUrl, back);
  } catch (error) {
    // A blocked pop-up on the web: go to the login page in this tab; /auth finishes the sign-in.
    if (Platform.OS !== 'web') throw error;
    window.location.assign(loginUrl);
    return 'cancelled';
  }
  if (result.type === 'success') {
    await finishSignIn(result.url);
    return 'signed_in';
  }
  // On Android the redirect can arrive as a deep link (the /auth screen) instead.
  const pending = exchanges.get(state);
  if (pending) {
    await pending;
    return 'signed_in';
  }
  return (await memberToken()) ? 'signed_in' : 'cancelled';
}

/** The signed-in member's profile, Club status and purchases; null when signed out. */
export async function getMember(): Promise<StoreMemberView | null> {
  const token = await memberToken();
  if (!token) return null;
  try {
    return await http<StoreMemberView>('/v1/me', { member: token });
  } catch (error) {
    if (error instanceof ApiError && error.code === 'unauthorized') {
      await writeStored(MEMBER_KEY, null);
      return null;
    }
    throw error;
  }
}

export async function signOutMember() {
  const token = await memberToken();
  if (token) await http<void>('/v1/me/session', { method: 'DELETE', member: token }).catch(() => undefined);
  await writeStored(MEMBER_KEY, null);
}

/** Deletes the app server's copy of the account; Nyoni erases the store account. */
export async function deleteMemberAccount() {
  const token = await memberToken();
  if (!token) return;
  await http<void>('/v1/me', { method: 'DELETE', member: token });
  await writeStored(MEMBER_KEY, null);
}
