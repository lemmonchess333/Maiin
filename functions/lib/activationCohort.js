"use strict";

/**
 * Which first-week journey a new account gets (XB1 call 9). The server
 * decides, so the comparison is measured on accounts the client cannot
 * choose between.
 *
 * - About 10% of new accounts take the legacy journey as a comparison
 *   group, chosen by a hash of the uid: stable across retries and devices,
 *   and unrelated to anything about the person.
 * - `system/config.activationJourneyV2Enabled`, set to the boolean false,
 *   puts every new account on the legacy journey without a release.
 * - `system/config.activationComparisonPercent`, a whole number from 0 to
 *   100, sets the comparison group's share; missing or malformed, it is
 *   10. 0 ends the comparison without a release, and the end-to-end rig
 *   sets 0 so its new accounts take the journey its specs walk.
 *
 * The switch lives in Firestore beside the deletion kill switch
 * (`deletionExecutorEnabled`), not in a functions env var: an env var
 * changes only with a functions deploy, and the point of the switch is to
 * act without one. It is read with a one-minute cache, since setup is the
 * only reader and a minute is soon enough. A missing doc or field, a value
 * that is not a boolean, or a failed read leaves v2 on, the journey the
 * app ships with.
 *
 * Both the comparison group and a switched-off journey are stamped version
 * 1, so the cohort report can tell them from accounts made before v2.
 */
const crypto = require("crypto");

const COMPARISON_PERCENT = 10;
const CACHE_MS = 60 * 1000;
let cached = null;

/** 0 to 99, from the uid alone. */
function cohortBucket(uid) {
  return (
    crypto.createHash("sha256").update(String(uid)).digest().readUInt32BE(0) %
    100
  );
}

function inComparisonGroup(uid, percent = COMPARISON_PERCENT) {
  return cohortBucket(uid) < percent;
}

/** The switch and the comparison share, read together with one cache. */
async function journeyConfig(db, now = Date.now()) {
  if (cached && now - cached.at < CACHE_MS) return cached.value;
  const value = { v2: true, comparisonPercent: COMPARISON_PERCENT };
  try {
    const snap = await db.doc("system/config").get();
    const data = (snap.exists && snap.data()) || {};
    const field = data.activationJourneyV2Enabled;
    if (field === false) value.v2 = false;
    else if (field !== undefined && field !== true)
      console.warn("activationCohort.switch_malformed", { type: typeof field });
    const percent = data.activationComparisonPercent;
    if (Number.isInteger(percent) && percent >= 0 && percent <= 100)
      value.comparisonPercent = percent;
    else if (percent !== undefined)
      console.warn("activationCohort.percent_malformed", {
        type: typeof percent,
      });
  } catch (error) {
    console.warn("activationCohort.switch_unread", { message: error?.message });
  }
  cached = { value, at: now };
  return value;
}

async function v2Enabled(db, now = Date.now()) {
  return (await journeyConfig(db, now)).v2;
}

/**
 * The version to stamp on a new account whose client offered v2: 2, or 1
 * for the comparison group and while the switch is off. An older client
 * that offered none gets no stamp, as before.
 */
async function journeyFor(db, uid, requested) {
  if (requested !== 2) return null;
  const { v2, comparisonPercent } = await journeyConfig(db);
  if (inComparisonGroup(uid, comparisonPercent)) return 1;
  return v2 ? 2 : 1;
}

function resetCacheForTests() {
  cached = null;
}

module.exports = {
  COMPARISON_PERCENT,
  cohortBucket,
  inComparisonGroup,
  journeyConfig,
  v2Enabled,
  journeyFor,
  resetCacheForTests,
};
