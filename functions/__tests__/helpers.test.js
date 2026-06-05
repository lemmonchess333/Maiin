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
  ALLOWED_RETURN_PATHS,
  ALLOWED_CHECKOUT_OUTCOMES,
  getStripeReturnBaseUrl,
  buildStripeReturnUrl,
  isAllowedAppOrigin,
  getAppCorsOptions,
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
      1_000
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
      })
    ).toBe("pro");
  });

  // H-1 (security audit 2026-06): the server must honour
  // subscriptionExpiresAt the same way the client (getSubscriptionInfo)
  // does, so a dropped expiry webhook can't strand a user on server-side
  // Pro (paid AI compute) indefinitely.
  it("returns 'pro' for tier 'pro' with a future subscriptionExpiresAt", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(
      computeEffectiveTier(
        { subscriptionTier: "pro", subscriptionExpiresAt: future },
        new Date()
      )
    ).toBe("pro");
  });

  it("returns 'free' for tier 'pro' with an ELAPSED subscriptionExpiresAt", () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(
      computeEffectiveTier(
        { subscriptionTier: "pro", subscriptionExpiresAt: past },
        new Date()
      )
    ).toBe("free");
  });

  it("falls through to an active trial when the paid sub has expired", () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(
      computeEffectiveTier(
        {
          subscriptionTier: "pro",
          subscriptionExpiresAt: past,
          trialExpiresAt: future,
        },
        new Date()
      )
    ).toBe("pro");
  });

  it("treats tier 'pro' with absent/malformed subscriptionExpiresAt as active (legacy/lifetime)", () => {
    expect(computeEffectiveTier({ subscriptionTier: "pro" })).toBe("pro");
    expect(
      computeEffectiveTier(
        { subscriptionTier: "pro", subscriptionExpiresAt: "not-a-date" },
        new Date()
      )
    ).toBe("pro");
  });

  it("returns 'pro' for an unexpired trial", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(computeEffectiveTier({ trialExpiresAt: future }, new Date())).toBe(
      "pro"
    );
  });

  it("returns 'free' for an expired trial", () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(computeEffectiveTier({ trialExpiresAt: past }, new Date())).toBe(
      "free"
    );
  });

  it("returns 'free' when trialExpiresAt is malformed", () => {
    expect(
      computeEffectiveTier({ trialExpiresAt: "not-a-date" }, new Date())
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
    expect(currentMonthCount({ month: "2026-04", count: 9 }, "2026-05")).toBe(
      0
    );
  });

  it("returns the count when months match", () => {
    expect(currentMonthCount({ month: "2026-05", count: 7 }, "2026-05")).toBe(
      7
    );
  });

  it("coerces non-number count to 0 via Number()", () => {
    expect(currentMonthCount({ month: "2026-05", count: "5" }, "2026-05")).toBe(
      5
    );
    expect(
      currentMonthCount({ month: "2026-05", count: null }, "2026-05")
    ).toBe(0);
    expect(currentMonthCount({ month: "2026-05", count: NaN }, "2026-05")).toBe(
      0
    );
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
    expect(isAllowedStripeReturnUrl("https://troposfit.com/settings?x=1")).toBe(
      true
    );
  });

  it("allows the www variant in defaults", () => {
    // www.troposfit.com is listed alongside the bare domain so a
    // user landing on the www host doesn't get a checkout bounce.
    expect(isAllowedStripeReturnUrl("https://www.troposfit.com/settings")).toBe(
      true
    );
  });

  it("REJECTS the GitHub Pages staging origin in default-prod mode (security audit 2026-05-25 #1)", () => {
    // Pre-fix this test asserted that staging was allowed by
    // default — that was the audit finding. Production deploys
    // must reject staging origins unless TROPOS_DEPLOY_ENV=staging
    // (or operator explicitly sets STRIPE_RETURN_URL_ORIGINS).
    expect(
      isAllowedStripeReturnUrl(
        "https://lemmonchess333.github.io/Maiin/settings?checkout=success"
      )
    ).toBe(false);
  });

  it("allows the GitHub Pages staging origin when TROPOS_DEPLOY_ENV=staging", () => {
    process.env.TROPOS_DEPLOY_ENV = "staging";
    expect(
      isAllowedStripeReturnUrl(
        "https://lemmonchess333.github.io/Maiin/settings?checkout=success"
      )
    ).toBe(true);
  });

  it("rejects localhost origins in deployed-prod-function mode", () => {
    // Without FUNCTIONS_EMULATOR=true, localhost is intentionally
    // off the allowlist so a prod deploy can never redirect back to
    // a developer's box.
    expect(
      isAllowedStripeReturnUrl("http://localhost:4173/Maiin/settings")
    ).toBe(false);
    expect(
      isAllowedStripeReturnUrl("http://127.0.0.1:4173/Maiin/settings")
    ).toBe(false);
  });

  it("allows localhost origins only when FUNCTIONS_EMULATOR=true", () => {
    // FUNCTIONS_EMULATOR is set by firebase emulators:start; this is
    // the only context where developer-machine origins are valid
    // return targets.
    process.env.FUNCTIONS_EMULATOR = "true";
    expect(
      isAllowedStripeReturnUrl("http://localhost:4173/Maiin/settings")
    ).toBe(true);
    expect(
      isAllowedStripeReturnUrl("http://127.0.0.1:4173/Maiin/settings")
    ).toBe(true);
    expect(
      isAllowedStripeReturnUrl("http://localhost:5173/Maiin/settings")
    ).toBe(true);
    expect(
      isAllowedStripeReturnUrl("http://127.0.0.1:5173/Maiin/settings")
    ).toBe(true);
  });

  it("rejects arbitrary external origins", () => {
    // The negative bedrock: anything off-allowlist must reject.
    expect(isAllowedStripeReturnUrl("https://evil.example/checkout-done")).toBe(
      false
    );
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
      isAllowedStripeReturnUrl("data:text/html,<script>alert(1)</script>")
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
    expect(isAllowedStripeReturnUrl("https://troposfit.com.evil.com/x")).toBe(
      false
    );
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
    // Pre-audit this test used a staging origin (lemmonchess333.github.io)
    // as the lookalike target; switching to the prod origin because
    // staging is no longer on the default allowlist post-#audit-#1.
    expect(isAllowedStripeReturnUrl("https://troposfit．com/x")).toBe(true);
  });

  it("rejects Unicode lookalike pointing at an unlisted origin", () => {
    // The dangerous case: an attacker-owned domain (`evil.com`)
    // wrapped in full-width characters. IDNA normalises to plain
    // `evil.com`, which is not on the allowlist → rejected.
    expect(isAllowedStripeReturnUrl("https://ｅvil．com/x")).toBe(false);
  });

  it("rejects non-default-port mismatches", () => {
    // `parsed.origin` includes the port when it differs from the
    // protocol's default — `https://troposfit.com:8443` has origin
    // `https://troposfit.com:8443`, which is not on the allowlist.
    expect(isAllowedStripeReturnUrl("https://troposfit.com:8443/x")).toBe(
      false
    );
  });

  it("rejects userinfo confusion", () => {
    // `https://troposfit.com@evil.com/x` — naive substring checks
    // see "troposfit.com" and accept. Origin-equality drops it
    // because `parsed.origin` is `https://evil.com`.
    expect(isAllowedStripeReturnUrl("https://troposfit.com@evil.com/x")).toBe(
      false
    );
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
    expect(isAllowedStripeReturnUrl("HTTPS://Troposfit.COM/settings?x=1")).toBe(
      true
    );
  });

  it("normalises default ports out of the origin", () => {
    // `:443` is the default for https, so `parsed.origin` drops it.
    expect(isAllowedStripeReturnUrl("https://troposfit.com:443/settings")).toBe(
      true
    );
  });

  it("STRIPE_RETURN_URL_ORIGINS replaces, not extends, defaults (and normalises trailing slash)", () => {
    // Pins two contracts at once: (1) trailing slashes on the env
    // entry are normalised away by `new URL(entry).origin`, so the
    // canonical match still works; (2) when an override is set, the
    // default allowlist is NOT also active — production-by-default
    // origins must reject.
    process.env.STRIPE_RETURN_URL_ORIGINS = "https://app.example.com/";
    expect(isAllowedStripeReturnUrl("https://app.example.com/settings")).toBe(
      true
    );
    expect(isAllowedStripeReturnUrl("https://troposfit.com/settings")).toBe(
      false
    );
  });

  it("honours STRIPE_RETURN_URL_ORIGINS comma-separated lists", () => {
    process.env.STRIPE_RETURN_URL_ORIGINS =
      "https://app.example.com, https://staging.example.com";
    expect(
      isAllowedStripeReturnUrl(
        "https://app.example.com/settings?checkout=success"
      )
    ).toBe(true);
    expect(
      isAllowedStripeReturnUrl("https://staging.example.com/settings")
    ).toBe(true);
    expect(
      isAllowedStripeReturnUrl(
        "https://lemmonchess333.github.io/Maiin/settings?checkout=success"
      )
    ).toBe(false);
  });

  it("ignores invalid entries in STRIPE_RETURN_URL_ORIGINS", () => {
    // A garbage entry shouldn't poison the rest of the list — and
    // shouldn't fall through to the defaults either (replace-not-extend).
    process.env.STRIPE_RETURN_URL_ORIGINS =
      "not-a-url, https://app.example.com";
    expect(isAllowedStripeReturnUrl("https://app.example.com/settings")).toBe(
      true
    );
    expect(isAllowedStripeReturnUrl("https://troposfit.com/settings")).toBe(
      false
    );
  });
});

