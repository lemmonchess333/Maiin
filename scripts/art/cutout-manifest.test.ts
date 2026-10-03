/**
 * src/lib/formArtCutouts.data.ts stays exactly what `npm run art:cutouts`
 * writes. formArtCutouts.test.ts re-hashes what the file lists; this holds
 * the file itself, so a row added or edited by hand fails here. One was:
 * clean-and-press went in at the top of a file the generator sorts by ID.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { FORM_ART_CUTOUTS } from "../../src/lib/formArtCutouts.data";
import { CUTOUT_MANIFEST, renderCutoutManifest } from "./cutout-manifest";
import { formatGenerated } from "./format-generated";

it("is exactly what the cut-out generator writes", async () => {
  const path = resolve(process.cwd(), CUTOUT_MANIFEST);
  const expected = await formatGenerated(
    path,
    renderCutoutManifest(
      Object.keys(FORM_ART_CUTOUTS)
        .sort()
        .map((id) => [id, FORM_ART_CUTOUTS[id]] as const)
    )
  );
  expect(
    readFileSync(path, "utf8") === expected,
    `${CUTOUT_MANIFEST} differs from what npm run art:cutouts writes`
  ).toBe(true);
});
