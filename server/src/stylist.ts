import { z } from 'zod';

import { aiProvider, type ChatMessage, type ToolDefinition } from './ai';
import { currentCatalog } from './catalog';
import { env } from './env';
import { HttpError } from './errors';

const OCCASIONS = ['business', 'dinner', 'wedding', 'everyday', 'black-tie'] as const;
const MAX_TURNS = 4;

export const stylistRequestSchema = z.object({
  text: z.string().trim().min(1).max(500),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(1000) }))
    .max(12)
    .default([]),
  closet: z
    .array(
      z.object({
        id: z.string().max(80),
        name: z.string().max(120),
        category: z.string().max(20),
        kind: z.string().max(20),
        colour: z.string().max(40).nullable(),
        pattern: z.string().max(40).nullable(),
        available: z.boolean(),
      }),
    )
    .max(300),
  ownedOnly: z.boolean(),
  focusItemId: z.string().max(80).optional(),
  profile: z.object({
    occasions: z.array(z.string().max(20)).max(5),
    styleDirection: z.string().max(20),
    budgetMinor: z.number().int().nullable(),
  }),
});

export type StylistRequest = z.infer<typeof stylistRequestSchema>;

export type StylistResponse =
  | {
      status: 'ok';
      reply: string;
      outfit: { title: string; occasion: (typeof OCCASIONS)[number]; explanation: string; itemIds: string[]; complementProductId: string | null; focusItemId: string | null };
    }
  | { status: 'sparse_closet' | 'no_match'; reply: string; suggestedProductId: string | null };

const TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'search_catalog',
      description: 'Search in-stock Nyoni Couture products for an optional add-on (only when the member allows store suggestions).',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['suits', 'tuxedos', 'jackets', 'waistcoats', 'trousers', 'shoes', 'accessories'] },
          occasion: { type: 'string', enum: [...OCCASIONS] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_outfit',
      description: "Propose one outfit from the member's closet. Use only closet item ids you were given.",
      parameters: {
        type: 'object',
        required: ['title', 'occasion', 'itemIds', 'explanation', 'reply'],
        properties: {
          title: { type: 'string', description: 'Short, e.g. "Your dinner look".' },
          occasion: { type: 'string', enum: [...OCCASIONS] },
          itemIds: { type: 'array', items: { type: 'string' }, description: 'Closet item ids, outer layer first.' },
          complementProductId: { type: ['string', 'null'], description: 'Optional Nyoni product id from search_catalog.' },
          explanation: { type: 'string', description: 'One sentence on why the colours and pieces work.' },
          reply: { type: 'string', description: 'One or two friendly sentences to the member.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'report_no_match',
      description: "Use when the closet can't make a suitable outfit for the request.",
      parameters: {
        type: 'object',
        required: ['reason', 'reply'],
        properties: {
          reason: { type: 'string', enum: ['sparse_closet', 'no_match'] },
          reply: { type: 'string' },
          suggestedProductId: { type: ['string', 'null'] },
        },
      },
    },
  },
];

function systemPrompt(input: StylistRequest) {
  const closet = input.closet
    .filter((item) => item.available)
    .map((item) => `- ${item.id}: ${item.name} (${item.kind}; ${[item.colour, item.pattern].filter(Boolean).join(', ') || 'no colour recorded'})`)
    .join('\n');
  return `You are the Nyoni Couture stylist: warm, brief and precise, for menswear tailoring.
Build outfits only from the member's available closet pieces listed below, by id. Never invent pieces.

Rules:
- A suit is worn whole: it covers jacket and trousers. Don't add separate trousers to a suit.
- An outfit needs an outer layer or suit, trousers (unless a suit), and shoes when the closet has them. Add a waistcoat, pocket square or belt when it helps the occasion.
- Neutrals (navy, charcoal, grey, black, white, ivory, taupe) pair freely. Keep a clear difference in lightness between jacket and trousers unless they are a matched suit.
- Avoid near-miss matches (two slightly different navies). At most one bold colour or strong pattern per outfit.
- Keep formality consistent. Black tie needs a tuxedo or formal pieces; never pass a blazer off as black tie.
- ${
    input.ownedOnly
      ? 'The member wants owned items only: do not suggest store products.'
      : 'You may add one optional Nyoni add-on found with search_catalog, if it genuinely helps. An add-on must bring something the outfit lacks, never a second piece of a type it already has (no second pocket square, belt or pair of shoes).'
  }
- ${
    input.ownedOnly
      ? 'If the closet cannot meet the request, call report_no_match and say what is missing.'
      : 'If the closet cannot meet the request (for example black tie without a tuxedo), call search_catalog for the piece that would solve it, then call report_no_match with that product as suggestedProductId.'
  }
- Style direction: ${input.profile.styleDirection}. Usual occasions: ${input.profile.occasions.join(', ') || 'not set'}.${input.profile.budgetMinor ? ` Budget per add-on: $${(input.profile.budgetMinor / 100).toFixed(0)}.` : ''}
${input.focusItemId ? `- Build the outfit around closet item ${input.focusItemId}.` : ''}
Always finish by calling propose_outfit or report_no_match.

Closet (available):
${closet || '(empty)'}`;
}

const stylistUse = new Map<string, number[]>();

/** Messages per device per hour (in memory: the API runs as one instance). */
export function allowStylistMessage(deviceId: string): boolean {
  const hourAgo = Date.now() - 60 * 60 * 1000;
  const recent = (stylistUse.get(deviceId) ?? []).filter((t) => t > hourAgo);
  if (recent.length >= env.stylistPerHour) return false;
  recent.push(Date.now());
  stylistUse.set(deviceId, recent);
  return true;
}

export async function recommend(input: StylistRequest): Promise<StylistResponse> {
  const provider = aiProvider();
  if (!provider.chat) throw new HttpError('unavailable', "The AI stylist isn't connected yet.");

  const available = new Map(input.closet.filter((item) => item.available).map((item) => [item.id, item]));
  if (available.size < 3) {
    return {
      status: 'sparse_closet',
      reply: `I can only see ${available.size} available piece${available.size === 1 ? '' : 's'} in your closet. Add a jacket, trousers and shoes and I'll build complete outfits.`,
      suggestedProductId: null,
    };
  }

  const catalog = await currentCatalog();
  const inStock = catalog.filter((p) => p.variants.some((v) => v.stock !== 'out_of_stock'));
  const withinBudget = (price: number) => input.profile.budgetMinor == null || price <= input.profile.budgetMinor;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt(input) },
    ...input.history.map((m) => ({ role: m.role, content: m.text }) as ChatMessage),
    { role: 'user', content: input.text },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn += 1) {
    const { content, toolCalls } = await provider.chat(messages, TOOLS);
    if (toolCalls.length === 0) {
      return { status: 'no_match', reply: content?.trim() || "I couldn't build a look for that. Try asking for an occasion.", suggestedProductId: null };
    }
    messages.push({ role: 'assistant', content, tool_calls: toolCalls });
    for (const call of toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch {
        messages.push({ role: 'tool', tool_call_id: call.id, content: 'Error: arguments were not valid JSON.' });
        continue;
      }

      if (call.function.name === 'search_catalog') {
        const results = inStock
          .filter((p) => !args.category || p.category === args.category)
          .filter((p) => !args.occasion || p.occasions.includes(args.occasion as never))
          .filter((p) => withinBudget(p.price.amountMinor))
          .slice(0, 12)
          .map((p) => ({ id: p.id, title: p.title, category: p.category, colour: p.color.name, pattern: p.pieces[0]?.pattern, price: `$${p.price.amountMinor / 100}` }));
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(input.ownedOnly ? [] : results) });
        continue;
      }

      if (call.function.name === 'report_no_match') {
        const suggested = typeof args.suggestedProductId === 'string' && !input.ownedOnly && inStock.some((p) => p.id === args.suggestedProductId) ? (args.suggestedProductId as string) : null;
        return { status: args.reason === 'sparse_closet' ? 'sparse_closet' : 'no_match', reply: String(args.reply ?? ''), suggestedProductId: suggested };
      }

      if (call.function.name === 'propose_outfit') {
        const problem = checkOutfit(args, available, input, inStock, withinBudget);
        if (problem) {
          messages.push({ role: 'tool', tool_call_id: call.id, content: `Rejected: ${problem} Fix it and call propose_outfit again.` });
          continue;
        }
        const itemIds = [...new Set(args.itemIds as string[])];
        return {
          status: 'ok',
          reply: String(args.reply),
          outfit: {
            title: String(args.title).slice(0, 60),
            occasion: args.occasion as (typeof OCCASIONS)[number],
            explanation: String(args.explanation).slice(0, 200),
            itemIds,
            complementProductId: (args.complementProductId as string | null) ?? null,
            focusItemId: input.focusItemId && itemIds.includes(input.focusItemId) ? input.focusItemId : null,
          },
        };
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: 'Error: unknown tool.' });
    }
  }
  return { status: 'no_match', reply: "I couldn't put together a look I'm confident in. Try asking in a different way.", suggestedProductId: null };
}

