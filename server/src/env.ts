function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 8080),
  databaseUrl: required('DATABASE_URL'),
  /** Bootstrap staff account. The password is set in Railway's variables, never in code. */
  adminEmail: process.env.ADMIN_EMAIL?.trim().toLowerCase() || null,
  adminPassword: process.env.ADMIN_PASSWORD || null,
  /** Comma-separated web origins allowed to call the API, or "*". */
  corsOrigins: (process.env.CORS_ORIGINS ?? '*').split(',').map((origin) => origin.trim()).filter(Boolean),
  /** OpenRouter powers renders, photo import and the stylist. Without it the server simulates them. */
  openRouterKey: process.env.OPENROUTER_API_KEY || null,
  openRouterBaseUrl: (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, ''),
  models: {
    render: process.env.OPENROUTER_RENDER_MODEL || 'openai/gpt-image-2',
    /** gpt-image-2 on OpenRouter has no transparent background, so cut-outs use gpt-image-1. */
    cutout: process.env.OPENROUTER_CUTOUT_MODEL || 'openai/gpt-image-1',
    vision: process.env.OPENROUTER_VISION_MODEL || 'openai/gpt-5-mini',
    embedding: process.env.OPENROUTER_EMBEDDING_MODEL || 'openai/text-embedding-3-small',
    stylist: process.env.OPENROUTER_STYLIST_MODEL || 'google/gemini-3.8-flash',
  },
  /** Credits a new device starts with (1 per standard image, 3 per HQ image). */
  freeCredits: Number(process.env.FREE_CREDITS ?? 10),
  /** Render batches a device may start per hour. */
  rendersPerHour: Number(process.env.RENDERS_PER_HOUR ?? 20),
  renderConcurrency: Number(process.env.RENDER_CONCURRENCY ?? 2),
  /*
   * Spending guards for a public app (each render is about $0.07 on OpenRouter): new devices
   * per client address per hour, preview images per day across everyone, and per-device
   * limits for photo imports and stylist messages.
   */
  devicesPerHour: Number(process.env.DEVICES_PER_HOUR ?? 5),
  dailyImageLimit: Number(process.env.DAILY_IMAGE_LIMIT ?? 300),
  importsPerHour: Number(process.env.IMPORTS_PER_HOUR ?? 10),
  stylistPerHour: Number(process.env.STYLIST_PER_HOUR ?? 60),
  /** Retry delay grows as base × attempts² seconds (5 s, 20 s, …). */
  retryBaseSeconds: Number(process.env.RETRY_BASE_SECONDS ?? 5),
  /** Where the capsule photos live (copied into the image from assets/collection). */
  collectionDir: process.env.COLLECTION_DIR || new URL('../../assets/collection/', import.meta.url).pathname,
  /** Public web app URL, sent to OpenRouter as the referring app. */
  appUrl: process.env.APP_URL || 'https://web-production-98e6c5.up.railway.app',
  /** Railway's internal Postgres URL has no TLS; public proxies do. */
  databaseSsl: process.env.DATABASE_SSL === 'true',
};
