#!/usr/bin/env node
/**
 * RACE-EVENTS-REMOTE mirror sync (locked 2026-07-20).
 *
 * Writes the race event blocks from spaceDefs.ts (the SOURCE OF
 * TRUTH, reviewed via PR) into the Firestore doc `config/raceEvents`
 * so date updates reach every platform — including stale native
 * binaries — without an app release. Runs in CI on merge to main
 * whenever spaceDefs.ts changes (sync-race-events.yml); nothing else
 * ever writes the doc (rules: write false; this script uses Admin
 * credentials), so config↔doc drift is structurally impossible.
 *
 * The write is a full replace (mirror semantics): a race removed from
 * config drops out of the doc on the next sync.
 *
 * `--dry-run` prints the payload without writing.
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { raceSpaceDefs } from "../src/features/spaces/spaceDefs";

const PROJECT_ID = "adaptive-fitness-af8bb";
const dryRun = process.argv.includes("--dry-run");

const events: Record<string, unknown> = {};
for (const def of raceSpaceDefs()) {
  if (!def.event) continue;
  events[def.id] = {
    dateKey: def.event.dateKey,
    websiteUrl: def.event.websiteUrl,
    city: def.event.city,
    countryFlag: def.event.countryFlag,
    ...(def.event.elevation ? { elevation: def.event.elevation } : {}),
  };
}

async function main(): Promise<void> {
  console.log(
    `[sync-race-events] ${Object.keys(events).length} race event blocks`
  );
  console.log(JSON.stringify(events, null, 2));
  if (dryRun) {
    console.log("[sync-race-events] dry run — nothing written");
    return;
  }
  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  await getFirestore()
    .doc("config/raceEvents")
    .set({ events, updatedAt: FieldValue.serverTimestamp() });
  console.log("[sync-race-events] config/raceEvents written");
}

main().catch((e) => {
  console.error("[sync-race-events] failed:", e);
  process.exit(1);
});
