import { env } from './env';
import { HttpError } from './errors';

/**
 * Body measurements from a front and a side photo. The photos are passed straight to the
 * measurement service and never stored or logged; only the numbers come back.
 */

const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const recent = new Map<string, number[]>();

function recentAttempts(deviceId: string): number[] {
  const hourAgo = Date.now() - 60 * 60 * 1000;
  const times = (recent.get(deviceId) ?? []).filter((t) => t > hourAgo);
  recent.set(deviceId, times);
  return times;
}

/** Only attempts the service actually measured (or explained) count: an outage costs nothing. */
function countAttempt(deviceId: string) {
  recentAttempts(deviceId).push(Date.now());
}

export type MeasurementResult = {
  heightCm: number;
  measurementsCm: Record<string, number>;
  suggestedSizes: Record<string, string | number | null>;
  calibrated: boolean;
};

export async function measureBody(deviceId: string, form: Record<string, unknown>): Promise<MeasurementResult> {
  if (!env.measureUrl || !env.measureToken) throw new HttpError('unavailable', "Measuring isn't available yet.");
  const front = form.front;
  const side = form.side;
  const heightCm = Number(form.heightCm);
  if (!(front instanceof File) || !(side instanceof File)) throw new HttpError('validation', 'Add a front photo and a side photo.');
  if (front.size > MAX_PHOTO_BYTES || side.size > MAX_PHOTO_BYTES) throw new HttpError('validation', 'Use photos under 12 MB.');
  if (!Number.isFinite(heightCm) || heightCm < 120 || heightCm > 230) throw new HttpError('validation', 'Enter your height between 120 and 230 cm.');
  if (recentAttempts(deviceId).length >= env.measurementsPerHour) {
    throw new HttpError('quota', "You've measured a few times already. Try again in an hour.");
  }

  const body = new FormData();
  body.set('front', front, 'front');
  body.set('side', side, 'side');
  body.set('heightCm', String(heightCm));

  let response: Response;
  try {
    response = await fetch(`${env.measureUrl}/measure`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.measureToken}` },
      body,
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new HttpError('unavailable', "Measuring isn't available right now. Please try again in a moment.");
  }
  const result = await response.json().catch(() => null);
  if (response.ok || response.status === 422) countAttempt(deviceId);
  if (response.status === 422 && result?.error?.message) {
    // The photo can't be measured: the message says what to change ("Hold your arms out…").
    throw new HttpError('validation', String(result.error.message));
  }
  if (!response.ok || !result?.measurementsCm) {
    throw new HttpError('unavailable', "Measuring isn't available right now. Please try again in a moment.");
  }
  return {
    heightCm: result.heightCm,
    measurementsCm: result.measurementsCm,
    suggestedSizes: result.suggestedSizes,
    calibrated: !!result.calibrated,
  };
}
