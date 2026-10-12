#!/usr/bin/env node
/**
 * RACE-EVENTS-REMOTE catalogue sync.
 *
 * Writes the race event blocks from spaceDefs.ts (the SOURCE OF
 * TRUTH, reviewed via PR) into the Firestore doc `config/raceEvents`
 * so date updates reach every platform — including stale native
 * binaries — without an app release. Runs in CI on merge to main
 * whenever spaceDefs.ts changes (sync-race-events.yml). The daily
 * date refresher is the other Admin writer; client writes are denied.
 * Preserve evidenced automatic dates until a reviewed bundled date
 * explicitly changes. Both workflows share one concurrency group.
 *
 * The write is a full replace (mirror semantics): a race removed from
 * config drops out of the doc on the next sync.
 *
 * `--dry-run` prints the payload without writing.
 */
import { isDeepStrictEqual } from "node:util";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { raceSpaceDefs } from "../src/features/spaces/spaceDefs";
import { preservedDate, type DateEvidence } from "./races/remote-events";

const PROJECT_ID = "adaptive-fitness-af8bb";
const dryRun = process.argv.includes("--dry-run");

const events: Record<string, unknown> = {};
for (const def of raceSpaceDefs()) {
  if (!def.event) continue;
  events[def.id] = {
    dateKey: def.event.dateKey,
    dateKeys: def.event.dateKeys ?? [def.event.dateKey],
    websiteUrl: def.event.websiteUrl,
    city: def.event.city,
    countryCode: def.event.countryCode,
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
  const ref = getFirestore().doc("config/raceEvents");
  await getFirestore().runTransaction(async (tx) => {
    const previous = (await tx.get(ref)).data() ?? {};
    const dateRefresh: Record<string, DateEvidence> = {};
    for (const race of raceSpaceDefs()) {
      const bundled = race.event!.dateKey;
      const evidence = previous.dateRefresh?.[race.id];
      const dateKey = preservedDate(
        bundled,
        previous.events?.[race.id]?.dateKey,
        evidence
      );
      (events[race.id] as Record<string, unknown>).dateKey = dateKey;
      (events[race.id] as Record<string, unknown>).dateKeys =
        dateKey !== bundled
          ? (evidence.dateKeys ?? [dateKey])
          : (race.event!.dateKeys ?? [bundled]);
      if (dateKey !== bundled) dateRefresh[race.id] = evidence;
    }
    tx.set(ref, {
      events,
      dateRefresh,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  const stored = await getFirestore().doc("config/raceEvents").get();
  if (!isDeepStrictEqual(stored.data()?.events, events)) {
    throw new Error("Race event readback differs from the source catalogue");
  }
  console.log("[sync-race-events] config/raceEvents written and verified");
}

main().catch((e) => {
  console.error("[sync-race-events] failed:", e);
  process.exit(1);
});
