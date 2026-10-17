// Read-only: called outside the repository after actual merge by package-postmerge.py.
import { pathToFileURL } from "node:url";
import path from "node:path";
const repo = process.argv[2];
if (!repo) throw new Error("Repository path required");
const load = (name) =>
  import(pathToFileURL(path.join(repo, "src/lib", name)).href);
const [releases, cutouts, placards] = await Promise.all([
  load("formArtReleases.data.ts"),
  load("formArtCutouts.data.ts"),
  load("releasedFormPlacards.ts"),
]);
process.stdout.write(
  JSON.stringify({
    releases: releases.APPROVED_FORM_ART_RELEASES,
    cutouts: cutouts.FORM_ART_CUTOUTS,
    abWheelPlacard: placards.RELEASED_FORM_PLACARDS["ab-wheel"],
  })
);
