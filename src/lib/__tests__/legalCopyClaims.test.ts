/**
 * The legal pages make factual claims about what the code does. Pin them.
 *
 * This whole arc exists because a claim drifted from its code: Food8 moved
 * meal photos into Firebase Storage without citing F3d, and the scanner
 * kept telling users "no photos are stored" for months afterwards. Nothing
 * caught it, because nothing connected the sentence to the behaviour.
 *
 * These are the sentences a regulator or an App Store reviewer would hold
 * us to, so each is tied to the thing that makes it true:
 *
 *  - The retention window quoted to users must equal `MAX_AGE_DAYS`.
 *  - Deletion is immediate — the executor runs Firestore, then Storage,
 *    then `auth.deleteUser` synchronously, with no retention window
 *    anywhere in it. The pages used to promise "within 30 days", which
 *    undersold it and read as though we sit on the data for a month.
 *  - Privacy Policy and Terms must not contradict each other on deletion.
 *  - Nothing may claim we store meal photos server-side again without
 *    this failing first.
 *
 * Constants are read out of the source rather than imported, because
 * `foodPhotoStore` pulls in `@capacitor/filesystem` and mocking a plugin
 * to read one number would test the mock.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { AI_CONSENT_COPY } from "@/lib/aiConsent";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(here, rel), "utf8");
const repoRoot = resolve(here, "../../..");

/** Every non-test source file under `dir` (relative to the repo root). */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (abs: string) => {
    for (const name of readdirSync(abs)) {
      const path = join(abs, name);
      if (statSync(path).isDirectory()) {
        if (name !== "__tests__" && name !== "node_modules") walk(path);
      } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
        out.push(path);
      }
    }
  };
  walk(resolve(repoRoot, dir));
  return out;
}

const PRIVACY = read("../../pages/PrivacyPolicy.tsx");
const TERMS = read("../../pages/TermsOfService.tsx");
/** Same source with runs of whitespace collapsed. Every prose assertion
 *  below should use these: JSX wraps sentences at line boundaries, so a
 *  literal match fails on reformatting rather than on a meaning change. */
const PRIVACY_PROSE = PRIVACY.replace(/\s+/g, " ");
const TERMS_PROSE = TERMS.replace(/\s+/g, " ");
const STORE = read("../foodPhotoStore.ts");
const HEALTH_KIT = read("../healthKit.ts");
const STEPS_HOOK = read("../../hooks/useSteps.ts");
const ANALYTICS_REDACTION = read("../analyticsRedaction.ts");
const SHARE_DEFAULTS_ROW = read(
  "../../components/settings/ShareDefaultsRow.tsx"
);
const SETTINGS_INDEX = read("../../pages/SettingsIndex.tsx");
const ACCOUNT_SECTION = read("../../components/settings/AccountSection.tsx");

describe("meal-photo retention — the quoted window matches the code", () => {
  it("the Privacy Policy's number equals MAX_AGE_DAYS", () => {
    const declared = STORE.match(/MAX_AGE_DAYS\s*=\s*(\d+)/);
    expect(declared).not.toBeNull();
    const days = Number(declared![1]);

    // The policy tells users photos are "deleted automatically after N
    // days". Change the constant without changing the sentence and we are
    // telling users something untrue — the precise failure this suite
    // exists to prevent.
    const quoted = PRIVACY_PROSE.match(
      /deleted automatically after (\d+) days/
    );
    expect(quoted).not.toBeNull();
    expect(Number(quoted![1])).toBe(days);
  });

  it("the policy states the photo is device-only, not server-stored", () => {
    expect(PRIVACY_PROSE).toMatch(/only on the device that took it/);
    expect(PRIVACY_PROSE).toMatch(
      /does not store your food photos on its servers/
    );
  });

  it("the policy does not claim the photo never leaves the device", () => {
    // "Device-local" is about RETENTION, not transmission — Gemini does
    // the recognition and there is no on-device model. Copy implying the
    // photo never leaves the phone would be as false as the copy this
    // replaced, so the policy must keep naming Google as the processor.
    expect(PRIVACY_PROSE).toMatch(/Google Gemini/);
    expect(PRIVACY_PROSE).not.toMatch(/never leaves your (device|phone)/i);
  });
});

