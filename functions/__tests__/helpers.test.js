/**
 * PR Q: unit tests for pure helpers extracted from index.js.
 * Imports `../helpers` rather than the index entrypoint so admin
 * SDK initialisation doesn't run during the test boot.
 *
 * Vitest requires ESM `import` for its own module, but helpers.js
 * is CommonJS — we use createRequire to import it cleanly without
 * dropping the rest of functions/ into ESM (which would require
 * editing every require() in index.js / appleIAP.js / etc.).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  pruneOldTimestamps,
  computeEffectiveTier,
  currentMonthCount,
  getStripePriceAllowlist,
  isAllowedStripeReturnUrl,
} = require("../helpers");

describe("pruneOldTimestamps", () => {
  it("keeps timestamps inside the window", () => {
    const now = 10_000;
    const result = pruneOldTimestamps([9_500, 9_800, 9_999], now, 1_000);
    expect(result).toEqual([9_500, 9_800, 9_999]);
  });

  it("drops timestamps outside the window", () => {
    const now = 10_000;
    const result = pruneOldTimestamps([8_000, 8_500, 9_900], now, 1_000);
    expect(result).toEqual([9_900]);
  });

  it("drops the boundary exactly at windowMs (now - t < windowMs is strict)", () => {
    // t = 9000 is exactly 1000ms old; predicate is `<`, not `<=`,
    // so this drops. The original docstring explicitly chose this
    // semantic so the rate limit clears one tick faster.
    const now = 10_000;
    const result = pruneOldTimestamps([9_000, 9_001], now, 1_000);
    expect(result).toEqual([9_001]);
  });

  it("returns [] for non-array input (defensive)", () => {
    expect(pruneOldTimestamps(undefined, 10_000, 1_000)).toEqual([]);
    expect(pruneOldTimestamps(null, 10_000, 1_000)).toEqual([]);
    expect(pruneOldTimestamps("nope", 10_000, 1_000)).toEqual([]);
  });

  it("filters out non-number entries (defensive)", () => {
    const result = pruneOldTimestamps(
      [9_500, "9500", null, undefined, 9_800],
      10_000,
      1_000,
    );
    expect(result).toEqual([9_500, 9_800]);
  });

  it("returns [] for an empty array", () => {
    expect(pruneOldTimestamps([], 10_000, 1_000)).toEqual([]);
  });
});

describe("computeEffectiveTier", () => {
  it("returns 'free' for null / undefined userData", () => {
    expect(computeEffectiveTier(null)).toBe("free");
    expect(computeEffectiveTier(undefined)).toBe("free");
  });

  it("returns 'pro' when subscriptionTier === 'pro'", () => {
    expect(computeEffectiveTier({ subscriptionTier: "pro" })).toBe("pro");
  });

  it("paid pro wins even when trial has expired", () => {
    expect(
      computeEffectiveTier({
        subscriptionTier: "pro",
        trialExpiresAt: "2020-01-01T00:00:00Z",
      }),
    ).toBe("pro");
  });

  it("returns 'pro' for an unexpired trial", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(
      computeEffectiveTier({ trialExpiresAt: future }, new Date()),
    ).toBe("pro");
  });

  it("returns 'free' for an expired trial", () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(
      computeEffectiveTier({ trialExpiresAt: past }, new Date()),
    ).toBe("free");
  });

  it("returns 'free' when trialExpiresAt is malformed", () => {
    expect(
      computeEffectiveTier({ trialExpiresAt: "not-a-date" }, new Date()),
    ).toBe("free");
  });

  it("returns 'free' when both fields are absent", () => {
    expect(computeEffectiveTier({})).toBe("free");
  });
});

describe("currentMonthCount", () => {
  it("returns 0 for null / undefined usage", () => {
    expect(currentMonthCount(null, "2026-05")).toBe(0);
    expect(currentMonthCount(undefined, "2026-05")).toBe(0);
  });

  it("returns 0 when the stored month differs (rollover)", () => {
    expect(currentMonthCount({ month: "2026-04", count: 9 }, "2026-05")).toBe(0);
  });

  it("returns the count when months match", () => {
    expect(currentMonthCount({ month: "2026-05", count: 7 }, "2026-05")).toBe(7);
  });

  it("coerces non-number count to 0 via Number()", () => {
    expect(currentMonthCount({ month: "2026-05", count: "5" }, "2026-05")).toBe(5);
    expect(currentMonthCount({ month: "2026-05", count: null }, "2026-05")).toBe(0);
    expect(currentMonthCount({ month: "2026-05", count: NaN }, "2026-05")).toBe(0);
  });
});

describe("getStripePriceAllowlist", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.STRIPE_PRICE_ID_MONTHLY;
    delete process.env.STRIPE_PRICE_ID_YEARLY;
    delete process.env.STRIPE_PRICE_ID_LIFETIME;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns empty object when no env vars set (fail-closed)", () => {
    expect(getStripePriceAllowlist()).toEqual({});
  });

  it("includes monthly when STRIPE_PRICE_ID_MONTHLY set", () => {
    process.env.STRIPE_PRICE_ID_MONTHLY = "price_monthly_abc";
    expect(getStripePriceAllowlist()).toEqual({
      price_monthly_abc: { kind: "monthly", mode: "subscription" },
    });
  });

  it("includes yearly + lifetime with correct modes", () => {
    process.env.STRIPE_PRICE_ID_YEARLY = "price_y";
    process.env.STRIPE_PRICE_ID_LIFETIME = "price_l";
    const allowlist = getStripePriceAllowlist();
    expect(allowlist.price_y).toEqual({ kind: "yearly", mode: "subscription" });
    expect(allowlist.price_l).toEqual({ kind: "lifetime", mode: "payment" });
  });

  it("includes all three when all env vars set", () => {
    process.env.STRIPE_PRICE_ID_MONTHLY = "m";
    process.env.STRIPE_PRICE_ID_YEARLY = "y";
    process.env.STRIPE_PRICE_ID_LIFETIME = "l";
    const allowlist = getStripePriceAllowlist();
    expect(Object.keys(allowlist).sort()).toEqual(["l", "m", "y"]);
  });

  it("reads env at call time (not import time)", () => {
    expect(getStripePriceAllowlist()).toEqual({});
    process.env.STRIPE_PRICE_ID_MONTHLY = "new_after_import";
    expect(getStripePriceAllowlist()).toEqual({
      new_after_import: { kind: "monthly", mode: "subscription" },
    });
  });
});

describe("isAllowedStripeReturnUrl", () => {
  // Snapshot+restore both env vars the helper reads. beforeEach
  // unsets them so each test starts from a clean "deployed prod
  // function" baseline; tests that need emulator semantics opt in
  // explicitly. Without this the suite is order-sensitive and
  // anyone running `vitest run -t single-test` gets different
  // semantics than the full suite.
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.STRIPE_RETURN_URL_ORIGINS;
    delete process.env.FUNCTIONS_EMULATOR;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("allows the deployed prod origin by default", () => {
    // Bedrock: the canonical prod origin must always be on the list.
    expect(isAllowedStripeReturnUrl("https://troposfit.com/settings?x=1")).toBe(true);
  });

  it("allows the www variant in defaults", () => {
    // www.troposfit.com is listed alongside the bare domain so a
    // user landing on the www host doesn't get a checkout bounce.
    expect(isAllowedStripeReturnUrl("https://www.troposfit.com/settings")).toBe(true);
  });

  it("allows the deployed GitHub Pages staging origin by default", () => {
    // GitHub Pages is currently the staging surface; staying in
    // defaults until per-env STRIPE_RETURN_URL_ORIGINS wiring lands.
    expect(
      isAllowedStripeReturnUrl("https://lemmonchess333.github.io/Maiin/settings?checkout=success"),
    ).toBe(true);
  });

  it("rejects localhost origins in deployed-prod-function mode", () => {
    // Without FUNCTIONS_EMULATOR=true, localhost is intentionally
    // off the allowlist so a prod deploy can never redirect back to
    // a developer's box.
    expect(isAllowedStripeReturnUrl("http://localhost:4173/Maiin/settings")).toBe(false);
    expect(isAllowedStripeReturnUrl("http://127.0.0.1:4173/Maiin/settings")).toBe(false);
  });

  it("allows localhost origins only when FUNCTIONS_EMULATOR=true", () => {
    // FUNCTIONS_EMULATOR is set by firebase emulators:start; this is
    // the only context where developer-machine origins are valid
    // return targets.
    process.env.FUNCTIONS_EMULATOR = "true";
    expect(isAllowedStripeReturnUrl("http://localhost:4173/Maiin/settings")).toBe(true);
    expect(isAllowedStripeReturnUrl("http://127.0.0.1:4173/Maiin/settings")).toBe(true);
    expect(isAllowedStripeReturnUrl("http://localhost:5173/Maiin/settings")).toBe(true);
    expect(isAllowedStripeReturnUrl("http://127.0.0.1:5173/Maiin/settings")).toBe(true);
  });

  it("rejects arbitrary external origins", () => {
    // The negative bedrock: anything off-allowlist must reject.
    expect(isAllowedStripeReturnUrl("https://evil.example/checkout-done")).toBe(false);
  });

  it("rejects protocol-relative URLs", () => {
    // `new URL("//evil.com/x")` throws without a base, so the parser
    // itself drops it — but pinning the behaviour stops a future
    // refactor (e.g. passing a base) from regressing the gate.
    expect(isAllowedStripeReturnUrl("//evil.com/x")).toBe(false);
  });

  it("rejects data: scheme", () => {
    // data: URIs can encode arbitrary HTML / JS / executable bytes.
    // Even though they parse cleanly as URLs, the protocol gate
    // drops them before the allowlist lookup runs.
    expect(
      isAllowedStripeReturnUrl("data:text/html,<script>alert(1)</script>"),
    ).toBe(false);
  });

  it("rejects vbscript: scheme", () => {
    // Legacy IE script scheme; modern browsers ignore it but the
    // gate stays for defence in depth.
    expect(isAllowedStripeReturnUrl("vbscript:msgbox(1)")).toBe(false);
  });

  it("rejects file: scheme", () => {
    // file:// can disclose local filesystem contents on some
    // platforms — the protocol gate is the only thing preventing it.
    expect(isAllowedStripeReturnUrl("file:///etc/passwd")).toBe(false);
  });

  it("rejects javascript: scheme", () => {
    // Defensive: not in Codex's edge-case list but obvious sibling.
    expect(isAllowedStripeReturnUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects suffix phishing attempts", () => {
    // A naive `endsWith("troposfit.com")` check would let
    // `https://troposfit.com.evil.com/x` through. Origin-equality
    // is what stops it.
    expect(
      isAllowedStripeReturnUrl("https://troposfit.com.evil.com/x"),
    ).toBe(false);
  });

  it("Unicode lookalike of a listed origin collapses via IDNA to the legit origin", () => {
    // Node's URL parser performs IDNA normalisation, so full-width
    // dots (U+FF0E) in a hostname decompose to ASCII dots before
    // `parsed.origin` is computed. The practical consequence is
    // that an attacker who supplies a lookalike of a listed origin
    // ends up with a URL whose origin equals the legit one — the
    // post-payment redirect lands on the real site, defeating the
    // phishing attempt.
    //
    // A lookalike of an UNLISTED origin (e.g. an attacker-owned
    // domain visually similar to a real one) would also normalise,
    // but normalises to that attacker-owned ASCII form which is
    // not on the allowlist — see next test.
    expect(
      isAllowedStripeReturnUrl(
        "https://lemmonchess333．github．io/x",
      ),
    ).toBe(true);
  });

  it("rejects Unicode lookalike pointing at an unlisted origin", () => {
    // The dangerous case: an attacker-owned domain (`evil.com`)
    // wrapped in full-width characters. IDNA normalises to plain
    // `evil.com`, which is not on the allowlist → rejected.
    expect(
      isAllowedStripeReturnUrl("https://ｅvil．com/x"),
    ).toBe(false);
  });

  it("rejects non-default-port mismatches", () => {
    // `parsed.origin` includes the port when it differs from the
    // protocol's default — `https://troposfit.com:8443` has origin
    // `https://troposfit.com:8443`, which is not on the allowlist.
    expect(
      isAllowedStripeReturnUrl("https://troposfit.com:8443/x"),
    ).toBe(false);
  });

  it("rejects userinfo confusion", () => {
    // `https://troposfit.com@evil.com/x` — naive substring checks
    // see "troposfit.com" and accept. Origin-equality drops it
    // because `parsed.origin` is `https://evil.com`.
    expect(
      isAllowedStripeReturnUrl("https://troposfit.com@evil.com/x"),
    ).toBe(false);
  });

  it("rejects malformed values and non-strings", () => {
    // Type / shape gate before parse so a non-string input doesn't
    // surface as a TypeError from `new URL(...)`.
    expect(isAllowedStripeReturnUrl("not a url")).toBe(false);
    expect(isAllowedStripeReturnUrl(null)).toBe(false);
    expect(isAllowedStripeReturnUrl("")).toBe(false);
    expect(isAllowedStripeReturnUrl("   ")).toBe(false);
  });

  it("normalises case in scheme and host", () => {
    // `new URL(...)` lowercases scheme + host into `.origin`, so
    // mixed-case input matches the lower-case allowlist entry.
    expect(
      isAllowedStripeReturnUrl("HTTPS://Troposfit.COM/settings?x=1"),
    ).toBe(true);
  });

  it("normalises default ports out of the origin", () => {
    // `:443` is the default for https, so `parsed.origin` drops it.
    expect(isAllowedStripeReturnUrl("https://troposfit.com:443/settings")).toBe(true);
  });

  it("STRIPE_RETURN_URL_ORIGINS replaces, not extends, defaults (and normalises trailing slash)", () => {
    // Pins two contracts at once: (1) trailing slashes on the env
    // entry are normalised away by `new URL(entry).origin`, so the
    // canonical match still works; (2) when an override is set, the
    // default allowlist is NOT also active — production-by-default
    // origins must reject.
    process.env.STRIPE_RETURN_URL_ORIGINS = "https://app.example.com/";
    expect(isAllowedStripeReturnUrl("https://app.example.com/settings")).toBe(true);
    expect(isAllowedStripeReturnUrl("https://troposfit.com/settings")).toBe(false);
  });

  it("honours STRIPE_RETURN_URL_ORIGINS comma-separated lists", () => {
    process.env.STRIPE_RETURN_URL_ORIGINS = "https://app.example.com, https://staging.example.com";
    expect(isAllowedStripeReturnUrl("https://app.example.com/settings?checkout=success")).toBe(true);
    expect(isAllowedStripeReturnUrl("https://staging.example.com/settings")).toBe(true);
    expect(isAllowedStripeReturnUrl("https://lemmonchess333.github.io/Maiin/settings?checkout=success")).toBe(false);
  });

  it("ignores invalid entries in STRIPE_RETURN_URL_ORIGINS", () => {
    // A garbage entry shouldn't poison the rest of the list — and
    // shouldn't fall through to the defaults either (replace-not-extend).
    process.env.STRIPE_RETURN_URL_ORIGINS = "not-a-url, https://app.example.com";
    expect(isAllowedStripeReturnUrl("https://app.example.com/settings")).toBe(true);
    expect(isAllowedStripeReturnUrl("https://troposfit.com/settings")).toBe(false);
  });
});
