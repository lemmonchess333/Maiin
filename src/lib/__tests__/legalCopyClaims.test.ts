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
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { AI_CONSENT_COPY } from "@/lib/aiConsent";
import { redactPageUrl } from "@/lib/analyticsRedaction";
import { HEALTH_CONSENT_COPY } from "@/lib/healthConsent";
import { appInfoPlistString, resolvedSetting } from "@/test/iosBuildSettings";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(here, rel), "utf8");
const repoRoot = resolve(here, "../../..");

/** Every non-test source file under `dir` (relative to the repo root). */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (abs: string) => {
    for (const name of readdirSync(abs)) {
      const path = join(abs, name).replaceAll("\\", "/");
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
const STEP_OFFER_HOOK = read("../../hooks/useStepActivityOffer.ts");
const ANALYTICS_REDACTION = read("../analyticsRedaction.ts");
const SHARE_DEFAULTS_ROW = read(
  "../../components/settings/ShareDefaultsRow.tsx"
);
const SETTINGS_INDEX = read("../../pages/SettingsIndex.tsx");
const ACCOUNT_SECTION = read("../../components/settings/AccountSection.tsx");
/** The rules and server files a claim below rests on, whitespace collapsed
 *  so a rule's shape reads on one line. */
const collapsed = (rel: string) => read(rel).replace(/\s+/g, " ");
const FIRESTORE_RULES = collapsed("../../../firestore.rules");
const STORAGE_RULES = collapsed("../../../storage.rules");
const FUNCTIONS = (name: string) => collapsed(`../../../functions/lib/${name}`);

/** The policy's text between two headings. */
function policySection(from: string, to: string): string {
  const start = PRIVACY_PROSE.indexOf(from);
  const end = PRIVACY_PROSE.indexOf(to);
  expect(start, from).toBeGreaterThanOrEqual(0);
  expect(end, to).toBeGreaterThan(start);
  return PRIVACY_PROSE.slice(start, end);
}

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
    expect(PRIVACY_PROSE).toMatch(/does not keep meal photos on its servers/);
  });

  it("says flatly that no meal photo is kept on a server, and what happens to a deleted meal", () => {
    // Food9's STATUS of 21 November (#3463) deletes every photo older
    // builds stored under food-photos/; #3465 closed the prefix to every
    // client, and its purge workflow, run with apply, deletes what is left
    // (a console fact, kept as a backlog row). A deleted meal is purged 30
    // days after deletion (F5's STATUS, #3467's job).
    expect(STORAGE_RULES).toMatch(
      /match \/food-photos\/\{allPaths=\*\*\} \{ allow read, write: if false; \}/
    );
    expect(FUNCTIONS("mealPurge.js")).toMatch(
      /const DELETED_MEAL_RETENTION_DAYS = 30;/
    );
    expect(PRIVACY_PROSE).not.toMatch(
      /earlier versions? of Tropos stored|stored by earlier versions|deleting the meal does not remove it/
    );
    expect(PRIVACY_PROSE).toMatch(
      /Tropos does not keep meal photos on its servers\. <\/strong>\{" "\} The photo stays on your phone and is sent to Google’s Gemini only to be read\./
    );
    // The page the sentence names is on main already.
    expect(read("../../pages/settings/SettingsAccount.tsx")).toMatch(
      /label="Recently deleted meals"/
    );
    expect(PRIVACY_PROSE).toMatch(
      /A meal you delete goes to Recently deleted meals \(Settings &gt; Account\), where for 30 days you can restore it or delete it permanently; after 30 days it is deleted for good\./
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

  it("names the notification token and who delivers it, while the app registers one", () => {
    // The phone hands Tropos a push token, which the server keeps on the
    // account to send to (claimPushDeviceToken). The policy named every
    // other service the app calls and not this one (launch audit,
    // 2026-11-18; Guideline 5.1.1(i)).
    const registers = /claimPushDeviceToken/.test(
      read("../pushNotifications.ts")
    );
    expect(registers).toBe(true);
    const sectionOne = PRIVACY_PROSE.slice(
      PRIVACY_PROSE.indexOf("1. Information We Collect"),
      PRIVACY_PROSE.indexOf("2. How We Use Your Data")
    );
    expect(sectionOne).toMatch(/Notification Token/);
    expect(PRIVACY_PROSE).toMatch(/Firebase Cloud Messaging/);
    expect(PRIVACY_PROSE).toMatch(/Apple Push Notification service/);
  });

  it("says the year of birth setup stores, not the age range it replaced", () => {
    // Setup asks for a year of birth (App1 Q57); the policy still said
    // "age range", which nothing writes now.
    expect(read("../auth.tsx")).toMatch(/\bbirthYear\?: number;/);
    const sectionOne = PRIVACY_PROSE.slice(
      PRIVACY_PROSE.indexOf("1. Information We Collect"),
      PRIVACY_PROSE.indexOf("2. How We Use Your Data")
    );
    expect(sectionOne).toMatch(/year of birth/);
  });

  it("names every kind of upload Cloud Vision screens", () => {
    // photoScreen.js screens four paths. The policy listed three of them
    // and left out the map image of a shared run.
    // Each screened path, with the words the policy names it by. A fifth
    // path fails here until the policy names it.
    const NAMED: Record<string, string> = {
      "space-photos": "Space post",
      "profile-photos": "profile photo",
      "route-maps": "map image of a run",
      "post-photos": "session you share",
    };
    const screen = read("../../../functions/lib/photoScreen.js");
    const paths = [
      ...screen
        .split("const SCREENED_PATHS = [")[1]
        .split("];")[0]
        .matchAll(/\^([a-z-]+)\\\//g),
    ].map((m) => m[1]);
    expect(paths.sort()).toEqual(Object.keys(NAMED).sort());
    const vision = PRIVACY_PROSE.slice(
      PRIVACY_PROSE.indexOf("Photo checks (Google Cloud Vision)")
    ).slice(0, 600);
    for (const path of paths) {
      expect(vision, path).toContain(NAMED[path]);
    }
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
    expect(SHEET).toMatch(/Google’s Gemini/);
    expect(PRIVACY_PROSE).toMatch(/Google’s Gemini on Vertex AI/);
  });

  it("both say Google does not train on it", () => {
    expect(SHEET).toMatch(/Google doesn’t use it to train its models/);
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

describe("Apple Health permissions and storage match the policy", () => {
  it("discloses the separate steps, run heart rate and workout export choices", () => {
    expect(PRIVACY_PROSE).toMatch(
      /The step count is not stored or sent to Tropos/
    );
    // Readiness's sleep and heart (whole-app grill Q39-Q44): read on the
    // phone, never stored or sent, and the policy says so.
    expect(PRIVACY_PROSE).toMatch(
      /your sleep, resting heart rate and heart rate variability for the last four weeks/
    );
    expect(PRIVACY_PROSE).toMatch(
      /They are read on your phone each time and are not stored or sent to Tropos/
    );
    expect(PRIVACY_PROSE).toMatch(
      /If you use Apple Watch runs, Tropos reads heart rate/
    );
    expect(PRIVACY_PROSE).toMatch(
      /Raw heart rate samples are held on your device/
    );
    // The Watch asks to save workouts only because a workout session must;
    // the policy and the Watch's own usage text both say it saves none.
    expect(PRIVACY_PROSE).toMatch(
      /Apple asks an app that runs one for permission to save workouts as well; the Watch saves none/
    );
    expect(read("../../../ios/App/TroposWatch/Info.plist")).toMatch(
      /<key>NSHealthUpdateUsageDescription<\/key>\s*<string>[^<]*The Watch saves no workout to Health/
    );
    expect(PRIVACY_PROSE).toMatch(/If you separately turn on workout export/);
    // A Bluetooth heart rate sensor reads heart rate the same way, with no
    // Watch: on the device until the run is saved, never to analytics.
    expect(PRIVACY_PROSE).toMatch(
      /If\s+you pair a Bluetooth heart rate sensor/
    );
    expect(PRIVACY_PROSE).toMatch(
      /Raw\s+readings are held on your device until you save or discard the\s+run/
    );
    expect(PRIVACY_PROSE).toMatch(/without a GPS route/);
    // The pilot build, which carries Watch runs and workout export, says
    // so where iOS asks; a standard build asks for steps alone.
    const pilotShare = appInfoPlistString(
      "NSHealthShareUsageDescription",
      "YES"
    );
    const pilotUpdate = appInfoPlistString(
      "NSHealthUpdateUsageDescription",
      "YES"
    );
    expect(pilotShare).toMatch(/heart rate during Apple Watch runs if enabled/);
    expect(pilotUpdate).toMatch(/workouts when you turn on export/);
    const share = appInfoPlistString("NSHealthShareUsageDescription", "NO");
    const update = appInfoPlistString("NSHealthUpdateUsageDescription", "NO");
    expect(share).toMatch(/step count/);
    // Readiness reads sleep, resting heart rate and HRV (Pro, when added);
    // a standard build reads no workouts and no heart rate during a run.
    expect(share).toMatch(
      /your sleep, resting heart rate and heart rate variability/
    );
    expect(share).not.toMatch(/workout|during Apple Watch runs/);
    expect(update).toMatch(/does not add workouts/);
  });

  it("the existing steps bridge still asks only for steps", () => {
    // Run heart rate and workout export use the native Watch bridge. They
    // must not broaden the steps tile's request for Health permissions.
    const asked = HEALTH_KIT.match(/requestAuthorization\(\{[^}]*\}\)/g);
    // Steps alone for the tile; readiness asks separately, for exactly
    // what the policy names (BODY_SIGNAL_TYPES).
    expect(asked).toEqual([
      'requestAuthorization({ read: ["steps"] })',
      "requestAuthorization({ read: [...BODY_SIGNAL_TYPES] })",
    ]);
    expect(HEALTH_KIT).toMatch(
      /BODY_SIGNAL_TYPES = \[\s*"sleep",\s*"restingHeartRate",\s*"heartRateVariability",\s*\] as const/
    );
    expect(HEALTH_KIT).not.toMatch(/\bwrite:/);
    // No other module should reach for the Health plugin around this seam.
    const others = sourceFiles("src").filter(
      (f) =>
        !f.endsWith("lib/healthKit.ts") &&
        /from\s+["']@capgo\/capacitor-health["']|import\(\s*["']@capgo\/capacitor-health["']\s*\)/.test(
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

  it("the activity level offer keeps when Keep was tapped, never a step count", () => {
    // Whole-app grill Q31: a week of steps is read on the phone and
    // compared there; the policy says the count is not stored or sent,
    // and the one write the offer makes is the time of a "Keep".
    expect(PRIVACY_PROSE).toMatch(
      /With Pro, it compares last week’s average with the activity level your calorie target assumes/
    );
    expect(PRIVACY_PROSE).not.toMatch(/to show it on Home/);
    expect(STEP_OFFER_HOOK.match(/setDocGuarded\(/g)).toHaveLength(1);
    expect(STEP_OFFER_HOOK).toMatch(/\{ dismissedAt: Date\.now\(\) \}/);
  });
});

describe("motion during runs matches the policy", () => {
  const SOURCE = read("../runMotionSource.ts");
  const AUTO_PAUSE = read("../runAutoPause.ts");
  const HOOK = read("../../hooks/useRunMotion.ts");

  it("discloses that motion is read on the phone and not stored or sent", () => {
    expect(PRIVACY_PROSE).toMatch(/Motion During Runs \(iPhone\)/);
    expect(PRIVACY_PROSE).toMatch(
      /It is read on your phone and is not stored or sent to Tropos/
    );
  });

  it("keeps the readings in memory: no storage, network or analytics in their path", () => {
    for (const source of [SOURCE, AUTO_PAUSE, HOOK]) {
      expect(source).not.toMatch(
        /localStore|firestoreWrite|offlineQueue|analytics|fetch\(|logEvent|trackLifecycleEvent/
      );
    }
  });
});

describe("what the policy says about analytics, sharing and deletion holds", () => {
  it("analytics never receives what the policy says it never receives", () => {
    // "Analytics never receives your email address, your name, GPS routes,
    // what you type about meals, the names of your foods, or your notes" —
    // held by the redaction every event passes through. The food names are
    // true once claude/analytics-no-food-names (which stops `favouriteId`)
    // is on main; this page merges after it.
    expect(PRIVACY_PROSE).toMatch(
      /Analytics never receives your email address, your name, GPS routes, what you type about meals, the names of your foods, or your notes/
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

  it("says no body, food or training figure reaches analytics, while the guard holds it", () => {
    // Chart taps used to send the figure tapped, and the policy said "a few
    // figures" and "some fitness figures" reach Google Analytics. Now none
    // does, and analyticsHealthFigures.test.ts refuses a parameter named
    // for one (legal audit 3.3). The policy says so in sections 1, 2 and 8.
    const GUARD = read("./analyticsHealthFigures.test.ts");
    expect(GUARD).toMatch(/const FIGURE_WORDS = \{/);
    expect(GUARD).toMatch(
      /only `analyticsClient\.ts` calls `logAnalyticsEvent`/
    );
    expect(PRIVACY_PROSE).not.toMatch(
      /a few figures about them|some fitness figures|figures about sessions reach/i
    );
    expect(
      policySection("1. Information We Collect", "2. How We Use Your Data")
    ).toMatch(/They carry no figure about your body, food or training/);
    expect(PRIVACY_PROSE).toMatch(
      /It receives no figure about your body, food, sleep, heart or training/
    );
    expect(policySection("8. Health & Fitness Data", "9. Children")).toMatch(
      /None of it is sent to Google Analytics/
    );
  });

  it("makes no 'exclusively' or 'solely' claim about how data is used", () => {
    // Usage events reach Google Analytics, so a claim that data is used for
    // one purpose alone is untrue.
    expect(PRIVACY_PROSE).not.toMatch(/exclusively|solely/i);
  });

  it("names the deletion path the app has", () => {
    expect(PRIVACY_PROSE).toMatch(/Settings &gt; Account &gt; Delete account/);
    expect(SETTINGS_INDEX).toMatch(/label: "Account"/);
    expect(ACCOUNT_SECTION).toMatch(/label="Delete account"/);
  });
});

describe("who sees what, as the code lets them", () => {
  const SHARING = () => policySection("4. Data Sharing", "5. Your Rights");

  it("a public post opens signed out on troposfit.com, a followers-only or private one never does", () => {
    // publicPostPage serves /activity/<id> on troposfit.com to anyone, and
    // answers only a public post; the policy said only "other signed-in
    // Tropos users" (legal audit 3.2).
    const POST = FUNCTIONS("publicPost.js");
    expect(POST).toMatch(/const PUBLIC_ORIGIN = "https:\/\/troposfit\.com";/);
    expect(POST).toMatch(
      /if \(post\.visibility !== "public" \|\| post\.flagged === true\) return null;/
    );
    // What the page shows: the name and photo, the figures, the cut route.
    expect(POST).toMatch(/view\.authorPhotoURL = photo;/);
    expect(POST).toMatch(/view\.paceSecPerKm = /);
    expect(POST).toMatch(/view\.totalVolumeKg = volume;/);
    expect(POST).toMatch(/if \(route\) view\.route = route;/);
    expect(FUNCTIONS("publicRoute.js")).toMatch(/const END_CUT_M = [1-9]\d*;/);
    // Every answer asks search engines not to index it (#3460).
    expect(POST).toMatch(/const NO_INDEX = "noindex";/);
    expect(POST).toMatch(/res\.set\("X-Robots-Tag", NO_INDEX\);/);
    expect(POST).toMatch(
      /const ROBOTS_TAG = `<meta name="robots" content="\$\{NO_INDEX\}" \/>`;/
    );
    const sharing = SHARING();
    expect(sharing).toMatch(/can open it on troposfit\.com, signed in or not/);
    expect(sharing).toMatch(/The page asks search engines not to list it\./);
    expect(sharing).not.toMatch(
      /search engine that finds the link may list it/
    );
    expect(sharing).toMatch(/display name and profile photo/);
    expect(sharing).toMatch(/with the start and finish cut off/);
    expect(sharing).toMatch(
      /A followers-only or private post never opens there/
    );
  });

  it("segments: the line read by id by anyone signed in, times private, a best time to followers, reportable", () => {
    expect(FIRESTORE_RULES).toMatch(
      /match \/segments\/\{segmentId\} \{ allow get: if request\.auth != null; allow list: if false;/
    );
    expect(FIRESTORE_RULES).toMatch(
      /match \/users\/\{uid\}\/segmentEfforts\/\{effortId\} \{ allow read: if isOwner\(uid\);/
    );
    const SEGMENTS = FUNCTIONS("segments.js");
    // The board: only from a post followers or everyone can see, never an
    // effort starting or ending in a zone, read through the viewer's
    // following list.
    expect(SEGMENTS).toMatch(
      /const SHOWN_VISIBILITIES = Object\.freeze\(\["followers", "public"\]\);/
    );
    expect(SEGMENTS).toMatch(
      /inAnyZone\(effort\.start, zones\) \|\| inAnyZone\(effort\.end, zones\)/
    );
    expect(SEGMENTS).toMatch(
      /async function readSegmentBoard[\s\S]*collection\("following"\)/
    );
    expect(read("../socialApi.ts")).toMatch(
      /REPORT_TARGET_TYPES = \[[^\]]*"segment"/
    );
    const sharing = SHARING();
    expect(sharing).toMatch(
      /Anyone signed in can open its line, name and length/
    );
    expect(sharing).toMatch(/where only they see it/);
    expect(sharing).toMatch(/shown to your accepted followers/);
    expect(sharing).toMatch(
      /neither its start nor its end is in one of your privacy zones/
    );
    expect(sharing).toMatch(/Anyone else can report a segment/);
    expect(
      policySection("1. Information We Collect", "2. How We Use Your Data")
    ).toMatch(/Segments \(optional\)/);
  });

  it("names everything in the social list that the rules and the server keep", () => {
    // Each kept thing, with the words section 1 names it by (legal audit
    // 3.2's "Social Activity list is short").
    const KEPT: Array<[evidence: boolean, words: RegExp]> = [
      [
        /match \/users\/\{uid\}\/hiddenPosts\/\{activityId\}/.test(
          FIRESTORE_RULES
        ),
        /the posts you hide from your feed/,
      ],
      [
        /match \/blocks\/\{uid\}\/users\/\{targetUid\}/.test(FIRESTORE_RULES),
        /the people you block/,
      ],
      [
        /match \/goalSpaces\/\{spaceId\}\/meetups\/\{meetupId\} \{ allow read: if isGoalSpaceMember\(spaceId\);/.test(
          FIRESTORE_RULES
        ),
        /Circle check-ins and meet-ups/,
      ],
      [
        /'currentValue', 'tierAchieved', 'joinedAt', 'displayName', 'photoURL', 'uid'/.test(
          FIRESTORE_RULES
        ),
        /the challenges you join with your progress and place in them/,
      ],
      [/'medalSummary'/.test(FIRESTORE_RULES), /the medals they award/],
      [
        /standings\/\{uid\} \{ uid, name, photo, tier, points, done,/.test(
          FUNCTIONS("leagues.js")
        ),
        /your weekly league standing if you join the league/,
      ],
      [
        /'trainingForSpaceId'/.test(FIRESTORE_RULES),
        /a race you choose to show on your profile/,
      ],
      [
        /invitedBy: inviterUid/.test(FUNCTIONS("inviteCodes.js")),
        /who invited you, if you joined from someone’s invite/,
      ],
    ];
    const social = PRIVACY_PROSE.slice(
      PRIVACY_PROSE.indexOf("Social Activity (optional)")
    ).slice(0, 900);
    for (const [evidence, words] of KEPT) {
      expect(evidence, String(words)).toBe(true);
      expect(social).toMatch(words);
    }
  });

  it("says who sees a meet-up, a challenge place and a league standing", () => {
    expect(FUNCTIONS("leagueRules.js")).toMatch(/const GROUP_TARGET = 20;/);
    expect(FUNCTIONS("leagues.js")).toMatch(/function leagueFirstName\(/);
    const sharing = SHARING();
    expect(sharing).toMatch(
      /a Circle meet-up \(what it is, when, the place, note and pace groups you type, and who is going\) by the Circle’s members/
    );
    expect(sharing).toMatch(
      /If you join a challenge, your name, photo and progress in it are visible to other signed-in Tropos users/
    );
    expect(sharing).toMatch(
      /the people in your group \(about 20\) see your first name/
    );
  });

  it("says Space posts, their comments and props, and who joined are open to anyone signed in", () => {
    // spaces/{id}/posts with its likes and comments, and spaces/{id}/members
    // all read on `request.auth != null`, and the Space page lists posts
    // before Join. The policy said Space posts were seen by "the people in
    // that Space" (fact-check of #3408).
    const spaces = FIRESTORE_RULES.slice(
      FIRESTORE_RULES.indexOf("match /spaces/{spaceId} {")
    );
    for (const block of [
      "members/{uid}",
      "posts/{postId}",
      "likes/{likeUid}",
      "comments/{commentId}",
    ]) {
      expect(spaces).toContain(
        `match /${block} { allow read: if request.auth != null;`
      );
    }
    const SPACE_PAGE = read("../../pages/Space.tsx");
    expect(SPACE_PAGE).toMatch(/memberPosts\.map\(renderPost\)/);
    expect(SPACE_PAGE).toMatch(/"Join to post here\."/);
    expect(read("../socialApi.ts")).toMatch(
      /collection\(db, "spaces", spaceId, "members"\)/
    );
    const sharing = SHARING();
    expect(sharing).toMatch(
      /anyone signed in to Tropos can read a Space’s posts, the comments and props on them, and who has joined it \(each member’s name and photo\), whether or not they have joined it themselves/
    );
    expect(sharing).toMatch(
      /Comments on a session you share are seen by whoever can see that session/
    );
    expect(FIRESTORE_RULES).toMatch(
      /match \/comments\/\{activityId\}\/items\/\{commentId\} \{ allow read: if canReadActivityChild\(activityId\);/
    );
    expect(PRIVACY_PROSE).not.toMatch(/Space posts are seen by the people/);
  });

  it("says what a profile holds that the app does not show, and that names can be searched", () => {
    // The public profile is listed and read by anyone signed in (search is a
    // collection-group query on it), and its allowlist carries the setup
    // answer, the account's creation time and the streak's last day. The
    // profile page reads none of the three.
    const profileRule = FIRESTORE_RULES.slice(
      FIRESTORE_RULES.indexOf("match /users/{uid}/public/{doc} {")
    ).slice(0, 2600);
    expect(profileRule).toMatch(/allow list: if request\.auth != null;/);
    for (const field of ["athleteType", "createdAt", "lastActiveDate"]) {
      expect(profileRule).toContain(`'${field}'`);
    }
    expect(collapsed("../socialApi.ts")).toMatch(
      /collectionGroup\(db, "public"\), where\("displayNameLower", ">=", lower\)/
    );
    const PROFILE_DATA = read("../../hooks/useUserProfileData.ts");
    expect(PROFILE_DATA).not.toMatch(/athleteType|pubData\.createdAt/);
    const sharing = SHARING();
    expect(sharing).toMatch(
      /Anyone signed in can find you by searching for your name/
    );
    expect(sharing).toMatch(
      /whether you set up Tropos to lift, run or both, when your account was made and the last day your streak counted\. The app does not show those three to other people, but anyone signed in can read them/
    );
  });

  it("names the run map images Cloud Storage keeps", () => {
    expect(STORAGE_RULES).toMatch(
      /match \/route-maps\/\{uid\}\/\{activityId\}\/\{name\}/
    );
    expect(PRIVACY_PROSE).toMatch(
      /Cloud Storage \(progress, profile, post and Space photos, and the map images of runs you share\)/
    );
    expect(PRIVACY_PROSE).toMatch(/Run Map Images \(optional\)/);
  });
});

describe("what the fact-check of #3408 found left out, as the code keeps it", () => {
  it("names the setup choices analytics receives, and that diary events carry counts", () => {
    expect(collapsed("../../pages/Onboarding.tsx")).toMatch(
      /trackLifecycle\("onboarding_completed", \{ primaryGoal, daysPerWeek, runMode: effectiveRunMode, \}\)/
    );
    expect(read("../../pages/Home.tsx")).toMatch(
      /sport: setupSport\(profile\)/
    );
    // The examples the policy gives are in the goal's own list, and the run
    // modes are the three it names.
    expect(read("../auth.tsx")).toMatch(
      /primaryGoal\?: "hypertrophy" \| "strength" \| "fat_loss" \| "general" \| "running";/
    );
    expect(read("../onboardingRunMode.ts")).toMatch(
      /export type OnboardingRunMode = "freeform" \| "race_prep" \| "starter";/
    );
    expect(read("../../components/food/FoodTimeline.tsx")).toMatch(
      /itemCount: entries\.length/
    );
    expect(PRIVACY_PROSE).toMatch(
      /It receives the choices you made in setup: your goal \(such as building muscle or losing fat\), how many days a week you train, whether you lift, run or both, and whether your runs follow a race plan, a starter plan or neither\./
    );
    expect(PRIVACY_PROSE).toMatch(
      /Events from your food diary carry counts, such as how many rows a day shows, never what is in them\./
    );
  });

  it("says a new segment is matched with its maker's own latest runs, at the code's number", () => {
    const declared = FUNCTIONS("segments.js").match(
      /const BACKFILL_RUNS = (\d+);/
    );
    expect(declared).not.toBeNull();
    expect(policySection("4. Data Sharing", "5. Your Rights")).toContain(
      `When you make a segment, your own last ${declared![1]} runs are checked against it too.`
    );
  });

  it("says reset and invite-lookup records hold a coded form, kept up to a day", () => {
    // Both keys are a SHA-256 of what was typed or of the caller's IP, and
    // every rateLimits record expires a window after its last call; no
    // window here is longer than a day.
    expect(FUNCTIONS("emailRateLimit.js")).toMatch(
      /function passwordResetKey\(email\) \{ const hash = crypto \.createHash\("sha256"\)/
    );
    expect(FUNCTIONS("passwordResetRequest.js")).toMatch(
      /key: passwordResetKey\(email\)/
    );
    expect(FUNCTIONS("inviteCodes.js")).toMatch(
      /function lookupKey\(ip\) \{ const hash = crypto \.createHash\("sha256"\)/
    );
    const INDEX = collapsed("../../../functions/index.js");
    expect(INDEX).toMatch(
      /const key = inviteCodes\.lookupKey\( context\.rawRequest && context\.rawRequest\.ip \);/
    );
    expect(INDEX).toMatch(
      /isRateLimited\(key, "inviteLookup", 20, 3_600_000\)\) \|\| \(await isRateLimited\(key, "inviteLookupDay", 60, 86_400_000\)\)/
    );
    const windows = [
      ...FUNCTIONS("emailRateLimit.js").matchAll(
        /windowMs: ([A-Z_]+|\d+ \* [A-Z_]+),/g
      ),
    ].map((m) => m[1]);
    expect(windows).toEqual([
      "5 * MINUTE_MS",
      "DAY_MS",
      "10 * MINUTE_MS",
      "DAY_MS",
    ]);
    expect(collapsed("../../../functions/rateLimiter.js")).toMatch(
      /expiresAt: new Date\(now \+ windowMs\)/
    );
    expect(PRIVACY_PROSE).toMatch(
      /A record of a password-reset request holds a coded form of the email address a reset was asked for, never the address itself, and is kept for up to a day after the last request\./
    );
    expect(PRIVACY_PROSE).toMatch(
      /our server keeps a coded form of your connection’s IP address, never the address itself, for up to a day after the last lookup/
    );
    expect(PRIVACY_PROSE).not.toMatch(
      /which hold the email address a reset was asked for/
    );
  });

  it("names in-app notifications, the name they carry, and how long they are kept", () => {
    const FANOUT = FUNCTIONS("socialFanout.js");
    const days = FANOUT.match(/const NOTIFICATION_RETENTION_DAYS = (\d+);/);
    expect(days).not.toBeNull();
    expect(FANOUT).toMatch(/out\.fromName = data\.fromName/);
    expect(FANOUT).toMatch(
      /expiresAt: new Date\(Date\.now\(\) \+ NOTIFICATION_RETENTION_DAYS \* DAY_MS\)/
    );
    expect(collapsed("../../../firestore.indexes.json")).toMatch(
      /"collectionGroup": "items", "fieldPath": "expiresAt", "ttl": true/
    );
    // Gone with the recipient's account, and with the sender's.
    expect(read("../../../functions/accountDeletion.js")).toMatch(
      /\{ parent: "notifications", sub: "items" \}/
    );
    expect(FUNCTIONS("accountDeletionSocial.js")).toMatch(
      /for \(const field of \["authorId", "fromUserId"\]\)[\s\S]*\(feeds\|notifications\)/
    );
    const sectionOne = policySection(
      "1. Information We Collect",
      "2. How We Use Your Data"
    );
    expect(sectionOne).toMatch(/Notifications in the app:/);
    expect(sectionOne).toMatch(/your name goes into the other person’s tray/);
    expect(sectionOne).toContain(
      `Each notice is deleted after ${days![1]} days, and when either account is deleted.`
    );
  });

  it("names saved routes and shoes, kept to the account and deleted with it", () => {
    const DELETION = read("../../../functions/accountDeletion.js");
    for (const sub of ["savedRoutes", "shoes"]) {
      expect(DELETION).toContain(`"${sub}",`);
      expect(FIRESTORE_RULES).toContain(`match /users/{uid}/${sub}/{`);
    }
    expect(read("../savedRoutes.ts")).toMatch(
      /export type SavedRouteSource = "gpx" \| "run" \| "planned";/
    );
    expect(read("../../hooks/useShoes.ts")).toMatch(/totalKm: number;/);
    const sectionOne = policySection(
      "1. Information We Collect",
      "2. How We Use Your Data"
    );
    expect(sectionOne).toMatch(
      /the routes you save to follow again \(a route you import, plan or keep from a run\), and the running shoes you add with the distance run in each/
    );
  });
});

describe("what the policy says about the build, food searches, alerts and errors holds", () => {
  it("says Watch runs and workout export are not in the App Store version while its build leaves them out", () => {
    // A standard (Release) build sets the connected training gate off: no
    // Watch app embedded and no workout write. The policy describes both
    // "when available". Flip the gate for release and this fails until the
    // policy stops saying they are not there yet.
    const released =
      resolvedSetting("App", "Release", "WATCH_RUN_RELEASE_ENABLED") === "YES";
    const notYet =
      /Apple Watch runs and workout export are not yet in the App Store version of Tropos/;
    if (released) {
      expect(PRIVACY_PROSE).not.toMatch(notYet);
    } else {
      expect(PRIVACY_PROSE).toMatch(notYet);
      expect(PRIVACY_PROSE).toMatch(/When available, Apple Watch runs/);
      expect(PRIVACY_PROSE).toMatch(
        /when available, run heart rate and workout export/
      );
    }
  });

  it("food searches go from the phone to Open Food Facts, and nothing keeps them", () => {
    // The search is a fetch from the Food page; no server code asks Open
    // Food Facts anything, so nothing of ours sees the words. The label
    // says "not collected" for the same reason.
    expect(read("../../pages/Food.tsx")).toMatch(
      /fetch\(\s*`https:\/\/world\.openfoodfacts\.org\/cgi\/search\.pl\?search_terms=/
    );
    const server = readdirSync(resolve(repoRoot, "functions/lib"))
      .filter((f) => f.endsWith(".js"))
      .map((f) => readFileSync(resolve(repoRoot, "functions/lib", f), "utf8"))
      .concat(readFileSync(resolve(repoRoot, "functions/index.js"), "utf8"));
    expect(server.some((s) => /openfoodfacts/i.test(s))).toBe(false);
    // The label's answers: in listing.md, or in the submission pack that
    // replaces it (listing.md then points there).
    const label = ["submission-pack.md", "listing.md"]
      .map((f) => resolve(repoRoot, "docs/app-store", f))
      .filter((path) => existsSync(path))
      .map((path) => readFileSync(path, "utf8"))
      .join(" ")
      .replace(/\s+/g, " ");
    expect(label).toMatch(
      /Food searches\*\* go from the phone straight to Open Food Facts and are not stored/
    );
    expect(PRIVACY_PROSE).toMatch(
      /Tropos keeps none of your searches \(section 7\)/
    );
    expect(PRIVACY_PROSE).toMatch(
      /no account details are sent, and Tropos keeps none of your searches\./
    );
    expect(PRIVACY_PROSE).not.toMatch(/barcode scans, food searches, and/);
  });

  it("names the report alert Resend carries", () => {
    // createReport emails the owner through Resend with the reason, the
    // kind of thing and the reporter's note (functions/lib/reportAlert.js).
    const ALERT = FUNCTIONS("reportAlert.js");
    expect(ALERT).toMatch(/row\("Note", note \?/);
    expect(ALERT).toMatch(/row\("Reason", escapeHtml\(reason\)\)/);
    const resend = PRIVACY_PROSE.slice(
      PRIVACY_PROSE.indexOf("Resend:</strong>")
    ).slice(0, 700);
    expect(resend).toMatch(/the alert Tropos gets when someone makes a report/);
    expect(resend).toMatch(/any note the person reporting wrote/);
  });

  it("says error reports keep the screen's address, names and ids taken out, and the user agent", () => {
    // The address goes through redactPageUrl (#3462; the fact-check found
    // the full href stored before it). The example the policy gives is the
    // function's own answer.
    const REPORTING = collapsed("../errorReporting.ts");
    expect(REPORTING).toMatch(
      /url: [^,]*redactPageUrl\(window\.location\.href/
    );
    expect(
      redactPageUrl("https://troposfit.com/history/exercise/My%20Secret%20Lift")
    ).toBe("https://troposfit.com/history/exercise/:id");
    expect(PRIVACY_PROSE).toMatch(
      /the address of the screen the app was on with any name or id in it taken out \(an exercise’s page is kept as \/history\/exercise\/:id, never with the exercise’s name\)/
    );
    expect(
      policySection("1. Information We Collect", "2. How We Use Your Data")
    ).toMatch(/the address of the screen \(any name or id in it taken out\)/);
    expect(REPORTING).toMatch(
      /userAgent: typeof navigator !== "undefined" \? navigator\.userAgent/
    );
    expect(PRIVACY_PROSE).toMatch(
      /and your device’s browser or app details \(its user agent\)/
    );
  });
});

describe("transfers, legal bases and complaints (UK GDPR Art. 13)", () => {
  it("names where the server runs and both transfer safeguards", () => {
    // No function sets a region, so every one runs in us-central1, the
    // default the Hosting rewrite names; Gemini runs in Vertex AI's `us`.
    expect(read("../../../firebase.json")).toMatch(
      /"functionId": "publicPostPage",\s*"region": "us-central1"/
    );
    for (const source of [
      read("../../../functions/index.js"),
      ...readdirSync(resolve(repoRoot, "functions/lib"))
        .filter((f) => f.endsWith(".js"))
        .map((f) =>
          readFileSync(resolve(repoRoot, "functions/lib", f), "utf8")
        ),
    ]) {
      expect(source).not.toMatch(/\.region\(|\bregion:\s*["']/);
    }
    expect(FUNCTIONS("foodModel.js")).toMatch(
      /const FOOD_MODEL_LOCATION = "us";/
    );
    const where = PRIVACY_PROSE.slice(
      PRIVACY_PROSE.indexOf("Where your data goes.")
    ).slice(0, 1000);
    expect(where).toMatch(/Google Cloud’s us-central1 region/);
    expect(where).toMatch(/Vertex AI analyses meals in the US/);
    for (const name of ["RevenueCat", "Resend", "Stripe"]) {
      expect(where).toContain(name);
    }
    expect(where).toMatch(/UK Extension to the EU-US Data Privacy Framework/);
    expect(where).toMatch(
      /International Data Transfer Addendum to the EU standard contractual clauses/
    );
  });

  it("gives a legal basis for each purpose, and Article 9's condition for health data", () => {
    const gdpr = policySection("6. GDPR Compliance", "7. Third-Party Services");
    expect(PRIVACY_PROSE).toMatch(/<th scope="col"/);
    for (const basis of [
      /basis: "Contract:/,
      /"Your explicit consent \(UK GDPR Article 9\(2\)\(a\)\), which you give in setup before the questions about your body, or, for an account made before that question was added, the first time you open Tropos after the update\. You can withdraw it by deleting your account\."/,
      /"Your consent, asked before the first one is sent/,
      /"Legitimate interests: knowing how the app is used/,
      /"Legitimate interests: keeping Tropos and the people on it safe\."/,
      /"Your consent, asked in setup and in Settings > Notifications, off until you turn it on\. We keep when you said yes or no and to which words\./,
      /"Contract: it is part of the service you asked for when you shared the card\."/,
      /"Legitimate interests: knowing how many people start Tropos and where they stop, without telling anyone apart\."/,
      /"Legitimate interests: not sending you reminders you do not want\."/,
    ]) {
      expect(PRIVACY_PROSE).toMatch(basis);
    }
    // The health row lists what the consent screen names (#3471's words):
    // each thing the screen says Tropos stores is in the row.
    const healthRow = PRIVACY_PROSE.slice(
      PRIVACY_PROSE.indexOf('"Your health details:'),
      PRIVACY_PROSE.indexOf('"Your health details:') + 200
    );
    for (const named of [
      "weight",
      "height",
      "injuries",
      "steps",
      "the food you log",
      "the heart rate from your runs",
    ]) {
      expect(HEALTH_CONSENT_COPY.stored).toContain(named);
      expect(healthRow).toContain(named);
    }
    expect(PRIVACY_PROSE).toMatch(
      /"Your health details: weight, height, injuries, steps, the food you log, the heart rate from your runs, and anything else you allow from Apple Health"/
    );
    // Sex is not special category data under UK GDPR: it is with the plan,
    // under contract, and the health row does not name it.
    expect(healthRow).not.toMatch(/\bsex\b/);
    expect(PRIVACY_PROSE).toMatch(
      /"Your account, your plan and logs \(with your sex for the calorie calculation, if you give it\)/
    );
    // The consent row for the chosen emails rests on the server's record.
    expect(FUNCTIONS("emailConsent.js")).toMatch(/givenAt/);
    // The one line that gave everything one basis is gone.
    expect(gdpr).not.toMatch(/provided during account creation/);
    expect(gdpr).toMatch(/Right to object:/);
  });

  it("says how to complain to Tropos and to the ICO", () => {
    // DPA 2018 s.164A: a complaint is acknowledged within 30 days.
    const gdpr = policySection("6. GDPR Compliance", "7. Third-Party Services");
    expect(gdpr).toMatch(
      /We acknowledge a complaint no later than 30 days after we receive it/
    );
    expect(gdpr).toMatch(/Information Commissioner’s Office \(ICO\)/);
    expect(gdpr).toMatch(/href="https:\/\/ico\.org\.uk"/);
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

describe("what shipped after the draft, as the code on main does it", () => {
  it("shared cards: what the copy holds, who sees it, search, and how long it lasts", () => {
    const CARDS = FUNCTIONS("sharedCards.js");
    const PAGE = FUNCTIONS("sharedCardPage.js");
    // The copy holds figures and words, field by field; no route, point,
    // photo or name is among them.
    const figures = CARDS.split(
      "const TEMPLATE_FIGURES = Object.freeze("
    )[1].split("});")[0];
    expect(figures).not.toMatch(/route|coord|lat|lng|photo|name/i);
    expect(figures).toMatch(
      /nutrition: \["calories", "calorieTarget", "protein", "carbs", "fat"\]/
    );
    expect(CARDS).toMatch(/const UNSOURCED_CARD_DAYS = 30;/);
    expect(PAGE).toMatch(/res\.set\("X-Robots-Tag", NO_INDEX\)/);
    expect(CARDS).toMatch(/const firstName = firstNameOf\(/);
    expect(collapsed("../../../functions/accountDeletion.js")).toMatch(
      /\.collection\("sharedCards"\) \.where\("ownerUid", "==", uid\)/
    );
    const cards = policySection("Shared cards.", "Spaces you join.");
    for (const claim of [
      /Anyone with the link can open it, signed in or not, and the page asks search engines not to list it\./,
      /never a route, a coordinate, the photo the card was drawn on or your full name\./,
      /names you by your first name/,
      /invite code you had when you shared it is still yours/,
      /A card of a post or a session stops opening when you delete that post or session/,
      /A card of a day’s food or a week opens for 30 days and is then deleted\./,
      /Deleting your account deletes them all\./,
    ]) {
      expect(cards).toMatch(claim);
    }
  });

  it("Spaces: public posts routed in, and a week's totals with their floor", () => {
    expect(FUNCTIONS("spaceFeed.js")).toMatch(
      /const JOIN_BACKFILL_DAYS = 28; const JOIN_BACKFILL_MAX = 20;/
    );
    expect(FUNCTIONS("spaceWeeks.js")).toMatch(
      /const SPACE_WEEK_MIN_MEMBERS = 5;/
    );
    expect(PRIVACY_PROSE).toMatch(
      /including up to 20 from the 28 days before you joined\./
    );
    expect(PRIVACY_PROSE).toMatch(
      /shown only once at least 5 members trained that week\./
    );
  });

  it("a meet-up's typed words and who is going, to the Circle's members", () => {
    const MEETUPS = FUNCTIONS("circleMeetups.js");
    expect(MEETUPS).toMatch(/paceGroups/);
    expect(MEETUPS).toMatch(/note/);
    expect(PRIVACY_PROSE).toMatch(
      /a Circle meet-up \(what it is, when, the place, note and pace groups you type, and who is going\) by the Circle’s members/
    );
  });

  it("names the first-run events and the launch numbers, and how to turn analytics off", () => {
    const FIRST_RUN = read("../firstRunEvents.ts");
    expect(FIRST_RUN).toMatch(/track\("trial_offer_viewed"/);
    // The welcome and setup's start are the server's counts, never Google's.
    for (const event of ["welcome_viewed", "setup_started"]) {
      expect(FIRST_RUN).not.toMatch(new RegExp(`track\\("${event}"`));
      expect(FIRST_RUN).toMatch(new RegExp(`countSetupStep\\("${event}"\\)`));
    }
    expect(read("../auth.tsx")).toMatch(
      /trackLifecycle\("account_created", \{ method \}\)/
    );
    const LAUNCH = collapsed("../launchEvents.ts");
    expect(LAUNCH).toMatch(/kind: value\.kind, daysSinceSetup:/);
    expect(LAUNCH).toMatch(
      /purchasePlatform: value\.source === "ios_iap" \? "ios" : "web"/
    );
    const analytics = policySection(
      "2. How We Use Your Data",
      "3. Data Storage"
    );
    for (const claim of [
      /each sent once: your account made and how \(Apple, Google or email\), setup finished, and the trial offer seen\./,
      /your first saved session and whether it was a lift or a run, a session in your fourth week, and your first trial and first paid period, with whether each was bought in the app or on the web\./,
      /with Share usage analytics in Settings &gt; Social &amp; privacy/,
    ]) {
      expect(analytics).toMatch(claim);
    }
    // The switch is where the policy says, and it is the one switch.
    expect(read("../../pages/settings/SettingsPrivacy.tsx")).toMatch(
      /<UsageAnalyticsGroup /
    );
    expect(read("../../components/settings/UsageAnalyticsGroup.tsx")).toMatch(
      /label="Share usage analytics"/
    );
    // No user id goes to analytics: the events are the installation's.
    expect(read("../analyticsProvider.ts")).not.toMatch(/setUserId/);
    expect(PRIVACY_PROSE).toMatch(
      /tied to an identifier for this installation of the app, not to your account\./
    );
  });

  it("setup before an account: kept on the phone, for the code's times", () => {
    expect(read("../signedOutDraft.ts")).toMatch(
      /SIGNED_OUT_DRAFT_TTL_MS = 2 \* 24 \* 60 \* 60 \* 1000;/
    );
    const SAVE = read("../setupSave.ts");
    expect(SAVE).toMatch(
      /SIGNED_OUT_AGREEMENT_MAX_AGE_MS = 2 \* 24 \* 60 \* 60 \* 1000;/
    );
    expect(SAVE).toMatch(
      /SIGNED_OUT_AGREEMENT_MAX_AWAY_MS = 2 \* 60 \* 60 \* 1000;/
    );
    expect(SAVE).toMatch(
      /export function signedOut\(\): void \{\s+remove\(SETUP_SAVE_KEY\);\s+forgetSignedOutDraft\(\);/
    );
    const setup = policySection(
      "Setup Before You Have an Account:",
      "Activity Data:"
    );
    for (const claim of [
      /are kept only on your phone or in your browser, and none of them is sent to our servers\./,
      /They are kept for 2 days from your last answer/,
      /deleted at once when you sign out/,
      /that agreement lapses after 2 days, after 2 hours with Tropos in the background, or when the app is closed/,
    ]) {
      expect(setup).toMatch(claim);
    }
  });

  it("sex is optional, and the maths take the midpoint without it", () => {
    expect(read("../../pages/Onboarding.tsx")).toMatch(
      /\{ value: "unspecified", label: "Prefer not to say" \}/
    );
    expect(read("../../components/settings/ProfileInfoSection.tsx")).toMatch(
      /\{ value: "unset", label: "Not set" \}/
    );
    expect(read("../sex.ts")).toMatch(
      /isSex\(sex\) \? figures\[sex\] : \(figures\.male \+ figures\.female\) \/ 2/
    );
    expect(PRIVACY_PROSE).toMatch(
      /choose Prefer not to say in setup, or Not set on your profile in Settings, and Tropos stores none and uses a figure halfway between the male and female ones\./
    );
  });

  it("the push budget and a reminder going quiet, at the server's numbers", () => {
    expect(FUNCTIONS("pushBudget.js")).toMatch(
      /const DAILY_PUSH_LIMIT = 1; const WEEKLY_PUSH_LIMIT = 5;/
    );
    expect(FUNCTIONS("reminderAttention.js")).toMatch(
      /const IGNORED_LIMIT = 3;/
    );
    expect(PRIVACY_PROSE).toMatch(
      /Our server sends at most one notification a day, and 5 in any 7 days, that is not about something a person did/
    );
    expect(PRIVACY_PROSE).toMatch(
      /A reminder you leave unanswered 3 times running/
    );
  });

  it("the web checkout: RevenueCat Billing gets the account ID and the email, Stripe the card", () => {
    const PURCHASE = read("../purchaseProvider.ts");
    expect(PURCHASE).toMatch(/if \(email\) params\.set\("email", email\);/);
    expect(PURCHASE).toMatch(
      /https:\/\/pay\.rev\.cat\/\$\{encodeURIComponent\(token\)\}\/\$\{encodeURIComponent\(uid\)\}/
    );
    const processors = policySection(
      "7. Third-Party Services",
      "Where your data goes."
    );
    expect(processors).toMatch(
      /runs the checkout on the web \(RevenueCat Billing\)\. It holds your Tropos account ID and your purchase history, and for a purchase on the web, the email address you pay with\./
    );
    expect(processors).toMatch(/Tropos never receives your card details\./);
    // The old Stripe Checkout identifiers are no longer described as received.
    expect(processors).not.toMatch(
      /Stripe’s customer and subscription identifiers/
    );
  });

  it("a Google sign-in's name and photo seed the profile", () => {
    expect(read("../auth.tsx")).toMatch(
      /createDefaultProfile\(\s+uid,\s+cred\.user\.displayName \|\| "",\s+cred\.user\.photoURL \|\| null\s+\)/
    );
    expect(PRIVACY_PROSE).toMatch(
      /with Google, the photo on your Google account is your profile photo until you change it\./
    );
  });
});

/* Google Analytics hears nothing before the health-details agreement, whose
   line says so (owner, 23 November 2026); before it, the server keeps
   anonymous daily totals. Each claim the policy makes about that is held to
   the code that makes it true. */
describe("nothing goes to Google before the agreement screen", () => {
  const PROVIDER = collapsed("../analyticsProvider.ts");

  it("the policy says when analytics starts, what is counted before it, and that Google acts only for us", () => {
    const analytics = policySection(
      "2. How We Use Your Data",
      "3. Data Storage"
    );
    for (const claim of [
      /It starts at the health-details agreement in setup, which says so, or when you sign in to an account that has agreed\. Nothing is sent to Google before that screen, and after you sign out nothing is sent until you reach it again or sign in\./,
      /our own server counts only how many times a day the welcome screen is shown and setup is started, and how many accounts are made: totals with no identifier, sent without reading anything from your phone, which cannot be linked to you and are deleted after about 13 months\./,
      /Google’s data sharing settings, Google signals and ad personalisation are off for Tropos, so Google uses this data only to give us the analytics\./,
    ]) {
      expect(analytics).toMatch(claim);
    }
  });

  it("the provider delivers only once the line is met, and sign-out forgets it", () => {
    expect(PROVIDER).toMatch(
      /function delivers\(\): boolean \{ return metNotice\(\) && shares\(\); \}/
    );
    expect(PROVIDER).toMatch(
      /function metNotice\(\): boolean \{ return accountMetNotice \|\| noticeShownThisVisit; \}/
    );
    // Every event goes through the one gate, and init loads nothing before it.
    expect(PROVIDER).toMatch(/if \(!deliver\) return;/);
    expect(PROVIDER).toMatch(/applyWeb\(delivers\(\)\)/);
    expect(PROVIDER).toMatch(/await applyNative\(delivers\(\)\);/);
    expect(collapsed("../auth.tsx")).toMatch(/forgetAnalyticsNoticeShown\(\);/);
  });

  it("the line is met only on the agreement, or by an account that agreed", () => {
    const callers = sourceFiles("src")
      .filter((path) => !path.endsWith("/analyticsProvider.ts"))
      .filter((path) =>
        /noteAnalyticsNoticeShown\(\)|setAccountMetAnalyticsNotice\(/.test(
          readFileSync(path, "utf8")
        )
      )
      .map((path) => path.slice(path.indexOf("/src/") + 1))
      .sort();
    expect(callers).toEqual([
      "src/components/healthConsent/HealthConsentGate.tsx",
      "src/hooks/useAccountUsageAnalytics.ts",
      "src/pages/Onboarding.tsx",
    ]);
    expect(collapsed("../../pages/Onboarding.tsx")).toMatch(
      /const agreementShown = step === HEALTH_CONSENT_STEP \|\| healthConsentGiven;/
    );
    expect(collapsed("../../hooks/useAccountUsageAnalytics.ts")).toMatch(
      /hasCurrentHealthConsent\(profile\.healthDataConsent\)/
    );
    // Both screens carry the line.
    for (const screen of [
      "../../pages/Onboarding.tsx",
      "../../components/healthConsent/HealthConsentGate.tsx",
    ]) {
      expect(read(screen)).toMatch(/<AnalyticsNotice\b/);
    }
    expect(
      read("../../components/healthConsent/AnalyticsNotice.tsx")
    ).toMatch(/\{USAGE_ANALYTICS_NOTICE\}/);
  });

  it("Turn off on that screen stops it at once, and setup's choice reaches the account", () => {
    expect(PRIVACY_PROSE).toMatch(
      /with Turn off on that screen or with Share usage analytics in Settings &gt; Social &amp; privacy\. Off, the phone or browser you are using stops sending anything to Google Analytics at once/
    );
    expect(PRIVACY_PROSE).toMatch(
      /If you turn it off in setup before you have an account, the account keeps that choice when it is made\./
    );
    // The line's Turn off is on both screens and turns this device off.
    const NOTICE = collapsed("../../components/healthConsent/AnalyticsNotice.tsx");
    expect(NOTICE).toMatch(/onClick=\{onTurnOff\}/);
    const SETUP = collapsed("../../pages/Onboarding.tsx");
    expect(SETUP).toMatch(
      /const turnOffAnalytics = \(\) => \{ setUsageAnalytics\(false\);/
    );
    expect(SETUP).toMatch(/<AnalyticsNotice off=\{analyticsOff\} onTurnOff=\{turnOffAnalytics\}/);
    // Setup sends it with the plan, and the server writes it onto an
    // account that has no answer of its own.
    expect(SETUP).toMatch(
      /\.\.\.\(usageAnalyticsOnThisDevice\(\) \? \{\} : \{ usageAnalytics: false \}\)/
    );
    expect(FUNCTIONS("setupAnalyticsChoice.js")).toMatch(
      /if \(existing === true \|\| existing === false\) return undefined;/
    );
    expect(collapsed("../../../functions/index.js")).toMatch(
      /nextProfileData\.usageAnalytics = usageAnalytics;/
    );
    // On the agreement's own screen it writes the account, as Settings does.
    expect(
      collapsed("../../components/healthConsent/HealthConsentRoutes.tsx")
    ).toMatch(/updateProfile\(\{ usageAnalytics: false \}\)/);
  });

  it("the iPhone's SDK collects nothing before the line, from a fresh install", () => {
    const plist = read("../../../ios/App/App/Info.plist").replace(/\s+/g, " ");
    expect(plist).toMatch(
      /<key>FIREBASE_ANALYTICS_COLLECTION_ENABLED<\/key> <false\/>/
    );
  });

  it("the setup counts read nothing from the phone and keep no identifier", () => {
    const CLIENT = collapsed("../setupCounts.ts");
    expect(CLIENT).toMatch(/credentials: "omit"/);
    expect(CLIENT).toMatch(/body: JSON\.stringify\(\{ step \}\)/);
    expect(CLIENT).not.toMatch(/localStore|localStorage|httpsCallable|getToken/);
    const SERVER = FUNCTIONS("setupCounts.js");
    expect(SERVER).toMatch(
      /\[step\]: FieldValue\.increment\(1\), updatedAt: FieldValue\.serverTimestamp\(\), expiresAt: setupCountsExpiresAt\(key\),/
    );
    expect(SERVER).toMatch(/const KEEP_DAYS = 400;/);
    expect(FIRESTORE_RULES).toMatch(
      /match \/setupCounts\/\{dateKey\} \{ allow read, write: if false; \}/
    );
  });
});

describe("section 7: the web checkout is RevenueCat Billing with Stripe", () => {
  it("names RevenueCat Billing and Stripe, and no other payment processor", () => {
    const thirdParties = policySection(
      "7. Third-Party Services",
      "8. Health & Fitness Data"
    );
    expect(thirdParties).toMatch(/runs the checkout on the web \(RevenueCat Billing\)/);
    expect(thirdParties).toMatch(/takes the payment for Pro bought on the web, through RevenueCat’s checkout\./);
    expect(PRIVACY_PROSE).not.toMatch(/Paddle|Lemon Squeezy|merchant of record/i);
  });
});