describe("ALLOWED_RETURN_PATHS", () => {
  it("is a frozen array of the deploy-blessed entry points", () => {
    // Frozen so a runtime caller can't mutate the closed set and
    // re-open the attack surface. If a new entry point is needed
    // it must come through a code change.
    expect(Array.isArray(ALLOWED_RETURN_PATHS)).toBe(true);
    expect(Object.isFrozen(ALLOWED_RETURN_PATHS)).toBe(true);
    expect(ALLOWED_RETURN_PATHS).toEqual(["settings", "upgrade", "home"]);
  });
});

describe("getStripeReturnBaseUrl", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.PUBLIC_APP_BASE_URL;
    delete process.env.FUNCTIONS_EMULATOR;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("uses PUBLIC_APP_BASE_URL when set", () => {
    process.env.PUBLIC_APP_BASE_URL = "https://troposfit.com/";
    expect(getStripeReturnBaseUrl()).toBe("https://troposfit.com/");
  });

  it("normalises a missing trailing slash on PUBLIC_APP_BASE_URL", () => {
    // The handler concatenates `${base}${path}` so a missing
    // trailing slash would collapse `/settings` into `comsettings`.
    process.env.PUBLIC_APP_BASE_URL = "https://troposfit.com";
    expect(getStripeReturnBaseUrl()).toBe("https://troposfit.com/");
  });

  it("falls back to localhost preview only in emulator mode", () => {
    // The localhost gate mirrors the return-URL-allowlist gate so a
    // prod function can never resolve checkout to a developer box.
    process.env.FUNCTIONS_EMULATOR = "true";
    expect(getStripeReturnBaseUrl()).toBe("http://localhost:4173/Maiin/");
  });

  it("falls back to GitHub Pages staging in deployed-prod mode", () => {
    // Deployed prod with no env override → staging origin (today's
    // only HTTPS surface). Switch the default to troposfit.com once
    // that origin is live.
    expect(getStripeReturnBaseUrl()).toBe(
      "https://lemmonchess333.github.io/Maiin/"
    );
  });

  it("ignores a blank/whitespace PUBLIC_APP_BASE_URL", () => {
    // A whitespace-only env var should not be treated as configured.
    process.env.PUBLIC_APP_BASE_URL = "   ";
    expect(getStripeReturnBaseUrl()).toBe(
      "https://lemmonchess333.github.io/Maiin/"
    );
  });
});

