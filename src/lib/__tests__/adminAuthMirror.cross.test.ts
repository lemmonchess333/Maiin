/**
 * Cross-consistency test for the TS + JS copies of the admin allowlist.
 *
 * Both files declare the relationship — the client says "Mirrors
 * `functions/adminAuth.js`", the server says "the client-side mirror in
 * src/lib/adminAuth.ts" — and the mirror gate saw neither. That is the fourth
 * distinct phrasing to slip past it, and it is worth naming the pattern: the
 * gate's detector wants the word "client" adjacent to "mirror", or a `src/`
 * path immediately after it. An author who writes the plain English sentence
 * ("the client-side mirror in src/lib/adminAuth.ts") puts a word in between
 * and disappears. Each widening has been driven by a real file, not a
 * hypothetical, and each time the clearer declaration was the one being
 * punished.
 *
 * WHAT DIVERGENCE WOULD COST, stated honestly: less than the profanity pair.
 * The server is the trust boundary — `assertAdminCallable` throws
 * permission-denied on every moderation callable — and the client copy only
 * decides whether the /admin/moderation link renders. A drift shows up as an
 * admin who cannot see the link, or a non-admin who sees one that 403s. A UX
 * bug, not a privilege escalation.
 *
 * WHAT THIS CAN AND CANNOT PIN. The two read DIFFERENT env vars
 * (`VITE_ADMIN_UIDS` at build time, `ADMIN_UIDS` at runtime), so the most
 * likely real-world drift — an operator setting one and forgetting the other
 * — is an operational fact no test can reach. What IS testable is the part
 * that was hand-written twice: parsing a comma-separated string into a
 * membership set. Both trim, both drop empties, both fail closed on an empty
 * allowlist, and each of those is a place where two independent
 * implementations quietly stop agreeing.
 *
 * ONE MUTATION THIS SUITE DOES NOT CATCH, recorded rather than papered over:
 * deleting `.filter(Boolean)` from either copy leaves all 14 tests passing.
 * That is correct, not a hole. Its only effect is to keep `""` out of the
 * Set, and `isAdminUid` returns on `if (!uid)` before any lookup — so no
 * input can reach the difference. The filter is belt-and-braces on a path
 * the guard already closes. Contriving an assertion for it would be pinning
 * the implementation rather than the behaviour, which is the habit this
 * codebase keeps having to unlearn.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import Module, { createRequire } from "node:module";
import { isAdminUid as clientIsAdmin } from "@/lib/adminAuth";

const require = createRequire(import.meta.url);

/* `functions/adminAuth.js` requires `firebase-functions/v1`, which lives in
   `functions/node_modules`. The unit CI job installs only the ROOT tree, so a
   plain require of the server copy fails there with "Cannot find module" —
   green locally, red in CI, which is how this was found.

   The sibling mirror tests do not hit this because their server copies have no
   functions-tree dependency: `profanityFilter.js` needs `leo-profanity`, which
   the root package.json also declares, so Node's upward walk finds it.

   Stubbing the one specifier beats the alternatives. Installing the functions
   tree in the unit job is a lot of CI for one test, and skipping when the
   module will not load would make this vacuous in the only place it has to
   run. The stub is `HttpsError` alone, used exclusively by
   `assertAdminCallable`; neither function under test touches the module. If a
   future change made `isAdminUid` depend on firebase-functions the stub could
   hide it — but that would also mean the client copy could no longer mirror
   it, and the equality assertions below are what would fail. */
type Loader = (this: unknown, request: string, ...rest: unknown[]) => unknown;
const loaderHost = Module as unknown as { _load: Loader };
const realLoad = loaderHost._load;
loaderHost._load = function (request, ...rest) {
  if (request === "firebase-functions/v1") {
    return { https: { HttpsError: class extends Error {} } };
  }
  return realLoad.call(this, request, ...rest);
};
const server = require("../../../functions/adminAuth.js");
loaderHost._load = realLoad;

/** Set the allowlist on BOTH sides from one string, so every assertion below
 *  compares two parsers over identical input. */
