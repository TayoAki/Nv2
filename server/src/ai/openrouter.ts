import { env } from '../env';
import { dataUrl, trimTransparent, type Image } from '../images';
import { cutoutPrompt, DETECT_INSTRUCTIONS } from '../prompts';
import { ProviderError, type AiProvider, type ChatMessage, type DetectedItem, type ToolDefinition } from './provider';

const TIMEOUT_MS = { image: 180_000, chat: 60_000, embed: 30_000 };

/** One HTTP call, no retries: retries belong to the job queue so they show in the app's progress. */
async function call<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${env.openRouterBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.openRouterKey}`,
        'content-type': 'application/json',
        'http-referer': env.appUrl,
        'x-title': 'Nyoni Couture',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = (error as Error).name === 'AbortError';
    throw new ProviderError(aborted ? 'The model took too long to answer.' : 'Could not reach OpenRouter.', false, aborted ? 'timeout' : 'upstream');
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  if (!response.ok) throw classify(response.status, text);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ProviderError('OpenRouter returned an unreadable response.', false, 'upstream', response.status);
  }
}

function classify(status: number, body: string): ProviderError {
  const message = (() => {
    try {
      return JSON.parse(body)?.error?.message ?? body;
    } catch {
      return body;
    }
  })().slice(0, 300);
  if (/moderat|safety|policy|flagged/i.test(message)) return new ProviderError(message, true, 'moderation', status);
  // A missing, expired or revoked key, or no OpenRouter credit: nothing the shopper can fix.
  if (status === 401 || status === 403) return new ProviderError(message, true, 'unavailable', status);
  if (status === 402) return new ProviderError(message, true, 'no_credit', status);
  if (status === 408) return new ProviderError(message, false, 'timeout', status);
  if (status === 429) return new ProviderError(message, false, 'rate_limited', status);
  if (status >= 500) return new ProviderError(message, false, 'upstream', status);
  return new ProviderError(message, true, 'bad_request', status);
}

type ImagesResponse = { data?: { b64_json?: string; media_type?: string }[]; usage?: { cost?: number } };

function firstImage(response: ImagesResponse): { image: Image; costUsd: number | null } {
  const item = response.data?.[0];
  if (!item?.b64_json) throw new ProviderError('The model returned no image.', false, 'upstream');
  return {
    image: { buffer: Buffer.from(item.b64_json, 'base64'), contentType: item.media_type ?? 'image/png' },
    costUsd: typeof response.usage?.cost === 'number' ? response.usage.cost : null,
  };
}

const reference = (image: Image) => ({ type: 'image_url', image_url: { url: dataUrl(image) } });

const DETECT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      maxItems: 6,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'category', 'colour', 'pattern', 'material', 'formality', 'confidence', 'box'],
        properties: {
          name: { type: 'string' },
          category: { type: 'string', enum: ['jackets', 'waistcoats', 'shirts', 'knitwear', 'trousers', 'shoes', 'accessories'] },
          colour: { type: 'string' },
          pattern: { type: 'string' },
          material: { type: 'string' },
          formality: { type: 'string', enum: ['formal', 'smart-casual', 'casual'] },
          confidence: { type: 'number' },
          box: {
            type: 'object',
            additionalProperties: false,
            required: ['x', 'y', 'width', 'height'],
            properties: { x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' } },
          },
        },
      },
    },
  },
};

type ChatResponse = {
  choices?: { message?: { content?: string | null; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[] } }[];
};

export const openRouterProvider: AiProvider = {
  name: 'openrouter',

  async render({ prompt, person, garments, quality }) {
    // Up to 16 references: the member plus at most 15 garments (the endpoint's cap).
    // gpt-image-2 rejects input_fidelity, so it is never sent.
    const response = await call<ImagesResponse>(
      '/images',
      {
        model: env.models.render,
        prompt,
        input_references: [person, ...garments.slice(0, 15)].map(reference),
        aspect_ratio: '2:3',
        quality,
        background: 'opaque',
        output_format: 'png',
        n: 1,
      },
      TIMEOUT_MS.image,
    );
    return firstImage(response);
  },

  async detect(photo) {
    const response = await call<ChatResponse>(
      '/chat/completions',
      {
        model: env.models.vision,
        messages: [
          { role: 'system', content: DETECT_INSTRUCTIONS },
          { role: 'user', content: [{ type: 'text', text: 'List the clothing in this photo.' }, reference(photo)] },
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'closet_items', strict: true, schema: DETECT_SCHEMA } },
      },
      TIMEOUT_MS.chat,
    );
    const content = response.choices?.[0]?.message?.content;
    try {
      const parsed = JSON.parse(content ?? '{}') as { items?: DetectedItem[] };
      return (parsed.items ?? []).map(clampBox);
    } catch {
      throw new ProviderError('The model returned an unreadable item list.', false, 'upstream');
    }
  },

  async cutout(crop, name) {
    const request = (transparent: boolean) =>
      call<ImagesResponse>(
        '/images',
        {
          model: env.models.cutout,
          prompt: cutoutPrompt(name, transparent),
          input_references: [reference(crop)],
          aspect_ratio: '1:1',
          quality: 'medium',
          background: transparent ? 'transparent' : 'opaque',
          output_format: 'png',
          n: 1,
        },
        TIMEOUT_MS.image,
      );
    let response: ImagesResponse;
    try {
      response = await request(true);
    } catch (error) {
      // Transparent backgrounds aren't supported by every image model: retry once as opaque.
      if (error instanceof ProviderError && error.code === 'bad_request') response = await request(false);
      else throw error;
    }
    return trimTransparent(firstImage(response).image);
  },

  async embed(texts) {
    const response = await call<{ data?: { index: number; embedding: number[] }[] }>(
      '/embeddings',
      { model: env.models.embedding, input: texts },
      TIMEOUT_MS.embed,
    );
    const rows = [...(response.data ?? [])].sort((a, b) => a.index - b.index);
    if (rows.length !== texts.length) throw new ProviderError('Embeddings came back incomplete.', false, 'upstream');
    return rows.map((row) => row.embedding);
  },

  async chat(messages: ChatMessage[], tools: ToolDefinition[]) {
    const response = await call<ChatResponse>(
      '/chat/completions',
      { model: env.models.stylist, messages, tools, tool_choice: 'auto', temperature: 0.4 },
      TIMEOUT_MS.chat,
    );
    const message = response.choices?.[0]?.message;
    return { content: message?.content ?? null, toolCalls: message?.tool_calls ?? [] };
  },
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

function clampBox(item: DetectedItem): DetectedItem {
  const x = clamp01(item.box.x);
  const y = clamp01(item.box.y);
  return {
    ...item,
    confidence: clamp01(item.confidence),
    box: { x, y, width: clamp01(Math.min(item.box.width, 1 - x)), height: clamp01(Math.min(item.box.height, 1 - y)) },
  };
}
