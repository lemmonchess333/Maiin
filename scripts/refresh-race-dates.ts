#!/usr/bin/env node
/** Dry-run by default. --apply reads and updates config/raceEvents only.
 * --all checks every source without rolling an upcoming edition forward.
 * --today=YYYY-MM-DD and --report=path are useful for local diagnosis. */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { raceSpaceDefs } from "../src/features/spaces/spaceDefs";
import { DATE_SOURCES } from "./races/sources";
import {
  isNextEdition,
  parseOfficialDate,
  validDateKey,
  type DateSource,
} from "./races/date-parser";
import { preservedDate, type DateEvidence } from "./races/remote-events";

const apply = process.argv.includes("--apply");
const all = process.argv.includes("--all");
const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const today = arg("today") ?? new Date().toISOString().slice(0, 10);
if (!validDateKey(today))
  throw new Error("--today must be a real YYYY-MM-DD date");
if (apply && arg("today")) throw new Error("Clock overrides are dry-run only");

async function fetchSource(
  source: DateSource
): Promise<{ html: string; url: string }> {
  let url = source.url;
  const hosts = new Set([
    new URL(url).hostname,
    ...(source.allowedHosts ?? []),
  ]);
  for (let redirects = 0; redirects < 4; redirects++) {
    const target = new URL(url);
    if (target.protocol !== "https:" || !hosts.has(target.hostname))
      throw new Error("Unreviewed source redirect");
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
      headers: {
        "User-Agent": "TroposRaceDates/1.0 (official race date check)",
        Accept: "text/html",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Missing redirect location");
      url = new URL(location, url).href;
      continue;
    }
    if (!response.ok)
      throw new Error(`Official site returned HTTP ${response.status}`);
    if (!response.headers.get("content-type")?.includes("text/html"))
      throw new Error("Source is not HTML");
    const reader = response.body!.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 5_000_000) throw new Error("Source exceeds size limit");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    return { html: Buffer.concat(chunks).toString("utf8"), url };
  }
  throw new Error("Too many source redirects");
}

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
      const { html, url } = await fetchSource(source);
      const candidate = parseOfficialDate(html, source);
      if (current >= today) {
        results.push({
          ...result,
          status: "upcoming",
          dateKey: candidate,
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
          sourceUrl: url,
          checkedAt: new Date().toISOString(),
          sourceSha256: createHash("sha256").update(html).digest("hex"),
        };
        results.push({
          ...result,
          status: apply ? "updated" : "candidate",
          dateKey: candidate,
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
        if (events[id]?.dateKey !== existing.events?.[id]?.dateKey)
          throw new Error(`Concurrent date change for ${id}; retry next run`);
        const race = raceSpaceDefs().find((r) => r.id === id)!;
        events[id] = { ...race.event, ...events[id], dateKey: update.dateKey };
        evidence[id] = update;
      }
      tx.set(ref, { events, dateRefresh: evidence }, { merge: true });
    });
    const readback = (await ref.get()).data();
    for (const [id, update] of Object.entries(updates)) {
      if (readback?.events?.[id]?.dateKey !== update.dateKey)
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
