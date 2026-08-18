/**
 * /privacy, /terms and /support must resolve WITHOUT a signed-in user.
 *
 * This is an App Store submission gate, not a nicety. Apple's reviewer
 * opens the Support URL and the two Description-footer legal links from
 * the open web, in a browser with no Tropos session. If any of them
 * lands on the Login screen instead of the page, the submission is
 * rejected for a broken/inaccessible link — one of the commonest
 * first-submission failures.
 *
 * `App.tsx` has THREE route sets — signed-out, onboarding-incomplete,
 * and fully authenticated — and the three pages have to be declared in
 * each one, because the earlier sets return before the later ones are
 * reached. That is easy to get wrong in exactly the invisible direction:
 * deleting the route from the signed-out set breaks nothing any
 * logged-in developer would ever see, and no other test in this repo
 * renders App at all.
 *
 * Read as source rather than rendered, for the same reason
 * `aiFoodIdentification.test.ts` reads `functions/index.js`: the claim
 * is about the route TABLE, and mounting App would need the whole auth
 * / Firebase / Suspense apparatus stubbed, which mostly proves the stubs
 * work. Here the file itself is the artefact under test.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const APP_SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../App.tsx"),
  "utf8"
);

/** The paths Apple is given. Keep in step with the App Store Connect
 *  Support URL and the two Description-footer links. */
const PUBLIC_LEGAL_PATHS = ["/privacy", "/terms", "/support"] as const;

/**
 * Pull out the body of an early-return route set — the block between a
 * guard like `if (!user) {` and its matching close. Brace-counted rather
 * than regex-matched so nested JSX braces cannot end the block early.
 */
function routeSetAfter(guard: string): string {
  const start = APP_SOURCE.indexOf(guard);
  if (start < 0) throw new Error(`guard not found in App.tsx: ${guard}`);
  let depth = 0;
  let i = start + guard.length - 1; // sits on the opening brace
  for (; i < APP_SOURCE.length; i++) {
    if (APP_SOURCE[i] === "{") depth++;
    else if (APP_SOURCE[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  return APP_SOURCE.slice(start, i + 1);
}

describe("public legal routes — App Store submission gate", () => {
  it("the SIGNED-OUT route set declares all three", () => {
    // The one that matters: this is the state Apple's reviewer is in.
    const signedOut = routeSetAfter("if (!user) {");
    for (const path of PUBLIC_LEGAL_PATHS) {
      expect(signedOut).toContain(`path="${path}"`);
    }
  });

  it("the ONBOARDING-INCOMPLETE route set declares all three", () => {
    // A reviewer who creates an account to test the app lands here, and
    // the footer links have to keep working mid-onboarding.
    const onboarding = routeSetAfter("if (!profile?.onboardingComplete) {");
    for (const path of PUBLIC_LEGAL_PATHS) {
      expect(onboarding).toContain(`path="${path}"`);
    }
  });

  it("each path is declared in every route set, not just once", () => {
    // Three sets x three paths. A count below three for any path means
    // one set falls through to its catch-all — Login, Onboarding, or a
    // 404 — depending on who is asking.
    for (const path of PUBLIC_LEGAL_PATHS) {
      const declarations = APP_SOURCE.split(`path="${path}"`).length - 1;
      expect(declarations).toBeGreaterThanOrEqual(3);
    }
  });

  it("the signed-out catch-all does not shadow them", () => {
    // React Router ranks by specificity rather than source order, so a
    // trailing `path="*"` cannot actually shadow a literal path — this
    // asserts the structural expectation the block is written against,
    // so a rewrite into an explicit-order router (or a redirect guard
    // placed above them) has to come back and think about it.
    const signedOut = routeSetAfter("if (!user) {");
    const catchAll = signedOut.indexOf('path="*"');
    expect(catchAll).toBeGreaterThan(-1);
    for (const path of PUBLIC_LEGAL_PATHS) {
      expect(signedOut.indexOf(`path="${path}"`)).toBeLessThan(catchAll);
    }
  });
});

describe("the Support page is a real page, not a mailto redirect", () => {
  const SUPPORT_SOURCE = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../../pages/Support.tsx"),
    "utf8"
  );

  it("carries a contact address", () => {
    // Apple requires the Support URL to reach a page offering contact,
    // and a bare `mailto:` URL in the field is rejected — hence a page
    // that CONTAINS the address rather than redirecting to it.
    expect(SUPPORT_SOURCE).toMatch(/mailto:[^"'`\s]+@/);
  });

  it("uses the troposfit.com domain the App Store listing will point at", () => {
    // If the support address ever moves off the domain named in the
    // listing, the two drift apart silently.
    expect(SUPPORT_SOURCE).toContain("@troposfit.com");
  });
});
