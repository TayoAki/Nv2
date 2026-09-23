import { serve } from '@hono/node-server';

import { createApp } from './app';
import { ensureBootstrapAdmin, prepareAuth } from './auth';
import { migrate, pool } from './db';
import { env } from './env';

await migrate();
await prepareAuth();
await ensureBootstrapAdmin();

const server = serve({ fetch: createApp().fetch, port: env.port }, (info) => {
  console.log(`Nyoni server listening on port ${info.port}`);
});

// Railway sends SIGTERM on redeploy: finish in-flight requests, then close the pool.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
  });
}
