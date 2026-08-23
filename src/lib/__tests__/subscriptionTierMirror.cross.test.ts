/**
 * Cross-consistency test for the effective-tier rule.
 *
 * Two hand-written copies decide whether a user is Pro:
 *
 *   client  `getSubscriptionInfo`      src/lib/subscription.ts
 *   server  `computeEffectiveTier`     functions/helpers.js
 *
 * The server copy is the one that spends money. It gates the AI-scan quota
 * (`aiScanQuota.js` → Vertex), `planRunningRoute` (Mapbox Directions), and —
 * via `calorieTargetResolution` — which calorie target the performance engine
 * scores adherence against. The client copy decides what the user is OFFERED.
 * Drift in either direction is bad in a different way: the UI promising a
 * scan the server refuses, or hiding one it would have allowed, or a tier
 * disagreement silently rescoring adherence against the wrong target.
 *
 * The server's header says "mirrors client getSubscriptionInfo" and nothing
 * enforced it — the same "kept in lockstep by a comment" shape ADR-0008
 * exists for. `helpers.test.js` covers the server copy alone, which proves
 * the server is self-consistent and says nothing about agreement.
 *
 * ── Comparing them takes care in two places ──────────────────────────
 *
 * 1. `tier` is the WRONG field to compare. During a trial the client returns
 *    `{ tier: "free", isPro: true }` — it keeps `tier` for billing-state copy
 *    ("you're on a trial", not "you're a subscriber") and expresses access
 *    through `isPro`. The server returns the bare string `"pro"`. So the
 *    comparable projection is `client.isPro ↔ server === "pro"`, and pinning
 *    the same-named field would fail on every trialing user. Asserted below
 *    so the trap is a test rather than a comment.
 *
 * 2. The client has no clock seam. The server takes `now`; the client reads
 *    the ambient clock, TWICE (`Date.now()` in the subscription branch,
 *    `new Date()` in the trial branch). Fake timers freeze both and hand the
 *    same instant to the server, which is how you test the RULE. The
 *    double-read is a separate, real observation: under a live clock a
 *    subscription expiring between the two reads is evaluated against two
 *    different instants. It is sub-millisecond and harmless today; it is
 *    also why this test cannot be written without `vi.setSystemTime`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "node:module";
import { getSubscriptionInfo } from "../subscription";
import type { UserProfile } from "../auth";

const require_ = createRequire(import.meta.url);
// helpers.js requires firebase-admin lazily inside functions, so pulling the
// pure predicate out needs no admin init.
const { computeEffectiveTier } = require_("../../../functions/helpers") as {
  computeEffectiveTier: (userData: unknown, now?: Date) => "free" | "pro";
};

/** Frozen "now" for every case. Arbitrary, but fixed so failures reproduce. */
const NOW = new Date("2026-08-22T12:00:00.000Z");
const NOW_MS = NOW.getTime();
const DAY = 86_400_000;

const iso = (ms: number) => new Date(ms).toISOString();

/**
 * Every timestamp shape the field can actually hold, named so a failure
 * message says WHICH case disagreed rather than printing a bare ISO string.
 *
 * `exactlyNow` is the one that matters most: the two branches deliberately
 * disagree on the boundary (subscription uses `>=`, trial uses `>`), so a
 * tidy-up that "made them consistent" on one side only would show up here
 * and nowhere else.
 */
const STAMPS: [string, string | null | undefined][] = [
  ["absent", undefined],
  ["null", null],
  ["empty string", ""],
  ["unparseable", "not-a-date"],
  ["long past", iso(NOW_MS - 400 * DAY)],
  ["yesterday", iso(NOW_MS - DAY)],
  ["exactlyNow", iso(NOW_MS)],
  ["tomorrow", iso(NOW_MS + DAY)],
  ["far future", iso(NOW_MS + 400 * DAY)],
];

const TIERS: [string, UserProfile["subscriptionTier"] | undefined][] = [
  ["absent", undefined],
  ["free", "free"],
  ["pro", "pro"],
];

/** The client takes a full profile; only these three fields are read. */
function profileOf(
  tier: UserProfile["subscriptionTier"] | undefined,
  subExpires: string | null | undefined,
  trialExpires: string | null | undefined
): UserProfile {
  return {
    subscriptionTier: tier,
    subscriptionExpiresAt: subExpires,
    trialExpiresAt: trialExpires,
  } as unknown as UserProfile;
}

