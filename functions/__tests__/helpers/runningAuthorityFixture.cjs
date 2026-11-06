// Synthetic account only. Shared by deterministic adapter and real-emulator tests.
const NOW = Date.parse("2026-11-06T12:00:00Z");
function runningAuthorityFixture(uid = "runner") {
  const session = { id: "run1", date: "2026-11-12", templateId: "easy15", minutes: 15, kind: "easy" };
  const authority = { schemaVersion: 1, accountId: uid, revision: 8, timeZone: "UTC",
    plan: { raceGoalId: "race", sessions: [{ ...session, minutes: 20 }] },
    constraints: { capacity: { daysPerWeek: 2, longestMinutes: 15 } }, holds: [],
    history: [{ id: "historical" }], manualCompletions: {} };
  const proposal = { id: "preview1", accountId: uid, baseRevision: 8,
    windowStart: "2026-11-09", expiresAtMs: NOW + 60000,
    validation: { policyVersion: 1, authorityRevision: 8 },
    plan: { raceGoalId: "race", sessions: [session] } };
  const data = { expectedUid: uid, accepted: true, proposalId: proposal.id,
    expectedRevision: 8, idempotencyKey: "accept1" };
  return { authority, proposal, data, seed: {
    [`users/${uid}`]: { displayName: "Synthetic runner" },
    [`users/${uid}/runningState/current`]: authority,
    [`users/${uid}/runningProposals/${proposal.id}`]: proposal,
  } };
}
module.exports = { NOW, runningAuthorityFixture };
