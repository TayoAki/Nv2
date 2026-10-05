import { serve } from '@hono/node-server';

import { createApp } from './app';
import { ensureBootstrapAdmin, prepareAuth } from './auth';
import { deleteExpiredBlobs } from './blobs';
import { migrate, pool } from './db';
import { env } from './env';
import { processImportQueue, requeueStaleImports } from './ingest';
import { processRenderQueue, requeueStaleRenders } from './renders';

await migrate();
await prepareAuth();
await ensureBootstrapAdmin();

await requeueStaleRenders();
await requeueStaleImports();

// Background work: the render and import queues every second, expired images every hour.
const tick = setInterval(() => {
  processRenderQueue().catch((error) => console.error('render queue', error));
  processImportQueue().catch((error) => console.error('import queue', error));
}, 1000);
const sweep = setInterval(() => {
  deleteExpiredBlobs()
    .then((count) => count && console.log(`Deleted ${count} expired images`))
    .catch((error) => console.error('cleanup', error));
}, 60 * 60 * 1000);
console.log(`AI provider: ${env.openRouterKey ? 'openrouter' : 'simulated (set OPENROUTER_API_KEY to enable)'}`);

const server = serve({ fetch: createApp().fetch, port: env.port }, (info) => {
  console.log(`Nyoni server listening on port ${info.port}`);
});

// Railway sends SIGTERM on redeploy: finish in-flight requests, then close the pool.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    clearInterval(tick);
    clearInterval(sweep);
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
  });
}