describe("buildStripeReturnUrl", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.PUBLIC_APP_BASE_URL;
    delete process.env.FUNCTIONS_EMULATOR;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("builds a success URL for a listed path", () => {
    process.env.PUBLIC_APP_BASE_URL = "https://troposfit.com/";
    expect(buildStripeReturnUrl("settings", "success")).toBe(
      "https://troposfit.com/settings?checkout=success"
    );
  });

  it("builds a cancelled URL for a listed path", () => {
    process.env.PUBLIC_APP_BASE_URL = "https://troposfit.com/";
    expect(buildStripeReturnUrl("upgrade", "cancelled")).toBe(
      "https://troposfit.com/upgrade?checkout=cancelled"
    );
  });

  it("rejects an unlisted path", () => {
    // The point of the closed set — any token that isn't blessed
    // returns null so the handler can 400 it.
    expect(buildStripeReturnUrl("evil", "success")).toBeNull();
    expect(buildStripeReturnUrl("", "success")).toBeNull();
    expect(buildStripeReturnUrl(null, "success")).toBeNull();
    expect(buildStripeReturnUrl(undefined, "success")).toBeNull();
  });

  it("rejects an unlisted outcome", () => {
    expect(buildStripeReturnUrl("settings", "completed")).toBeNull();
    expect(buildStripeReturnUrl("settings", "")).toBeNull();
    expect(buildStripeReturnUrl("settings", null)).toBeNull();
  });

  it("rejects path-traversal attempts via the path token", () => {
    // The closed-set check is a strict includes() match — anything
    // with slashes, query strings, or relative-path tokens fails
    // before string concatenation runs.
    expect(buildStripeReturnUrl("../admin", "success")).toBeNull();
    expect(buildStripeReturnUrl("settings/../admin", "success")).toBeNull();
    expect(buildStripeReturnUrl("settings?x=evil", "success")).toBeNull();
    expect(buildStripeReturnUrl("//evil.com", "success")).toBeNull();
  });

  it("covers every entry of ALLOWED_RETURN_PATHS", () => {
    // Guards against the set growing in helpers.js without a test
    // refresh — if a new path is added the test surfaces it.
    process.env.PUBLIC_APP_BASE_URL = "https://troposfit.com/";
    for (const path of ALLOWED_RETURN_PATHS) {
      expect(buildStripeReturnUrl(path, "success")).toBe(
        `https://troposfit.com/${path}?checkout=success`
      );
    }
  });

  it("covers every entry of ALLOWED_CHECKOUT_OUTCOMES", () => {
    // Same shape for outcomes — pins the closed set.
    process.env.PUBLIC_APP_BASE_URL = "https://troposfit.com/";
    for (const outcome of ALLOWED_CHECKOUT_OUTCOMES) {
      expect(buildStripeReturnUrl("settings", outcome)).toBe(
        `https://troposfit.com/settings?checkout=${outcome}`
      );
    }
  });
});

