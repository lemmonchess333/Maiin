/**
 * Permission before food goes to AI — client and server read one answer.
 *
 * src/lib/aiConsent.ts decides whether the app sends a meal photo or a
 * typed meal to Gemini; functions/lib/aiConsent.js decides whether
 * analyzeFood / analyzeFoodText answer. Both read `aiAnalysisEnabled`. If
 * they read it differently, one of two things happens and neither looks
 * like a bug: the app sends what the server then refuses (a scan that
 * always fails), or the server answers for an account whose owner said no
 * on another device. The refusal's reason is the contract the client maps
 * to a plain message, so it is pinned here too.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { AI_ANALYSIS_OFF_REASON, aiConsentStatus } from "@/lib/aiConsent";

const require = createRequire(import.meta.url);
const server = require("../../../functions/lib/aiConsent.js");

describe("AI analysis permission — client and server agree", () => {
  it("refuse exactly the answers the client treats as off", () => {
    const stored: (boolean | null | undefined)[] = [
      true,
      false,
      undefined,
      null,
    ];
    const verdicts = stored.map((value) => ({
      value,
      clientOff: aiConsentStatus(value) === "off",
      serverRefuses: server.aiAnalysisRefused(
        value === undefined ? {} : { aiAnalysisEnabled: value }
      ),
    }));
    // Anchor: one of these is a refusal, so the comparison is not vacuous.
    expect(verdicts.filter((v) => v.serverRefuses)).toHaveLength(1);
    for (const v of verdicts) expect(v.serverRefuses).toBe(v.clientOff);
  });

  it("let a missing user document through, as the client treats it as not asked", () => {
    expect(aiConsentStatus(undefined)).toBe("unasked");
    expect(server.aiAnalysisRefused(null)).toBe(false);
  });

  it("use the same refusal reason", () => {
    expect(server.AI_ANALYSIS_DISABLED).toBe(AI_ANALYSIS_OFF_REASON);
  });
});