/** Every proposal is checked before a shopper sees it. Returns a problem to send back, or null. */
function checkOutfit(
  args: Record<string, unknown>,
  available: Map<string, StylistRequest['closet'][number]>,
  input: StylistRequest,
  inStock: { id: string; price: { amountMinor: number } }[],
  withinBudget: (price: number) => boolean,
): string | null {
  if (!OCCASIONS.includes(args.occasion as never)) return 'occasion must be one of the listed values.';
  const ids = Array.isArray(args.itemIds) ? (args.itemIds as unknown[]).filter((v): v is string => typeof v === 'string') : [];
  if (ids.length === 0) return 'itemIds is empty.';
  const unknown = ids.filter((id) => !available.has(id));
  if (unknown.length) return `these ids are not available closet pieces: ${unknown.join(', ')}.`;
  const pieces = ids.map((id) => available.get(id)!);
  const suit = pieces.some((p) => p.kind === 'suit');
  if (suit && pieces.some((p) => p.kind === 'trousers')) return 'a suit is worn whole; remove the separate trousers.';
  if (!suit && !pieces.some((p) => p.kind === 'trousers')) return 'add trousers (or use a suit).';
  if (pieces.length < (suit ? 2 : 3)) return 'the outfit needs more pieces (outer layer, trousers and shoes).';
  if (input.focusItemId && available.has(input.focusItemId) && !ids.includes(input.focusItemId)) return `the outfit must include ${input.focusItemId}.`;
  const complement = args.complementProductId;
  if (complement != null) {
    if (input.ownedOnly) return 'the member wants owned items only; set complementProductId to null.';
    const product = inStock.find((p) => p.id === complement);
    if (!product) return 'complementProductId must come from search_catalog results.';
    if (!withinBudget(product.price.amountMinor)) return 'that add-on is over the budget.';
  }
  if (typeof args.reply !== 'string' || typeof args.explanation !== 'string' || typeof args.title !== 'string') return 'title, explanation and reply are required.';
  return null;
}
