import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';

import sharp from 'sharp';

// Test configuration must be set before the server modules read it.
process.env.DATABASE_URL ??= 'postgres://postgres@localhost:55432/nyoni_ai_test?host=/tmp';
process.env.RETRY_BASE_SECONDS = '0';
process.env.FREE_CREDITS = '10';
process.env.DEVICES_PER_HOUR = '1000';
delete process.env.OPENROUTER_API_KEY;

const { pool, migrate } = await import('../src/db');
const { createApp } = await import('../src/app');
const { env } = await import('../src/env');
const { processRenderQueue, isRenderQueueIdle } = await import('../src/renders');
const { processImportQueue, isImportQueueIdle } = await import('../src/ingest');

/* ---------------------------------------------------------------- a fake OpenRouter */

type Handler = (body: Record<string, unknown>) => { status?: number; json: unknown };
type Recorded = { path: string; body: Record<string, unknown> };

const recorded: Recorded[] = [];
const handlers = new Map<string, Handler[]>();
const fallback = new Map<string, Handler>();

/** Queue one-off responses for a path; when the queue is empty the fallback answers. */
const respond = (path: string, ...queue: Handler[]) => handlers.set(path, [...(handlers.get(path) ?? []), ...queue]);

let pngB64 = '';
const imageOk: Handler = () => ({ json: { data: [{ b64_json: pngB64, media_type: 'image/png' }], usage: { cost: 0.03 } } });
const error = (status: number, message: string): Handler => () => ({ status, json: { error: { message } } });

function vectorFor(text: string) {
  // Identical text gives identical vectors; different text gives near-orthogonal ones.
  const v = new Array(64).fill(0);
  for (const word of text.toLowerCase().split(/\W+/).filter(Boolean)) {
    let h = 0;
    for (const ch of word) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    v[h % 64] += 1;
  }
  return v;
}

fallback.set('/images', imageOk);
fallback.set('/embeddings', (body) => ({
  json: { data: (body.input as string[]).map((text, index) => ({ index, embedding: vectorFor(text) })) },
}));

const fake = createServer((req: IncomingMessage, res: ServerResponse) => {
  let raw = '';
  req.on('data', (chunk) => (raw += chunk));
  req.on('end', () => {
    const path = (req.url ?? '').replace(/^\/api\/v1/, '');
    const body = JSON.parse(raw || '{}');
    recorded.push({ path, body });
    const handler = handlers.get(path)?.shift() ?? fallback.get(path);
    const out = handler ? handler(body) : { status: 404, json: { error: { message: 'no handler' } } };
    res.writeHead(out.status ?? 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(out.json));
  });
});

/* ---------------------------------------------------------------- helpers */

const app = createApp();
const call = (path: string, init: RequestInit & { device?: string; json?: unknown } = {}) => {
  const headers = new Headers(init.headers);
  if (init.device) headers.set('authorization', `Device ${init.device}`);
  if (init.json !== undefined) headers.set('content-type', 'application/json');
  return app.request(path, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body });
};

const newDevice = async () => (await (await call('/v1/devices', { method: 'POST' })).json()).token as string;

const photo = (width: number, height: number, colour = { r: 30, g: 40, b: 90 }) =>
  sharp({ create: { width, height, channels: 3, background: colour } }).jpeg().toBuffer();

