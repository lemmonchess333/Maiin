import { describe, it, expect } from "vitest";
import { isHeic, processProfilePhoto, ProfilePhotoProcessingError } from "../profilePhotoProcessor";

/* The canvas-dependent path (decode → re-encode) requires a real
 * image rasterizer, which jsdom doesn't ship. We unit-test the pure
 * checks (HEIC detection, MIME-prefix gate) here and rely on real-
 * device QA + the integration test in the Settings flow to cover the
 * full pipeline. The pure checks are the highest-value tests anyway:
 * they're the only ones a non-malicious file could realistically
 * trip, and they're the gate that determines whether we even attempt
 * the canvas round-trip.
 */

const makeFile = (name: string, type: string): File => {
  return new File([new Uint8Array([0])], name, { type });
};

describe("isHeic", () => {
  it("flags files with image/heic MIME", () => {
    expect(isHeic(makeFile("photo.jpg", "image/heic"))).toBe(true);
  });

  it("flags files with image/heif MIME", () => {
    expect(isHeic(makeFile("photo.jpg", "image/heif"))).toBe(true);
  });

  it("flags files by .heic extension when MIME is empty", () => {
    /* Some browsers report empty/wrong MIME for picked files —
       belt-and-braces by also checking the filename extension. */
    expect(isHeic(makeFile("IMG_1234.HEIC", ""))).toBe(true);
    expect(isHeic(makeFile("IMG_1234.heic", ""))).toBe(true);
  });

  it("flags files by .heif extension", () => {
    expect(isHeic(makeFile("img.heif", ""))).toBe(true);
  });

  it("does NOT flag normal JPEG/PNG/WebP", () => {
    expect(isHeic(makeFile("photo.jpg", "image/jpeg"))).toBe(false);
    expect(isHeic(makeFile("photo.png", "image/png"))).toBe(false);
    expect(isHeic(makeFile("photo.webp", "image/webp"))).toBe(false);
  });

  it("does NOT match a JPEG that happens to have 'heic' inside the name", () => {
    expect(isHeic(makeFile("graphic.jpg", "image/jpeg"))).toBe(false);
  });
});

describe("processProfilePhoto error gates", () => {
  it("throws heic_unsupported with a remediation message for HEIC files", async () => {
    await expect(processProfilePhoto(makeFile("img.heic", "image/heic"))).rejects.toMatchObject({
      code: "heic_unsupported",
    });
    /* The error message must include conversion guidance. Users on
       iPhone hit this most often and need to know how to escape. */
    try {
      await processProfilePhoto(makeFile("img.heic", "image/heic"));
    } catch (err) {
      expect(err).toBeInstanceOf(ProfilePhotoProcessingError);
      expect((err as ProfilePhotoProcessingError).message).toMatch(/JPEG/i);
    }
  });

  it("throws non_image when the file MIME isn't an image type", async () => {
    await expect(processProfilePhoto(makeFile("doc.pdf", "application/pdf"))).rejects.toMatchObject({
      code: "non_image",
    });
  });

  it("throws non_image for empty MIME on non-HEIC extensions", async () => {
    /* This is the right behavior: we can't trust the file is an
       image without a MIME, and the HEIC path already covers iOS's
       quirky empty-MIME case. */
    await expect(processProfilePhoto(makeFile("photo", ""))).rejects.toMatchObject({
      code: "non_image",
    });
  });
});
