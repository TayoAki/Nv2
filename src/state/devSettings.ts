import { create } from 'zustand';

/**
 * Demo tools (scenario switcher, sample-data reset, simulated price change) are for
 * development and automated tests only. Off unless the build sets EXPO_PUBLIC_DEMO_TOOLS=true,
 * so beta and store builds never show them.
 */
export const demoToolsEnabled = process.env.EXPO_PUBLIC_DEMO_TOOLS === 'true';

/**
 * Demo scenarios let reviewers see every required alternative state from the screen index
 * without a backend. Only used by the mock API.
 */
export type DemoScenario = 'normal' | 'slow' | 'timeout' | 'ai_failure' | 'quota' | 'payment_failure' | 'offline';

export const DEMO_SCENARIOS: { value: DemoScenario; label: string; description: string }[] = [
  { value: 'normal', label: 'Normal', description: 'Everything succeeds.' },
  { value: 'slow', label: 'Slow AI', description: 'Previews take longer and show the "still processing" state.' },
  { value: 'timeout', label: 'Preview times out', description: 'Previews stall, then stop with the "taking too long" state.' },
  {
    value: 'ai_failure',
    label: 'AI failures',
    description: 'Previews fail quality checks, the stylist is unavailable, photo imports partly fail.',
  },
  { value: 'quota', label: 'Preview limit reached', description: 'New previews hit the fair-use allowance.' },
  { value: 'payment_failure', label: 'Payment fails', description: 'Store checkout returns a failed payment.' },
  { value: 'offline', label: 'Offline', description: 'Every request fails with a network error.' },
];

type DevSettings = {
  scenario: DemoScenario;
  setScenario: (scenario: DemoScenario) => void;
};

export const useDevSettings = create<DevSettings>((set) => ({
  scenario: 'normal',
  setScenario: (scenario) => set({ scenario }),
}));
