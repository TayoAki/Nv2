import { createHmac, timingSafeEqual } from 'node:crypto';

import { env } from '../env';
import { HttpError } from '../errors';

/**
 * Signatures shared with the Nyoni App Bridge plugin and WooCommerce. Every secret is used as
 * text: the plugin's 64-character hex secret is a text key, not hex-decoded bytes.
 */

const hmac = (secret: string, data: string) => createHmac('sha256', secret).update(data).digest();

function sameBytes(a: Buffer, b: Buffer) {
  return a.length === b.length && timingSafeEqual(a, b);
}

function bridgeSecret() {
  if (!env.bridgeSecret) throw new HttpError('unavailable', 'The store link isn’t set up yet.');
  return env.bridgeSecret;
}

/** Bridge events are at most 5 minutes old (or early), so a captured request can't be replayed later. */
export const MAX_EVENT_AGE_SECONDS = 300;

/** `X-Nyoni-Signature`: base64( HMAC-SHA256( secret, timestamp + "." + raw body ) ). */
export function verifyBridgeEvent(rawBody: string, timestamp: string | undefined, signature: string | undefined, now = Date.now()) {
  const secret = bridgeSecret();
  if (!timestamp || !/^\d{1,12}$/.test(timestamp) || !signature) throw new HttpError('unauthorized', 'Missing signature.');
  if (Math.abs(now / 1000 - Number(timestamp)) > MAX_EVENT_AGE_SECONDS) throw new HttpError('unauthorized', 'The event is too old.');
  const expected = hmac(secret, `${timestamp}.${rawBody}`);
  if (!sameBytes(Buffer.from(signature, 'base64'), expected)) throw new HttpError('unauthorized', 'Bad signature.');
}

/** `X-WC-Webhook-Signature`: base64( HMAC-SHA256( webhook secret, raw body ) ). */
export function verifyWebhook(rawBody: string, signature: string | undefined) {
  if (!env.wooWebhookSecret) throw new HttpError('unavailable', 'The store link isn’t set up yet.');
  if (!signature) throw new HttpError('unauthorized', 'Missing signature.');
  if (!sameBytes(Buffer.from(signature, 'base64'), hmac(env.wooWebhookSecret, rawBody))) {
    throw new HttpError('unauthorized', 'Bad signature.');
  }
}

export type LoginClaims = {
  sub: string;
  email?: string;
  given_name?: string;
  family_name?: string;
  state: string;
  exp: number;
  jti: string;
};

const SKEW_SECONDS = 30;
const fromBase64Url = (part: string) => Buffer.from(part, 'base64url');

/**
 * The plugin's login token: HS256, audience `nyoni-app`, issued by the store's home URL, a
 * string customer id in `sub`, the app's `state`, two minutes to live and a UUID `jti`. Single
 * use is enforced by the caller.
 */
export function verifyLoginToken(token: string, state: string, now = Date.now()): LoginClaims {
  const secret = bridgeSecret();
  const invalid = () => new HttpError('unauthorized', 'This sign-in link has expired. Sign in again.');
  const parts = token.split('.');
  if (parts.length !== 3) throw invalid();
  const [headerPart, payloadPart, signaturePart] = parts;
  let header: { alg?: string };
  let claims: Record<string, unknown>;
  try {
    header = JSON.parse(fromBase64Url(headerPart).toString('utf8'));
    claims = JSON.parse(fromBase64Url(payloadPart).toString('utf8'));
  } catch {
    throw invalid();
  }
  if (header.alg !== 'HS256') throw invalid();
  if (!sameBytes(fromBase64Url(signaturePart), hmac(secret, `${headerPart}.${payloadPart}`))) throw invalid();

  const seconds = now / 1000;
  const issuer = typeof claims.iss === 'string' ? claims.iss.replace(/\/+$/, '') : '';
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (issuer !== env.storeUrl) throw invalid();
  if (!audience.includes('nyoni-app')) throw invalid();
  if (typeof claims.sub !== 'string' || !/^\d{1,20}$/.test(claims.sub)) throw invalid();
  if (typeof claims.exp !== 'number' || claims.exp + SKEW_SECONDS < seconds) throw invalid();
  if (typeof claims.iat === 'number' && claims.iat - SKEW_SECONDS > seconds) throw invalid();
  // A two-minute token: refuse anything that claims to live much longer.
  if (typeof claims.iat === 'number' && claims.exp - claims.iat > 10 * 60) throw invalid();
  if (typeof claims.jti !== 'string' || !/^[0-9a-fA-F-]{16,64}$/.test(claims.jti)) throw invalid();
  if (typeof claims.state !== 'string' || claims.state !== state) throw invalid();
  return claims as unknown as LoginClaims;
}

/** The plugin's /nyoni-checkout/ fallback: sig = base64url( HMAC-SHA256( secret, "items=…&nyoni_app=…" ) ). */
export function signCheckout(items: string, ref: string) {
  return hmac(bridgeSecret(), `items=${items}&nyoni_app=${ref}`).toString('base64url');
}
