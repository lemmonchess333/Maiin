import type { AiConsentGate } from "@/hooks/useAiConsent";

/**
 * The AI permission gate for an account that has already said yes, so the
 * call under test goes ahead without the question. Suites about the
 * question itself use the real `useAiConsent` (aiConsentGate.test.tsx).
 */
export const AI_ALLOWED: AiConsentGate = {
  status: "allowed",
  ensure: async () => "allowed",
  ask: async () => "allowed",
};
