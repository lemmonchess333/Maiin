/**
 * Write src/lib/formArtReleases.data.ts from the approved release records.
 *
 *   npm run art:releases
 *
 * Run it after adding or correcting a record in docs/exercise-art/releases.
 * Until then `npm run check:form-art` and form-art-releases.test.ts fail.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatGenerated } from "./format-generated";
import {
  approvedReleases,
  readReleaseRecords,
  renderReleasesModule,
  RELEASES_MODULE,
} from "./form-art-releases";

const ROOT = resolve(import.meta.dirname, "..", "..");
const releases = approvedReleases(readReleaseRecords(ROOT));
const path = resolve(ROOT, RELEASES_MODULE);
writeFileSync(
  path,
  await formatGenerated(path, renderReleasesModule(releases))
);
console.log(
  `wrote ${Object.keys(releases).length} approved releases to ${RELEASES_MODULE}`
);
