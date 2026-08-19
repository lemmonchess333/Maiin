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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(here, rel), "utf8");

const PRIVACY = read("../../pages/PrivacyPolicy.tsx");
const TERMS = read("../../pages/TermsOfService.tsx");
/** Same source with runs of whitespace collapsed. Every prose assertion
 *  below should use these: JSX wraps sentences at line boundaries, so a
 *  literal match fails on reformatting rather than on a meaning change. */
const PRIVACY_PROSE = PRIVACY.replace(/\s+/g, " ");
const TERMS_PROSE = TERMS.replace(/\s+/g, " ");
const STORE = read("../foodPhotoStore.ts");

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
  it("the Privacy Policy says server-side erasure is immediate", () => {
    expect(PRIVACY_PROSE).toMatch(/erased.{0,80}immediately/);
  });

  it("the Terms say the same thing", () => {
    expect(TERMS_PROSE).toMatch(/erased immediately/);
  });

  it("neither page still promises the stale 30-day window", () => {
    // `functions/accountDeletion.js` deletes synchronously and has no
    // retention window at all. The old wording was a weaker promise than
    // the behaviour, and it disagreed with nothing — which is how it
    // survived on both pages at once.
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