async function upload(device: string, kind: 'person' | 'closet', bytes: Buffer) {
  const res = await call(`/v1/uploads?kind=${kind}`, { method: 'POST', device, body: new Uint8Array(bytes), headers: { 'content-type': 'image/jpeg' } });
  assert.equal(res.status, 201, await res.clone().text());
  return res.json() as Promise<{ blobId: string; url: string; framing: string }>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs the job queues until nothing is queued or running. */
async function drain() {
  for (let i = 0; i < 400; i += 1) {
    await processRenderQueue();
    await processImportQueue();
    await sleep(10);
    const { rows } = await pool.query(
      "select (select count(*) from renders where status in ('queued','running')) + (select count(*) from imports where status in ('queued','running')) as n",
    );
    if (Number(rows[0].n) === 0 && isRenderQueueIdle() && isImportQueueIdle()) return;
  }
  throw new Error('queues did not drain');
}

const credits = async (device: string) => (await (await call('/v1/device', { device })).json()).credits as number;

const render = async (device: string, body: unknown) => {
  const res = await call('/v1/renders', { method: 'POST', device, json: body });
  return { status: res.status, body: await res.json() };
};

const NAVY_SUIT = { source: 'capsule', key: 'nyoni-nathan-jacket' } as const;
const BOOTS = { source: 'capsule', key: 'nyoni-antwerp-wing-tip' } as const;

before(async () => {
  pngB64 = (await sharp({ create: { width: 64, height: 96, channels: 3, background: { r: 200, g: 200, b: 200 } } }).png().toBuffer()).toString('base64');
  await new Promise<void>((resolve) => fake.listen(0, '127.0.0.1', resolve));
  env.openRouterBaseUrl = `http://127.0.0.1:${(fake.address() as AddressInfo).port}/api/v1`;
  await pool.query('drop schema public cascade; create schema public;');
  await migrate();
});
after(async () => {
  fake.close();
  await pool.end();
});
beforeEach(() => {
  recorded.length = 0;
  handlers.clear();
});

const useOpenRouter = () => (env.openRouterKey = 'test-key');
const useSimulated = () => (env.openRouterKey = null);

/* ---------------------------------------------------------------- tests */

describe('simulated provider', () => {
  before(useSimulated);

  it('reports its status', async () => {
    const status = await (await call('/v1/ai/status')).json();
    assert.deepEqual(status, { provider: 'simulated', features: { renders: true, imports: true, stylist: false } });
  });

  it('renders end to end, labelled simulated, charging credits', async () => {
    const device = await newDevice();
    assert.equal(await credits(device), 10);
    const person = await upload(device, 'person', await photo(600, 1200));
    assert.equal(person.framing, 'full');
    const created = await render(device, { personBlobId: person.blobId, garments: [NAVY_SUIT, BOOTS], count: 2 });
    assert.equal(created.status, 202);
    assert.equal(created.body.status, 'running');
    assert.equal(created.body.images.length, 2);
    assert.equal(await credits(device), 8);

    await drain();
    const view = await (await call(`/v1/renders/${created.body.id}`, { device })).json();
    assert.equal(view.status, 'done');
    assert.equal(view.simulated, true);
    assert.equal(view.creditsCharged, 2);
    for (const image of view.images) {
      const blob = await call(image.url);
      assert.equal(blob.status, 200);
      assert.equal(blob.headers.get('content-type'), 'image/png');
    }
    assert.equal(recorded.length, 0, 'no calls to OpenRouter');
  });

  it('keeps saved renders for 30 days', async () => {
    const device = await newDevice();
    const person = await upload(device, 'person', await photo(600, 1200));
    const created = await render(device, { personBlobId: person.blobId, garments: [BOOTS] });
    await drain();
    const kept = await (await call(`/v1/renders/${created.body.id}/keep`, { method: 'POST', device })).json();
    assert.equal(kept.kept, 1);
    const { rows } = await pool.query("select expires_at from blobs where kind = 'render' order by created_at desc limit 1");
    assert.ok(rows[0].expires_at.getTime() - Date.now() > 29 * 24 * 3600 * 1000);
  });

  it('imports with a low-confidence full-frame draft', async () => {
    const device = await newDevice();
    const shot = await upload(device, 'closet', await photo(800, 800, { r: 20, g: 30, b: 80 }));
    const created = await (await call('/v1/imports', { method: 'POST', device, json: { photoBlobIds: [shot.blobId] } })).json();
    await drain();
    const view = await (await call(`/v1/imports/${created.id}`, { device })).json();
    assert.equal(view.status, 'done');
    assert.equal(view.simulated, true);
    assert.equal(view.drafts.length, 1);
    assert.equal(view.drafts[0].confidence, 'low');
  });

  it('says the stylist is unavailable', async () => {
    const device = await newDevice();
    const res = await call('/v1/stylist', { method: 'POST', device, json: stylistBody({}) });
    assert.equal(res.status, 503);
  });
});

describe('render requests to OpenRouter', () => {
  before(useOpenRouter);

  it('sends the member and every garment as references, with the full prompt', async () => {
    const device = await newDevice();
    const person = await upload(device, 'person', await photo(600, 1200));
    const created = await render(device, {
      personBlobId: person.blobId,
      garments: [NAVY_SUIT, BOOTS, { source: 'text', name: 'white oxford shirt', kind: 'shirt' }],
      fit: 'slim',
    });
    assert.equal(created.status, 202, JSON.stringify(created.body));
    await drain();

    const calls = recorded.filter((r) => r.path === '/images');
    assert.equal(calls.length, 1);
    const body = calls[0].body;
    assert.equal(body.model, 'openai/gpt-image-2');
    assert.equal((body.input_references as unknown[]).length, 3, 'person + suit + boots');
    assert.equal(body.aspect_ratio, '2:3');
    assert.equal(body.quality, 'medium');
    assert.equal(body.background, 'opaque');
    assert.ok(!('input_fidelity' in body));
    const prompt = body.prompt as string;
    assert.match(prompt, /Image 2 is the Midnight Navy Three Piece Suit — worn as a matched jacket, waistcoat and trousers/);
    assert.match(prompt, /Image 3 is the Antwerp Wing-Tip Boot/);
    assert.match(prompt, /Also wearing: the white oxford shirt/);
    assert.doesNotMatch(prompt, /No shirt is provided/);
    assert.doesNotMatch(prompt, /No trousers are provided/);
    assert.match(prompt, /never anatomy/);
    assert.match(prompt, /head to toe/);

    const view = await (await call(`/v1/renders/${created.body.id}`, { device })).json();
    assert.equal(view.status, 'done');
    assert.equal(view.simulated, false);
    const { rows } = await pool.query('select cost_usd from renders where batch_id = $1', [created.body.id]);
    assert.equal(Number(rows[0].cost_usd), 0.03);
  });

  it('fills gaps and fixes headshot framing', async () => {
    const device = await newDevice();
    const person = await upload(device, 'person', await photo(800, 800));
    assert.equal(person.framing, 'cropped');
    await render(device, { personBlobId: person.blobId, garments: [{ source: 'capsule', key: 'nyoni-navy-aztec-blazer' }], quality: 'hq' });
    await drain();
    const body = recorded.find((r) => r.path === '/images')!.body;
    assert.equal(body.quality, 'high');
    const prompt = body.prompt as string;
    assert.match(prompt, /No shirt is provided/);
    assert.match(prompt, /No trousers are provided: add plain charcoal tailored trousers that suit the jacket/);
    assert.match(prompt, /No shoes are provided/);
    assert.match(prompt, /one seventh to one eighth/);
  });

  it('lets the model judge framing for an in-between portrait', async () => {
    const device = await newDevice();
    const person = await upload(device, 'person', await photo(800, 1200));
    assert.equal(person.framing, 'unknown');
    await render(device, { personBlobId: person.blobId, garments: [NAVY_SUIT] });
    await drain();
    const prompt = recorded.find((r) => r.path === '/images')!.body.prompt as string;
    assert.match(prompt, /If Image 1 does not show the whole body/);
    assert.match(prompt, /head to toe/);
  });

  it('retries a transient failure', async () => {
    const device = await newDevice();
    const person = await upload(device, 'person', await photo(600, 1200));
    respond('/images', error(500, 'upstream exploded'));
    const created = await render(device, { personBlobId: person.blobId, garments: [BOOTS] });
    await drain();
    const view = await (await call(`/v1/renders/${created.body.id}`, { device })).json();
    assert.equal(view.status, 'done');
    assert.equal(view.images[0].attempts, 2);
    assert.equal(await credits(device), 9);
  });

  it('fails moderation at once and refunds', async () => {
    const device = await newDevice();
    const person = await upload(device, 'person', await photo(600, 1200));
    respond('/images', error(400, 'Your request was rejected by the safety system'));
    const created = await render(device, { personBlobId: person.blobId, garments: [BOOTS] });
    await drain();
    const view = await (await call(`/v1/renders/${created.body.id}`, { device })).json();
    assert.equal(view.status, 'failed');
    assert.equal(view.images[0].attempts, 1);
    assert.equal(view.images[0].errorCode, 'moderation');
    assert.match(view.images[0].message, /can't be previewed/);
    assert.equal(view.creditsRefunded, 1);
    assert.equal(await credits(device), 10);
  });

  it('pauses previews when the key is rejected', async () => {
    const device = await newDevice();
    const person = await upload(device, 'person', await photo(600, 1200));
    respond('/images', error(401, 'API key expired.'));
    const created = await render(device, { personBlobId: person.blobId, garments: [BOOTS] });
    await drain();
    const view = await (await call(`/v1/renders/${created.body.id}`, { device })).json();
    assert.equal(view.status, 'failed');
    assert.equal(view.images[0].attempts, 1);
    assert.equal(view.images[0].errorCode, 'unavailable');
    assert.match(view.images[0].message, /paused/);
    assert.equal(await credits(device), 10);
  });

  it('gives up after three transient failures', async () => {
    const device = await newDevice();
    const person = await upload(device, 'person', await photo(600, 1200));
    respond('/images', error(503, 'busy'), error(503, 'busy'), error(503, 'busy'));
    const created = await render(device, { personBlobId: person.blobId, garments: [BOOTS] });
    await drain();
    const view = await (await call(`/v1/renders/${created.body.id}`, { device })).json();
    assert.equal(view.status, 'failed');
    assert.equal(view.images[0].attempts, 3);
    assert.equal(await credits(device), 10);
  });

  it('refunds only the failed image of a batch', async () => {
    const device = await newDevice();
    const person = await upload(device, 'person', await photo(600, 1200));
    respond('/images', error(400, 'flagged by moderation'));
    const created = await render(device, { personBlobId: person.blobId, garments: [BOOTS], count: 2, quality: 'hq' });
    assert.equal(await credits(device), 4);
    await drain();
    const view = await (await call(`/v1/renders/${created.body.id}`, { device })).json();
    assert.equal(view.status, 'partial');
    assert.equal(view.creditsCharged, 3);
    assert.equal(await credits(device), 7);
  });

  it('refuses a batch without enough credits', async () => {
    const device = await newDevice();
    const person = await upload(device, 'person', await photo(600, 1200));
    const res = await render(device, { personBlobId: person.blobId, garments: [BOOTS], count: 4, quality: 'hq' });
    assert.equal(res.status, 429);
    assert.equal(res.body.error.code, 'quota');
    assert.equal(await credits(device), 10);
  });

  it("won't use another device's photo", async () => {
    const owner = await newDevice();
    const other = await newDevice();
    const person = await upload(owner, 'person', await photo(600, 1200));
    const res = await render(other, { personBlobId: person.blobId, garments: [BOOTS] });
    assert.equal(res.status, 400);
    assert.equal(await credits(other), 10);
  });

  it('keeps spending bounded', async () => {
    // New devices per client address per hour.
    const limit = env.devicesPerHour;
    env.devicesPerHour = 2;
    const register = () => call('/v1/devices', { method: 'POST', headers: { 'x-forwarded-for': '198.51.100.44' } });
    assert.equal((await register()).status, 201);
    assert.equal((await register()).status, 201);
    const refused = await register();
    assert.equal(refused.status, 429);
    assert.equal((await refused.json()).error.code, 'quota');
    env.devicesPerHour = limit;

    // Preview images per day across everyone.
    const daily = env.dailyImageLimit;
    const device = await newDevice();
    const person = await upload(device, 'person', await photo(600, 1200));
    const { rows } = await pool.query("select count(*)::int as n from renders where created_at > now() - interval '24 hours'");
    env.dailyImageLimit = rows[0].n + 1;
    const res = await render(device, { personBlobId: person.blobId, garments: [BOOTS], count: 2 });
    assert.equal(res.status, 429);
    assert.match(res.body.error.message, /today's limit/);
    assert.equal(await credits(device), 10);
    env.dailyImageLimit = daily;
  });

  it('rejects unknown catalog pieces and unregistered devices', async () => {
    const device = await newDevice();
    const person = await upload(device, 'person', await photo(600, 1200));
    const res = await render(device, { personBlobId: person.blobId, garments: [{ source: 'capsule', key: 'nope' }] });
    assert.equal(res.status, 400);
    assert.equal((await call('/v1/device', { device: 'not-a-token' })).status, 401);
  });
});

describe('duplicate colour check', () => {
  it('measures colour distance in Lab', async () => {
    const { colourDistance } = await import('../src/ingest');
    assert.ok(colourDistance('#15171C', '#2B2E3A') < 20, 'photo navy vs catalogue navy');
    assert.ok(colourDistance('#1B1D27', '#B08A5B') > 20, 'navy vs camel');
    assert.ok(colourDistance('#15171C', '#B22222') > 20, 'navy vs red');
  });
});

describe('closet import with OpenRouter', () => {
  before(useOpenRouter);

  const detected = (items: unknown[]): Handler => () => ({ json: { choices: [{ message: { content: JSON.stringify({ items }) } }] } });
  const item = (name: string, category: string, x: number) => ({
    name,
    category,
    colour: name.split(' ')[0],
    pattern: 'solid',
    material: 'wool',
    formality: 'formal',
    confidence: 0.9,
    box: { x, y: 0.1, width: 0.4, height: 0.8 },
  });

  it('detects, cuts out, samples colour and flags duplicates', async () => {
    const device = await newDevice();
    const shot = await upload(device, 'closet', await photo(1000, 800, { r: 20, g: 30, b: 80 }));
    respond('/chat/completions', detected([item('Navy wool blazer', 'jackets', 0.05), item('Charcoal wool trousers', 'trousers', 0.55)]));
    // gpt-image-1 may refuse transparency on some routes: the first cut-out falls back to opaque.
    respond('/images', error(400, 'background transparent is not supported'));

    const existingText = 'navy solid wool navy wool blazer (jackets)';
    const existing = [
      // Same text but another colour, or another kind of garment: not duplicates.
      { id: 'w-red', text: existingText, category: 'jackets', hex: '#B22222' },
      { id: 'w-mine', text: existingText, category: 'jackets', hex: '#C6C6C6' }, // the fake cut-out is light grey
      { id: 'w-shoes', text: 'charcoal solid wool charcoal wool trousers (trousers)', category: 'shoes' },
    ];
    const created = await (await call('/v1/imports', { method: 'POST', device, json: { photoBlobIds: [shot.blobId], existing } })).json();
    await drain();
    const view = await (await call(`/v1/imports/${created.id}`, { device })).json();
    assert.equal(view.status, 'done', JSON.stringify(view));
    assert.equal(view.simulated, false);
    assert.equal(view.drafts.length, 2);

    const detect = recorded.find((r) => r.path === '/chat/completions')!.body;
    assert.equal(detect.model, 'openai/gpt-5-mini');
    assert.equal((detect.response_format as { type: string }).type, 'json_schema');

    const cutouts = recorded.filter((r) => r.path === '/images');
    // Cut-outs run in parallel: two transparent requests, and one opaque retry after the refusal.
    assert.deepEqual(cutouts.map((c) => c.body.background).sort(), ['opaque', 'transparent', 'transparent']);
    assert.ok(cutouts.every((c) => c.body.model === 'openai/gpt-image-1'));

    const [blazer, trousers] = view.drafts;
    assert.equal(blazer.duplicateOfItemId, 'w-mine');
    assert.equal(trousers.duplicateOfItemId, null);
    assert.equal(blazer.confidence, 'high');
    assert.ok(blazer.hexes.length >= 1);
    const cutout = await call(blazer.cutoutUrl);
    assert.equal(cutout.status, 200);
  });

  it('skips a photo the model refuses but keeps the rest', async () => {
    const device = await newDevice();
    const a = await upload(device, 'closet', await photo(800, 800));
    const b = await upload(device, 'closet', await photo(800, 800));
    respond('/chat/completions', error(400, 'content policy'), detected([item('Black leather boots', 'shoes', 0.2)]));
    const created = await (await call('/v1/imports', { method: 'POST', device, json: { photoBlobIds: [a.blobId, b.blobId] } })).json();
    await drain();
    const view = await (await call(`/v1/imports/${created.id}`, { device })).json();
    assert.equal(view.status, 'done');
    assert.equal(view.failedPhotoCount, 1);
    assert.equal(view.drafts.length, 1);
    assert.equal(view.drafts[0].photoIndex, 1);
  });

  it('fails when no photo has clothing', async () => {
    const device = await newDevice();
    const a = await upload(device, 'closet', await photo(800, 800));
    respond('/chat/completions', detected([]));
    const created = await (await call('/v1/imports', { method: 'POST', device, json: { photoBlobIds: [a.blobId] } })).json();
    await drain();
    const view = await (await call(`/v1/imports/${created.id}`, { device })).json();
    assert.equal(view.status, 'failed');
    assert.ok(view.message);
  });
});

/* ---------------------------------------------------------------- stylist */

const CLOSET = [
  { id: 'w-nathan', name: 'Midnight Navy Three Piece Suit', category: 'suits', kind: 'suit', colour: 'Midnight navy', pattern: 'Solid', available: true },
  { id: 'w-thomson-blazer', name: 'Thomson Blazer', category: 'jackets', kind: 'jacket', colour: 'Brown', pattern: 'Check', available: true },
  { id: 'w-taupe', name: 'Taupe Flat Front Tailored Dress Pants', category: 'trousers', kind: 'trousers', colour: 'Taupe', pattern: 'Solid', available: true },
  { id: 'w-antwerp', name: 'Antwerp Wing-Tip Boot', category: 'shoes', kind: 'shoes', colour: 'Brown', pattern: null, available: true },
  { id: 'w-away', name: 'Chelsea II Boot', category: 'shoes', kind: 'shoes', colour: 'Black', pattern: null, available: false },
];

function stylistBody(overrides: Record<string, unknown>) {
  return {
    text: 'Style me for dinner',
    history: [],
    closet: CLOSET,
    ownedOnly: false,
    profile: { occasions: ['dinner'], styleDirection: 'classic', budgetMinor: null },
    ...overrides,
  };
}

const toolCall = (name: string, args: unknown, id = `call_${name}`): Handler => () => ({
  json: { choices: [{ message: { content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] },
});

const proposal = (overrides: Record<string, unknown>) => ({
  title: 'Your dinner look',
  occasion: 'dinner',
  itemIds: ['w-thomson-blazer', 'w-taupe', 'w-antwerp'],
  complementProductId: null,
  explanation: 'Warm browns with taupe.',
  reply: 'Here is a relaxed dinner look.',
  ...overrides,
});

describe('stylist with OpenRouter', () => {
  before(useOpenRouter);

  it('checks proposals and sends problems back to the model', async () => {
    const device = await newDevice();
    respond(
      '/chat/completions',
      toolCall('propose_outfit', proposal({ itemIds: ['w-nathan', 'w-taupe', 'w-antwerp'] })),
      toolCall('propose_outfit', proposal({ itemIds: ['w-thomson-blazer', 'w-taupe', 'w-away'] })),
      toolCall('search_catalog', { category: 'accessories' }),
      toolCall('propose_outfit', proposal({ complementProductId: 'p-belagio-2' })),
    );
    const res = await call('/v1/stylist', { method: 'POST', device, json: stylistBody({}) });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok', JSON.stringify(body));
    assert.deepEqual(body.outfit.itemIds, ['w-thomson-blazer', 'w-taupe', 'w-antwerp']);
    assert.equal(body.outfit.complementProductId, 'p-belagio-2');

    const chats = recorded.filter((r) => r.path === '/chat/completions');
    assert.equal(chats.length, 4);
    assert.equal(chats[0].body.model, 'google/gemini-3.8-flash');
    const toolReplies = (chats[3].body.messages as { role: string; content: string }[]).filter((m) => m.role === 'tool');
    assert.match(toolReplies[0].content, /Rejected: a suit is worn whole/);
    assert.match(toolReplies[1].content, /Rejected: these ids are not available closet pieces: w-away/);
    assert.match(toolReplies[2].content, /p-belagio-2/);
    const system = (chats[0].body.messages as { role: string; content: string }[])[0].content;
    assert.match(system, /w-thomson-blazer: Thomson Blazer/);
    assert.doesNotMatch(system, /w-away/);
  });

  it('keeps to owned pieces when asked', async () => {
    const device = await newDevice();
    respond(
      '/chat/completions',
      toolCall('propose_outfit', proposal({ itemIds: ['w-nathan', 'w-antwerp'], complementProductId: 'p-belagio-2' })),
      toolCall('propose_outfit', proposal({ itemIds: ['w-nathan', 'w-antwerp'] })),
    );
    const body = await (await call('/v1/stylist', { method: 'POST', device, json: stylistBody({ ownedOnly: true, focusItemId: 'w-nathan' }) })).json();
    assert.equal(body.status, 'ok');
    assert.deepEqual(body.outfit.itemIds, ['w-nathan', 'w-antwerp']);
    assert.equal(body.outfit.complementProductId, null);
    assert.equal(body.outfit.focusItemId, 'w-nathan');
    const second = recorded.filter((r) => r.path === '/chat/completions')[1].body.messages as { role: string; content: string }[];
    assert.match(second.at(-1)!.content, /owned items only/);
  });

  it('answers a sparse closet without calling the model', async () => {
    const device = await newDevice();
    const body = await (await call('/v1/stylist', { method: 'POST', device, json: stylistBody({ closet: CLOSET.slice(0, 2) }) })).json();
    assert.equal(body.status, 'sparse_closet');
    assert.equal(recorded.length, 0);
  });

  it('passes on a no-match report', async () => {
    const device = await newDevice();
    respond('/chat/completions', toolCall('report_no_match', { reason: 'no_match', reply: 'Nothing black tie here.', suggestedProductId: 'p-opel-black-tux' }));
    const body = await (await call('/v1/stylist', { method: 'POST', device, json: stylistBody({ text: 'Black tie gala' }) })).json();
    assert.equal(body.status, 'no_match');
    assert.equal(body.reply, 'Nothing black tie here.');
  });
});