describe("isAllowedAppOrigin", () => {
  // Same env-snapshot pattern as the rest of the suite — each test
  // starts from a clean "deployed-prod function" baseline; tests
  // that need emulator / staging semantics opt in explicitly.
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.STRIPE_RETURN_URL_ORIGINS;
    delete process.env.FUNCTIONS_EMULATOR;
    delete process.env.TROPOS_DEPLOY_ENV;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("permits the canonical prod origin", () => {
    expect(isAllowedAppOrigin("https://troposfit.com")).toBe(true);
  });

  it("permits the www variant", () => {
    expect(isAllowedAppOrigin("https://www.troposfit.com")).toBe(true);
  });

  // Sub1 P2 / security audit 2026-05-25 finding #1:
  // staging origins are NOT permitted in default production deploys.
  // Production deploys ship with TROPOS_DEPLOY_ENV unset (or set to
  // anything other than "staging"/"emulator"), which yields the
  // strict prod allowlist.
  it("REJECTS the GitHub Pages staging origin in default-prod mode", () => {
    expect(isAllowedAppOrigin("https://lemmonchess333.github.io")).toBe(false);
  });

  it("permits the GitHub Pages staging origin when TROPOS_DEPLOY_ENV=staging", () => {
    process.env.TROPOS_DEPLOY_ENV = "staging";
    expect(isAllowedAppOrigin("https://lemmonchess333.github.io")).toBe(true);
    // Staging deploys still accept production origins (cross-env test flows).
    expect(isAllowedAppOrigin("https://troposfit.com")).toBe(true);
  });

  it("permits the GitHub Pages staging origin when FUNCTIONS_EMULATOR=true", () => {
    process.env.FUNCTIONS_EMULATOR = "true";
    expect(isAllowedAppOrigin("https://lemmonchess333.github.io")).toBe(true);
  });

  it("falls through to prod-strict for typo'd / unknown deploy env values", () => {
    // Fail-secure: unrecognised env var values must NOT silently
    // grant staging access. A misconfigured staging deploy gets
    // staging-origin rejection (visible failure) rather than
    // silently inheriting the relaxed allowlist.
    process.env.TROPOS_DEPLOY_ENV = "stagingg"; // typo
    expect(isAllowedAppOrigin("https://lemmonchess333.github.io")).toBe(false);
    process.env.TROPOS_DEPLOY_ENV = "STAGING"; // case sensitivity
    expect(isAllowedAppOrigin("https://lemmonchess333.github.io")).toBe(false);
    process.env.TROPOS_DEPLOY_ENV = "prod";
    expect(isAllowedAppOrigin("https://lemmonchess333.github.io")).toBe(false);
  });

  it("rejects an arbitrary external origin", () => {
    // The negative bedrock — the whole point of switching cors off
    // `origin: true` is that evil.example can't call the function.
    expect(isAllowedAppOrigin("https://evil.example")).toBe(false);
  });

  it("rejects localhost in deployed-prod mode", () => {
    // Without FUNCTIONS_EMULATOR=true, a deployed prod function
    // must not honour a localhost Origin header. (A browser would
    // never send one; this defends against a fetch with a forged
    // Origin from a non-browser context.)
    expect(isAllowedAppOrigin("http://localhost:4173")).toBe(false);
    expect(isAllowedAppOrigin("http://127.0.0.1:5173")).toBe(false);
  });

  it("permits localhost only when FUNCTIONS_EMULATOR=true", () => {
    // Mirrors the Stripe return-URL allowlist gating.
    process.env.FUNCTIONS_EMULATOR = "true";
    expect(isAllowedAppOrigin("http://localhost:4173")).toBe(true);
    expect(isAllowedAppOrigin("http://localhost:5173")).toBe(true);
    expect(isAllowedAppOrigin("http://127.0.0.1:4173")).toBe(true);
    expect(isAllowedAppOrigin("http://127.0.0.1:5173")).toBe(true);
  });

  it("permits a missing / undefined Origin (non-browser callers)", () => {
    // Browsers always send Origin on cross-origin XHR/fetch; only
    // non-browser callers (curl, server-to-server, native apps
    // without a webview) omit it. Bearer-token auth is the real
    // gate for those callers — CORS is the wrong layer to block
    // them, and rejecting an absent Origin would break legitimate
    // emergency curl access for ops debugging.
    expect(isAllowedAppOrigin(undefined)).toBe(true);
    expect(isAllowedAppOrigin(null)).toBe(true);
    expect(isAllowedAppOrigin("")).toBe(true);
  });

  it("rejects non-string Origin values", () => {
    // If a malformed Origin header ever sneaks through as a
    // non-string, fail closed rather than try to coerce it.
    expect(isAllowedAppOrigin(123)).toBe(false);
    expect(isAllowedAppOrigin({})).toBe(false);
    expect(isAllowedAppOrigin([])).toBe(false);
  });

  it("honours STRIPE_RETURN_URL_ORIGINS override (replace-not-extend)", () => {
    // Same override semantics as isAllowedStripeReturnUrl —
    // setting the env var replaces the defaults, doesn't extend.
    process.env.STRIPE_RETURN_URL_ORIGINS = "https://app.example.com";
    expect(isAllowedAppOrigin("https://app.example.com")).toBe(true);
    expect(isAllowedAppOrigin("https://troposfit.com")).toBe(false);
  });
});

