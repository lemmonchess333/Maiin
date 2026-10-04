#!/usr/bin/env node
/** Dry-run by default. --apply reads and updates config/raceEvents only.
 * --all checks every source without rolling an upcoming edition forward.
 * --today=YYYY-MM-DD and --report=path are useful for local diagnosis. */
import { writeFileSync } from "node:fs";
import { raceSpaceDefs } from "../src/features/spaces/spaceDefs";
import { DATE_SOURCES } from "./races/sources";
import { checkDateSource } from "./races/check-source";
import { isNextEdition, validDateKey } from "./races/date-parser";
import { preservedDate, type DateEvidence } from "./races/remote-events";

const apply = process.argv.includes("--apply");
const all = process.argv.includes("--all");
const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const today = arg("today") ?? new Date().toISOString().slice(0, 10);
if (!validDateKey(today))
  throw new Error("--today must be a real YYYY-MM-DD date");
if (apply && arg("today")) throw new Error("Clock overrides are dry-run only");

async function main() {
  // A local dry run needs neither Firebase credentials nor an AI service.
  const db = apply
    ? await (async () => {
        const { initializeApp, applicationDefault } =
          await import("firebase-admin/app");
        const { getFirestore } = await import("firebase-admin/firestore");
        initializeApp({
          credential: applicationDefault(),
          projectId: "adaptive-fitness-af8bb",
        });
        return getFirestore();
      })()
    : undefined;
  const ref = db?.doc("config/raceEvents");
  const existing = (await ref?.get())?.data() ?? {};
  const updates: Record<string, DateEvidence> = {};
  const results: Array<{
    id: string;
    name: string;
    current: string;
    status: string;
    sourceUrl: string;
    dateKey?: string;
    dateKeys?: string[];
    sourceUrls?: string[];
    detail?: string;
  }> = [];
  for (const race of raceSpaceDefs()) {
    const bundled = race.event!.dateKey;
    const current = preservedDate(
      bundled,
      existing.events?.[race.id]?.dateKey,
      existing.dateRefresh?.[race.id]
    );
    if (current >= today && !all) continue;
    const source = DATE_SOURCES[race.id];
    const result = {
      id: race.id,
      name: race.name,
      current,
      sourceUrl: source.url,
    };
    try {
      const checked = await checkDateSource(source);
      const candidate = checked.dateKeys.at(-1)!;
      if (current >= today) {
        results.push({
          ...result,
          status: "upcoming",
          dateKey: candidate,
          dateKeys: checked.dateKeys,
          sourceUrls: checked.sources.map((s) => s.url),
          detail: "Upcoming edition retained",
        });
      } else if (candidate === current || candidate < today) {
        results.push({
          ...result,
          status: "awaiting",
          detail:
            "Organiser has not published a next date in the checked field",
        });
      } else if (!isNextEdition(candidate, current, today)) {
        results.push({
          ...result,
          status: "review",
          dateKey: candidate,
          detail: "Date is outside the next-edition bounds",
        });
      } else {
        updates[race.id] = {
          dateKey: candidate,
          bundledDateKey: bundled,
          sourceUrl: checked.sources[0].url,
          dateKeys: checked.dateKeys,
          sources: checked.sources,
          checkedAt: new Date().toISOString(),
          sourceSha256: checked.sources[0].sha256,
        };
        results.push({
          ...result,
          status: apply ? "updated" : "candidate",
          dateKey: candidate,
          dateKeys: checked.dateKeys,
          sourceUrls: checked.sources.map((s) => s.url),
        });
      }
    } catch (error) {
      results.push({
        ...result,
        status: "review",
        detail: error instanceof Error ? error.message : "Source check failed",
      });
    }
  }
  if (db && ref && Object.keys(updates).length) {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.data() ?? {};
      const events = { ...(data.events ?? {}) };
      const evidence = { ...(data.dateRefresh ?? {}) };
      for (const [id, update] of Object.entries(updates)) {
        // Re-read inside the transaction: never overwrite a concurrent correction.
        if (
          events[id]?.dateKey !== existing.events?.[id]?.dateKey ||
          JSON.stringify(events[id]?.dateKeys) !==
            JSON.stringify(existing.events?.[id]?.dateKeys)
        )
          throw new Error(`Concurrent date change for ${id}; retry next run`);
        const race = raceSpaceDefs().find((r) => r.id === id)!;
        events[id] = {
          ...race.event,
          ...events[id],
          dateKey: update.dateKey,
          dateKeys: update.dateKeys,
        };
        evidence[id] = update;
      }
      tx.set(ref, { events, dateRefresh: evidence }, { merge: true });
    });
    const readback = (await ref.get()).data();
    for (const [id, update] of Object.entries(updates)) {
      if (
        readback?.events?.[id]?.dateKey !== update.dateKey ||
        JSON.stringify(readback?.events?.[id]?.dateKeys) !==
          JSON.stringify(update.dateKeys)
      )
        throw new Error(`Readback failed for ${id}`);
    }
  }
  const report = {
    checkedOn: today,
    mode: apply ? "apply" : "dry-run",
    results,
  };
  writeFileSync(
    arg("report") ?? "race-date-report.json",
    JSON.stringify(report, null, 2) + "\n"
  );
  console.log(JSON.stringify(report, null, 2));
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
