import type { Image } from '../images';

export type Category = 'jackets' | 'waistcoats' | 'shirts' | 'knitwear' | 'trousers' | 'shoes' | 'accessories';

export type DetectedItem = {
  name: string;
  category: Category;
  colour: string;
  pattern: string;
  material: string;
  formality: 'formal' | 'smart-casual' | 'casual';
  confidence: number;
  box: { x: number; y: number; width: number; height: number };
};

export type RenderResult = { image: Image; costUsd: number | null };

/** Why a provider call failed. Permanent failures settle immediately instead of using retries. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
    readonly code: 'moderation' | 'bad_request' | 'no_credit' | 'rate_limited' | 'timeout' | 'upstream' = 'upstream',
    readonly status?: number,
  ) {
    super(message);
  }
}

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };

export type ToolDefinition = {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export interface AiProvider {
  readonly name: 'openrouter' | 'simulated';
  render(input: { prompt: string; person: Image; garments: Image[]; quality: 'medium' | 'high' }): Promise<RenderResult>;
  detect(photo: Image): Promise<DetectedItem[]>;
  cutout(crop: Image, name: string): Promise<Image>;
  embed(texts: string[]): Promise<number[][]>;
  /** One chat turn with tools. Not available when simulated (the app uses its own stylist). */
  chat?(messages: ChatMessage[], tools: ToolDefinition[]): Promise<{ content: string | null; toolCalls: ToolCall[] }>;
}