describe("account deletion — both pages, one story", () => {
  it("the Privacy Policy discloses interrupted cleanup and limited retention", () => {
    expect(PRIVACY_PROSE).toMatch(/background/);
    expect(PRIVACY_PROSE).toMatch(/365 days/);
    expect(PRIVACY_PROSE).not.toMatch(/erased.{0,80}immediately/);
  });

  it("the Terms say the same thing", () => {
    expect(TERMS_PROSE).toMatch(/cleanup continues in the background/);
    expect(TERMS_PROSE).toMatch(
      /Limited security, moderation, and billing records/
    );
    expect(TERMS_PROSE).not.toMatch(/erased immediately/);
  });

  it("neither page still promises the stale 30-day window", () => {
    // The executor begins immediately and retries interrupted cleanup.
    // The 30-day period applies only to the completed request receipt.
    expect(PRIVACY_PROSE).not.toMatch(/within 30 days/);
    expect(TERMS_PROSE).not.toMatch(/within 30 days/);
  });

  it("the Privacy Policy admits the one thing erasure cannot reach", () => {
    // Photos on a second device are unreachable by any server process.
    // Saying "all associated data is removed" without this is an
    // overstatement introduced by moving photos onto the device.
    expect(PRIVACY_PROSE).toMatch(/no process of ours can reach a phone/);
    expect(PRIVACY_PROSE).toMatch(/device you delete from/);
  });
});

describe("the collection inventory is complete", () => {
  it("section 1 lists meal photos, not only progress photos", () => {
    // Section 1 is what a reviewer reads as the inventory. Meal photos
    // used to appear only in the third-party section further down.
    const sectionOne = PRIVACY_PROSE.slice(
      PRIVACY_PROSE.indexOf("1. Information We Collect"),
      PRIVACY_PROSE.indexOf("2. How We Use Your Data")
    );
    expect(sectionOne).toMatch(/Meal Photos/);
    expect(sectionOne).toMatch(/Progress Photos/);
  });
});

describe("the data controller is identified", () => {
  it("the policy names a controller, not just a support address", () => {
    /* UK GDPR Art. 13(1)(a) wants the controller's identity AND contact
       details. The policy carried the contact half only — "Tropos" is a
       trading name, not a legal person, so a reader could not tell who is
       actually responsible for their data.

       This pin deliberately does NOT assert a particular name. Tropos
       trades as a sole trader today and may incorporate, at which point
       the COMPANY becomes the controller and the name changes. Asserting
       the current name would fail on a correct change; asserting the
       SECTION guards the thing that must never silently disappear. The
       source comment carries the update-on-incorporation reminder. */
    expect(PRIVACY_PROSE).toMatch(/Who we are/);
    expect(PRIVACY_PROSE).toMatch(/is the data controller/);
  });

  it("the controller section offers a route to exercise rights", () => {
    // An identity with no reachable contact is half the requirement.
    expect(PRIVACY_PROSE).toMatch(/support@troposfit\.com/);
  });
});

describe("cross-references resolve", () => {
  /* Found by reading the rendered pages rather than the diff, twice in
     one pass. The Privacy Policy told readers to see a heading called
     "How we protect your data" — no such heading exists; section 3 is
     "Data Storage & Security". The Terms said content may be removed for
     violating "our Community Guidelines" — a document that has never
     existed anywhere in this repo.

     Both are the same failure: prose citing a target nobody checked. In
     a legal document a dangling pointer is worse than in code, because
     the reader concludes the protection they were promised is written
     down somewhere they cannot find. */

  /** Section numbers the policy asks the reader to go and read. */
  const referenced = [...PRIVACY_PROSE.matchAll(/section (\d+)/gi)].map((m) =>
    Number(m[1])
  );
  /** Section numbers that actually have a heading. */
  const declared = new Set(
    [...PRIVACY_PROSE.matchAll(/(\d+)\. [A-Z]/g)].map((m) => Number(m[1]))
  );

  it("the policy references at least one section (guard against a silent no-op)", () => {
    // Without this, deleting every cross-reference would make the test
    // below vacuously pass — the tautology shape this repo keeps finding.
    expect(referenced.length).toBeGreaterThan(0);
  });

  it("every section the policy points at exists", () => {
    const dangling = [...new Set(referenced)].filter((n) => !declared.has(n));
    expect(dangling).toEqual([]);
  });

  it("neither page cites a document that does not exist", () => {
    // "Community Guidelines" is the one that shipped. If such a page is
    // ever written, this assertion is what tells you to come back and
    // reinstate the reference deliberately.
    expect(PRIVACY_PROSE).not.toMatch(/Community Guidelines/);
    expect(TERMS_PROSE).not.toMatch(/Community Guidelines/);
  });
});