describe("effective tier — client getSubscriptionInfo ↔ server computeEffectiveTier", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("agrees on Pro access across every (tier × subExpiry × trialExpiry) case", () => {
    const disagreements: string[] = [];
    let cases = 0;
    for (const [tierName, tier] of TIERS) {
      for (const [subName, subExpires] of STAMPS) {
        for (const [trialName, trialExpires] of STAMPS) {
          cases += 1;
          const doc = {
            subscriptionTier: tier,
            subscriptionExpiresAt: subExpires,
            trialExpiresAt: trialExpires,
          };
          const client = getSubscriptionInfo(
            profileOf(tier, subExpires, trialExpires)
          );
          const server = computeEffectiveTier(doc, NOW);
          if (client.isPro !== (server === "pro")) {
            disagreements.push(
              `tier=${tierName} sub=${subName} trial=${trialName} — ` +
                `client.isPro=${client.isPro} server=${server}`
            );
          }
        }
      }
    }
    // Guard the loop itself: an empty matrix would pass vacuously.
    expect(cases).toBe(TIERS.length * STAMPS.length * STAMPS.length);
    expect(
      disagreements,
      "client and server disagree on Pro access. Both copies must change " +
        "together — the server is the one that spends money."
    ).toEqual([]);
  });

  it("the absent-profile case agrees (client takes null, server takes null/undefined)", () => {
    expect(getSubscriptionInfo(null).isPro).toBe(false);
    expect(computeEffectiveTier(null, NOW)).toBe("free");
    expect(computeEffectiveTier(undefined, NOW)).toBe("free");
  });

  it("`tier` is NOT the comparable field — a trialing user is tier:'free', isPro:true", () => {
    // The trap this cross-test would fall into if it compared same-named
    // fields. Pinned so a future edit that "simplifies" the client to return
    // tier:"pro" during a trial has to come here and think about the billing
    // copy that reads `tier` (ProModal, Upgrade, AdaptiveSummary).
    const trialing = profileOf("free", null, iso(NOW_MS + 3 * DAY));
    const client = getSubscriptionInfo(trialing);
    expect(client.tier).toBe("free");
    expect(client.isInTrial).toBe(true);
    expect(client.isPro).toBe(true);
    expect(
      computeEffectiveTier(
        { subscriptionTier: "free", trialExpiresAt: iso(NOW_MS + 3 * DAY) },
        NOW
      )
    ).toBe("pro");
  });

  it("pins the boundary asymmetry both copies share", () => {
    // Subscription expiry uses `>=` (expiring exactly now is still Pro);
    // trial expiry uses `>` (a trial ending exactly now is over). The two
    // branches genuinely differ, on BOTH copies. Neither is obviously
    // wrong — a paid entitlement should not evaporate on its own timestamp,
    // and a trial's last instant is its end — but the difference is
    // invisible without this test, so a "make these consistent" edit would
    // be a one-sided guess.
    const atNow = iso(NOW_MS);

    const paidAtBoundary = {
      subscriptionTier: "pro",
      subscriptionExpiresAt: atNow,
    };
    expect(computeEffectiveTier(paidAtBoundary, NOW)).toBe("pro");
    expect(getSubscriptionInfo(profileOf("pro", atNow, null)).isPro).toBe(true);

    const trialAtBoundary = { trialExpiresAt: atNow };
    expect(computeEffectiveTier(trialAtBoundary, NOW)).toBe("free");
    expect(getSubscriptionInfo(profileOf("free", null, atNow)).isPro).toBe(
      false
    );
  });

  it("an expired paid tier falls through to a live trial on both copies", () => {
    // The dropped-webhook case the defence-in-depth exists for: tier is
    // still "pro" in the doc, the entitlement has elapsed, and the user
    // happens to have trial time left. Both must land on Pro-via-trial
    // rather than short-circuiting at the stale tier.
    const doc = {
      subscriptionTier: "pro",
      subscriptionExpiresAt: iso(NOW_MS - DAY),
      trialExpiresAt: iso(NOW_MS + DAY),
    };
    expect(computeEffectiveTier(doc, NOW)).toBe("pro");
    const client = getSubscriptionInfo(
      profileOf("pro", iso(NOW_MS - DAY), iso(NOW_MS + DAY))
    );
    expect(client.isPro).toBe(true);
    expect(client.isInTrial).toBe(true);
  });

  it("an unparseable expiry keeps the paid tier on both copies (legacy / lifetime)", () => {
    // Absent or unparseable = legacy doc, dev override, or lifetime. Both
    // copies fall THROUGH to Pro rather than failing closed, which is the
    // deliberate call — failing closed here would strip lifetime buyers.
    for (const raw of [undefined, null, "", "not-a-date"]) {
      const doc = { subscriptionTier: "pro", subscriptionExpiresAt: raw };
      expect(computeEffectiveTier(doc, NOW), `raw=${String(raw)}`).toBe("pro");
      expect(
        getSubscriptionInfo(profileOf("pro", raw, null)).isPro,
        `raw=${String(raw)}`
      ).toBe(true);
    }
  });
});
