"use strict";

/**
 * A Space's members' sessions and its week (Run27 call 11), for the people
 * who were members before the triggers that keep them were deployed.
 *
 * `onSpaceMemberWritten` brings a member's recent public posts and their
 * week into a Space when they join. Everyone who joined before it shipped
 * never had that join, so their Space would show none of their sessions
 * until they next shared one, and their week would not count until they
 * next saved one. This runs the same two steps for every member of every
 * known Space: their public posts of the last four weeks
 * (`spaceFeed.syncMemberRows`) and their current week
 * (`spaceWeeks.syncMemberWeeks`).
 *
 * Safe to run again at any time and beside the live triggers: each step
 * reads the facts again and writes what they say, so a second run adds
 * nothing. A restricted account, or one being deleted, gets nothing.
 */

const { SPACE_IDS } = require("./spaceIds");
const { syncMemberRows } = require("./spaceFeed");
const { syncMemberWeeks } = require("./spaceWeeks");

const PAGE = 300;

async function backfillSpaceMembers(
  db,
  {
    now = Date.now(),
    // admin.firestore.FieldPath.documentId; the bare name works as well.
    documentId = () => "__name__",
    pageSize = PAGE,
    spaceIds = SPACE_IDS,
  } = {}
) {
  const totals = { spaces: 0, members: 0, rowsAdded: 0, weeks: 0 };
  for (const spaceId of spaceIds) {
    totals.spaces += 1;
    const members = db.collection("spaces").doc(spaceId).collection("members");
    let last = null;
    for (;;) {
      let page = members.orderBy(documentId()).limit(pageSize);
      if (last) page = page.startAfter(last);
      const snap = await page.get();
      for (const member of snap.docs) {
        totals.members += 1;
        const rows = await syncMemberRows(db, spaceId, member.id, { now });
        totals.rowsAdded += rows.added;
        const weeks = await syncMemberWeeks(db, spaceId, member.id, { now });
        totals.weeks += weeks.recounted;
      }
      if (snap.docs.length < pageSize) break;
      last = snap.docs[snap.docs.length - 1];
    }
  }
  return totals;
}

module.exports = { backfillSpaceMembers };
