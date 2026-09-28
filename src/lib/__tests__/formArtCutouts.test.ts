/**
 * The card cut-outs stay bound to the released drawings they were cut from.
 *
 * `scripts/art/cut-out-form-art.ts` derives one transparent image per
 * released set from that set's reference frame. The reviewed frames are
 * never edited (their release records pin every frame's hash), so the
 * failure this guards is the other direction: a reference frame replaced
 * or re-released while its cut-out keeps showing the old drawing on Home.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FORM_ARTWORK, getReleasedFormArtwork } from "../formArtwork";
import { FORM_ART_CUTOUTS } from "../formArtCutouts.data";
import { getFormArtCutout } from "../formArtCutouts";

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const publicFile = (path: string) =>
  readFileSync(resolve(process.cwd(), "public", path));

/** Width, height and alpha flag of a WebP, read from its header. */
function webpHeader(data: Buffer): {
  width: number;
  height: number;
  alpha: boolean;
} {
  expect(data.toString("ascii", 0, 4)).toBe("RIFF");
  expect(data.toString("ascii", 8, 12)).toBe("WEBP");
  const kind = data.toString("ascii", 12, 16);
  // Lossy with alpha is always extended format.
  expect(kind).toBe("VP8X");
  const flags = data[20];
  return {
    width: 1 + data.readUIntLE(24, 3),
    height: 1 + data.readUIntLE(27, 3),
    alpha: (flags & 0x10) !== 0,
  };
}

const released = Object.keys(FORM_ARTWORK)
  .filter((id) => getReleasedFormArtwork(id))
  .sort();

describe("form art cut-outs", () => {
  it("covers every released drawing, and nothing else", () => {
    expect(released.length).toBeGreaterThan(0);
    expect(Object.keys(FORM_ART_CUTOUTS).sort()).toEqual(released);
  });

  it.each(released)("%s is cut from its current reference frame", (id) => {
    const art = getReleasedFormArtwork(id)!;
    const cutout = FORM_ART_CUTOUTS[id];
    expect(cutout.source).toBe(art.reference);
    expect(
      sha(publicFile(cutout.source)),
      `${art.reference} changed since its cut-out was made — run ` +
        `npm run art:cutouts`
    ).toBe(cutout.sourceSha256);
  });

  it.each(released)("%s ships the file its manifest names", (id) => {
    const cutout = FORM_ART_CUTOUTS[id];
    const bytes = publicFile(cutout.src);
    expect(sha(bytes)).toBe(cutout.sha256);
    const header = webpHeader(bytes);
    expect(header.alpha).toBe(true);
    expect([header.width, header.height]).toEqual([
      cutout.width,
      cutout.height,
    ]);
    // Sized for a card, not a hero: 480 px on the long side at most.
    expect(Math.max(header.width, header.height)).toBeLessThanOrEqual(480);
  });

  it("keeps the reviewed frame sets out of the cut-out folder", () => {
    for (const cutout of Object.values(FORM_ART_CUTOUTS)) {
      expect(cutout.src.startsWith("form-art/")).toBe(true);
      expect(cutout.source.startsWith("form-frames/")).toBe(true);
    }
  });

  it("hands out a cut-out only for released art from the same frame", () => {
    const id = released[0];
    expect(getFormArtCutout(id)?.src).toBe(FORM_ART_CUTOUTS[id].src);
    expect(getFormArtCutout("not-an-exercise")).toBeNull();
    // A pilot that is not released has no cut-out even if one existed.
    expect(getReleasedFormArtwork("deadlift")).toBeNull();
    expect(getFormArtCutout("deadlift")).toBeNull();
  });
});
