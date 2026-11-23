#!/usr/bin/env node
/**
 * Monthly entry-link check (Reg1, 23 November 2026). Requests every
 * race's `entryUrl` in spaceDefs.ts and writes race-entry-report.json
 * for race-entry-link-check.yml, which keeps one issue listing the
 * broken links. Exits 1 when any link is broken, so the run is red.
 *
 * Never part of pull-request CI: an organiser's site that is down for an
 * hour must not redden an unrelated change (the trade check-race-dates.ts
 * made for dates).
 *
 *   npx tsx scripts/check-race-entry-links.ts
 */
import { writeFileSync } from "node:fs";
import { raceSpaceDefs } from "../src/features/spaces/spaceDefs";
import { checkEntryLinks } from "./races/entry-links";

const results = await checkEntryLinks(raceSpaceDefs());
const broken = results.filter((r) => r.status === "broken");
const unverified = results.filter((r) => r.status === "unverified");
writeFileSync(
  "race-entry-report.json",
  JSON.stringify(
    { checked: results.length, broken, unverified, results },
    null,
    2
  )
);
console.log(
  `[race-entry-links] ${results.length} checked, ${broken.length} broken, ${unverified.length} unverified`
);
for (const r of [...broken, ...unverified])
  if (r.status !== "ok")
    console.log(`  ${r.status} ${r.id}: ${r.reason} (${r.url})`);
process.exitCode = broken.length ? 1 : 0;