function setAllowlist(raw: string | undefined) {
  if (raw === undefined) {
    vi.stubEnv("VITE_ADMIN_UIDS", "");
    delete process.env.ADMIN_UIDS;
    return;
  }
  vi.stubEnv("VITE_ADMIN_UIDS", raw);
  process.env.ADMIN_UIDS = raw;
}

afterEach(() => {
  vi.unstubAllEnvs();
  delete process.env.ADMIN_UIDS;
});

/* Deliberately mundane, like the profanity corpus. The point is not to
   enumerate uids — it is to cover the SHAPES where two hand-written splitters
   diverge: surrounding whitespace, empty entries, a trailing comma, an empty
   or absent allowlist, and non-string input. */
const ALLOWLISTS: Array<string | undefined> = [
  "uid-alpha",
  "uid-alpha,uid-beta",
  " uid-alpha , uid-beta ",
  "uid-alpha,,uid-beta",
  "uid-alpha,",
  ",uid-alpha",
  "   ",
  "",
  undefined,
];

const PROBES = [
  "uid-alpha",
  "uid-beta",
  "uid-gamma",
  " uid-alpha",
  "uid-alpha ",
  "UID-ALPHA",
  "",
];

const NON_STRINGS: unknown[] = [undefined, null, 0, 42, {}, [], true];

describe("admin allowlist — TS and JS copies agree", () => {
  for (const raw of ALLOWLISTS) {
    it(`allowlist ${JSON.stringify(raw)}`, () => {
      setAllowlist(raw);
      for (const uid of PROBES) {
        expect(
          server.isAdminUid(uid),
          `disagreed on uid ${JSON.stringify(uid)}`
        ).toBe(clientIsAdmin(uid));
      }
    });
  }

  it("agrees on non-string input", () => {
    setAllowlist("uid-alpha");
    for (const v of NON_STRINGS) {
      expect(server.isAdminUid(v as string)).toBe(
        clientIsAdmin(v as string)
      );
    }
  });

  it("actually admits someone — the corpus is not all-false", () => {
    /* The control, and the reason it exists: every assertion above is an
       equality, so two copies that returned `false` for everything would pass
       the whole file while agreeing about nothing. The profanity mirror test
       shipped with exactly that hole (its corpus used "damn", a word
       leo-profanity does not carry) and this control is what caught it. */
    setAllowlist("uid-alpha,uid-beta");
    expect(clientIsAdmin("uid-alpha")).toBe(true);
    expect(server.isAdminUid("uid-alpha")).toBe(true);
    expect(clientIsAdmin("uid-beta")).toBe(true);
    expect(server.isAdminUid("uid-beta")).toBe(true);
  });

  it("and refuses someone — the other half of the control", () => {
    // An allowlist that admitted everyone would also satisfy every equality.
    setAllowlist("uid-alpha");
    expect(clientIsAdmin("uid-gamma")).toBe(false);
    expect(server.isAdminUid("uid-gamma")).toBe(false);
  });

  it("both fail closed when the allowlist is unset", () => {
    // The security-relevant default, asserted as a value rather than only as
    // an agreement: two copies that both failed OPEN would agree too.
    setAllowlist(undefined);
    expect(clientIsAdmin("uid-alpha")).toBe(false);
    expect(server.isAdminUid("uid-alpha")).toBe(false);
  });

  it("both trim entries but not the probe", () => {
    /* The specific asymmetry a reimplementation gets wrong. " uid-alpha " in
       the ALLOWLIST is admin; " uid-alpha" as the incoming UID is not — real
       uids never carry whitespace, so trimming the probe would widen the
       gate. Pinned as values, not just as agreement. */
    setAllowlist(" uid-alpha ");
    expect(clientIsAdmin("uid-alpha")).toBe(true);
    expect(server.isAdminUid("uid-alpha")).toBe(true);
    expect(clientIsAdmin(" uid-alpha")).toBe(false);
    expect(server.isAdminUid(" uid-alpha")).toBe(false);
  });
});
