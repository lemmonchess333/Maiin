/**
 * `functions/lib/raceTemplateIds.js` ↔ `RUN_TEMPLATES` — set equality.
 *
 * The server cannot import `RUN_TEMPLATES`, so it carries an id list. That
 * is a TESTED-COPY on the same terms as `spaceIds.js`: without this pin,
 * adding a race template teaches the client about it and leaves the server
 * silently blind — and "blind" here means `dailyRaceReconciliationSweep`
 * marks that race a no-show and the post-race recovery entry never fires.
 *
 * That is not hypothetical. Until 2026-07-26 the server compared
 * `actualTemplateId` against the literal `"race"`, which no doc ever
 * carries, so it read EVERY completed race as a no-show. Its own fixtures
 * used `"race"` for the accept case and real ids for the rejects, so the
 * rejections were honest and the acceptance was fiction. This test exists
 * so the id list — the thing that replaced that literal — cannot drift.
 *
 * Set equality in BOTH directions on purpose: a missing id blinds the
 * server, and an extra id makes it accept a template the client would
 * never schedule as a race.
 */
import { describe, it, expect } from "vitest";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  RACE_TEMPLATE_IDS,
  isRaceTemplateId,
} = require("../../../functions/lib/raceTemplateIds");

describe("race-template id mirror", () => {
  it("matches the race-TYPE entries in RUN_TEMPLATES exactly", () => {
    const client = RUN_TEMPLATES.filter((t) => t.type === "race")
      .map((t) => t.id)
      .sort();
    const server = [...(RACE_TEMPLATE_IDS as string[])].sort();
    expect(server).toEqual(client);
  });

  it("is non-empty — an empty list would pass set-equality vacuously", () => {
    // If RUN_TEMPLATES ever lost its race entries, both sides would be []
    // and the test above would still pass while the server accepted
    // nothing. Guard the floor.
    expect((RACE_TEMPLATE_IDS as string[]).length).toBeGreaterThan(0);
  });

  it("recognises every real id and rejects the impossible literal", () => {
    for (const id of RACE_TEMPLATE_IDS as string[]) {
      expect(isRaceTemplateId(id), `id ${id}`).toBe(true);
    }
    // The value that shipped in the server's accept fixture for months.
    expect(isRaceTemplateId("race")).toBe(false);
    expect(isRaceTemplateId(undefined)).toBe(false);
    expect(isRaceTemplateId("easy_30")).toBe(false);
  });
});
