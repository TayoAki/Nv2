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
  /** Railway's internal Postgres URL has no TLS; public proxies do. */
  databaseSsl: process.env.DATABASE_SSL === 'true',
};
