import { env } from '../env';
import { openRouterProvider } from './openrouter';
import type { AiProvider } from './provider';
import { simulatedProvider } from './simulated';

/** OpenRouter when the key is set; otherwise the simulated provider. Read per call so tests can switch. */
export function aiProvider(): AiProvider {
  return env.openRouterKey ? openRouterProvider : simulatedProvider;
}

export * from './provider';