describe("the AI question and the policy say the same things", () => {
  /* The sheet that asks before food goes to Gemini (AiConsentSheet) makes
     three claims, and the policy is where a reviewer checks them. If either
     side drifts, the person agreed to something the policy does not say. */
  const SHEET = AI_CONSENT_COPY.body;

  it("both name Google's Gemini as where the food goes", () => {
    expect(SHEET).toMatch(/Google's Gemini/);
    expect(PRIVACY_PROSE).toMatch(/Google&apos;s Gemini on Vertex AI/);
  });

  it("both say Google does not train on it", () => {
    expect(SHEET).toMatch(/Google doesn't use it to train its models/);
    expect(PRIVACY_PROSE).toMatch(/Google does not use it to train its models/);
  });

  it("both say the photo is kept only on the phone, and neither that it never leaves", () => {
    expect(SHEET).toMatch(/keeps photos only on this phone/);
    expect(PRIVACY_PROSE).toMatch(/kept only on the device that took it/);
    expect(SHEET).not.toMatch(/never leaves/i);
  });

  it("both point at the switch that exists", () => {
    // The sheet and the policy send people to Settings › Social & privacy;
    // that is the row's name in Settings.
    expect(SHEET).toMatch(/Settings › Social & privacy/);
    expect(PRIVACY_PROSE).toMatch(/Settings &gt; Social &amp; privacy/);
    expect(SETTINGS_INDEX).toMatch(/label: "Social & privacy"/);
  });
});

describe("Apple Health is read-only, and its count is never kept", () => {
  it("the policy says so", () => {
    expect(PRIVACY_PROSE).toMatch(/Tropos never writes to Apple Health/);
    expect(PRIVACY_PROSE).toMatch(
      /The step count is never stored and never sent anywhere/
    );
  });

  it("the one HealthKit module asks to read steps and nothing else", () => {
    // capacitor-health also offers WRITE_WORKOUTS. Asking for it would make
    // "never writes" false the day it shipped.
    const asked = HEALTH_KIT.match(/permissions:\s*\[([^\]]*)\]/g);
    expect(asked).toEqual(['permissions: ["READ_STEPS"]']);
    expect(HEALTH_KIT).not.toMatch(/WRITE_/);
    // ...and no other module reaches the plugin around it.
    const others = sourceFiles("src").filter(
      (f) =>
        !f.endsWith("lib/healthKit.ts") &&
        /from\s+["']capacitor-health["']|import\(\s*["']capacitor-health["']\s*\)/.test(
          readFileSync(f, "utf8")
        )
    );
    expect(others).toEqual([]);
  });

  it("the account keeps only whether Health is connected, never the count", () => {
    // users/{uid}/settings/healthKit is the one thing useSteps writes.
    const flags = STEPS_HOOK.match(/interface HealthKitFlags \{([^}]*)\}/);
    expect(flags).not.toBeNull();
    // Optional fields too: `steps?: number` is exactly the field to catch.
    const keys = [...flags![1].matchAll(/(\w+)\??:/g)].map((m) => m[1]);
    expect(keys.sort()).toEqual(["connected", "primingShown"]);
    expect(STEPS_HOOK.match(/setDocGuarded\(/g)).toHaveLength(1);
    expect(STEPS_HOOK).toMatch(/setDocGuarded\(ref, merged,/);
  });
});

describe("what the policy says about analytics, sharing and deletion holds", () => {
  it("analytics never receives what the policy says it never receives", () => {
    // "Analytics never receives your email address, your name, GPS routes,
    // what you type about meals, or your notes" — held by the redaction
    // every event passes through.
    expect(PRIVACY_PROSE).toMatch(
      /Analytics never receives your email address, your name, GPS routes, what you type about meals, or your notes/
    );
    for (const token of [
      "email",
      "displayname",
      "latitude",
      "longitude",
      "coord",
      "mealtext",
      "note",
    ]) {
      expect(ANALYTICS_REDACTION).toContain(`"${token}"`);
    }
  });

  it("no longer claims nothing is shared automatically, since it can be", () => {
    expect(SHARE_DEFAULTS_ROW).toMatch(
      /Shared with your followers automatically/
    );
    expect(PRIVACY_PROSE).not.toMatch(/Nothing is published automatically/);
    expect(PRIVACY_PROSE).toMatch(/share runs or workouts automatically/);
  });

  it("makes no 'exclusively' or 'solely' claim about how data is used", () => {
    // Analytics, including some fitness figures, reach Google Analytics, so
    // a claim that data is used for one purpose alone is untrue.
    expect(PRIVACY_PROSE).not.toMatch(/exclusively|solely/i);
  });

  it("names the deletion path the app has", () => {
    expect(PRIVACY_PROSE).toMatch(/Settings &gt; Account &gt; Delete account/);
    expect(SETTINGS_INDEX).toMatch(/label: "Account"/);
    expect(ACCOUNT_SECTION).toMatch(/label="Delete account"/);
  });
});

describe("the Terms identify the trader", () => {
  it("the Terms name who the agreement is with", () => {
    // The Terms are the CONTRACT — trader identity matters at least as
    // much here as in the privacy notice, and the page previously said
    // only "Tropos and its creators". Like the controller pin, this
    // guards the statement rather than the name, so incorporation can
    // change it without failing.
    expect(TERMS_PROSE).toMatch(/Tropos is operated by/);
    expect(TERMS_PROSE).toMatch(/agreement between you and/);
  });
});

describe("the Terms say what App Review 1.2 asks of a social app", () => {
  /* Apple rejects an app with user content whose terms do not make it
     clear there is no tolerance for objectionable content or abusive
     users, and that reports get a timely response. */
  it("state the zero-tolerance rule, and what happens to content and accounts", () => {
    expect(TERMS_PROSE).toMatch(
      /zero tolerance for objectionable content and abusive users/
    );
    expect(TERMS_PROSE).toMatch(/Content that breaks these rules is removed/);
    expect(TERMS_PROSE).toMatch(/can be suspended or removed from Tropos/);
  });

  it("promise the 24-hour review the report alert reminds the owner of", () => {
    // The promise is kept by a person reading the alert email, which
    // repeats it (functions/lib/reportAlert.js). If either changes alone,
    // the owner is working to a different number from the one users read.
    const ALERT = read("../../../functions/lib/reportAlert.js").replace(
      /\s+/g,
      " "
    );
    expect(TERMS_PROSE).toMatch(/Reports are reviewed within 24 hours/);
    expect(ALERT).toMatch(/reports are reviewed within 24 hours/);
  });

  it("say only what the filter, reports and blocks actually cover", () => {
    // Each claim is a feature: the word filter (profanityFilter.ts), report
    // targets for posts, comments and profiles (REPORT_TARGET_TYPES), and
    // blocking.
    expect(TERMS_PROSE).toMatch(/filters objectionable language/);
    expect(TERMS_PROSE).toMatch(/report a post, comment or profile/);
    const SOCIAL = read("../socialApi.ts");
    for (const target of ["activity", "comment", "user", "space_post"]) {
      expect(SOCIAL).toContain(`"${target}"`);
    }
    expect(SOCIAL).toMatch(/export async function blockUser/);
  });
});

describe("the Terms describe the subscription the app sells", () => {
  it("Pro is monthly or yearly, through Apple's In-App Purchase", () => {
    expect(TERMS_PROSE).toMatch(
      /a monthly or a yearly auto-renewing subscription/
    );
    expect(TERMS_PROSE).toMatch(/In-App Purchase/);
    // The plans that exist. A new plan (a lifetime one, say) fails here
    // until the Terms describe it.
    expect(read("../proPlans.ts")).toMatch(
      /export type PlanId = "monthly" \| "yearly";/
    );
  });

  it("no longer offers a lifetime purchase or a store Tropos is not in", () => {
    // Section 4 described "Lifetime purchases", which never existed, and
    // refunds through Google Play and the web, where nothing is sold.
    expect(TERMS_PROSE).not.toMatch(/lifetime/i);
    expect(TERMS_PROSE).not.toMatch(/Google Play/);
  });
});