describe("getAppCorsOptions", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.STRIPE_RETURN_URL_ORIGINS;
    delete process.env.FUNCTIONS_EMULATOR;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function invokeOrigin(opts, origin) {
    return new Promise((resolve) => {
      opts.origin(origin, (err, allowed) => {
        resolve({ err, allowed });
      });
    });
  }

  it("calls back with (null, true) for an allowed origin", async () => {
    // Happy path — the cors module accepts and sets
    // Access-Control-Allow-Origin to the allowed value.
    const { err, allowed } = await invokeOrigin(
      getAppCorsOptions(),
      "https://troposfit.com"
    );
    expect(err).toBeNull();
    expect(allowed).toBe(true);
  });

  it("calls back with (null, true) for a missing Origin (non-browser callers)", async () => {
    const { err, allowed } = await invokeOrigin(getAppCorsOptions(), undefined);
    expect(err).toBeNull();
    expect(allowed).toBe(true);
  });

  it("calls back with an Error for a disallowed origin", async () => {
    // The Error path short-circuits cors and returns a 500 to the
    // caller — the inner handler never runs, so a forbidden origin
    // can't even attempt a Stripe call.
    const { err } = await invokeOrigin(
      getAppCorsOptions(),
      "https://evil.example"
    );
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/CORS/i);
  });

  it("calls back with an Error for localhost when not in emulator mode", async () => {
    // Same rejection path as above, pinning that the prod gate is
    // wired correctly into the cors config (not just the predicate).
    const { err } = await invokeOrigin(
      getAppCorsOptions(),
      "http://localhost:4173"
    );
    expect(err).toBeInstanceOf(Error);
  });

  it("accepts localhost when FUNCTIONS_EMULATOR=true", async () => {
    process.env.FUNCTIONS_EMULATOR = "true";
    const { err, allowed } = await invokeOrigin(
      getAppCorsOptions(),
      "http://localhost:4173"
    );
    expect(err).toBeNull();
    expect(allowed).toBe(true);
  });
});
