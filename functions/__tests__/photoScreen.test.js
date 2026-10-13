/**
 * Screening the photos other people see (lib/photoScreen.js, Ship1):
 * which uploads are screened, what SafeSearch rating refuses one (nudity,
 * not a gym photo), and that a refused photo's file is deleted.
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  refusesPhoto,
  safeSearch,
  screenStoredPhoto,
  screenedOwner,
} = require("../lib/photoScreen");

const annotation = (adult, racy = "UNLIKELY") => ({
  adult,
  racy,
  spoof: "VERY_UNLIKELY",
  medical: "VERY_UNLIKELY",
  violence: "VERY_UNLIKELY",
});

const visionAnswer = (body, status = 200) =>
  vi.fn(async () => ({ ok: status < 400, status, json: async () => body }));

describe("screenedOwner", () => {
  it("names the uploader of a Space post's photo or a profile photo", () => {
    expect(screenedOwner("space-photos/u1/1760000000000.jpg")).toBe("u1");
    expect(screenedOwner("profile-photos/u1/avatar-1.jpg")).toBe("u1");
  });

  it("leaves out what no one else sees, and anything malformed", () => {
    expect(screenedOwner("progress-photos/u1/a.bin")).toBeNull();
    expect(screenedOwner("food-photos/u1/m.jpg")).toBeNull();
    expect(screenedOwner("space-photos/u1/nested/a.jpg")).toBeNull();
    expect(screenedOwner("space-photos/../u2/a.jpg")).toBeNull();
    expect(screenedOwner(undefined)).toBeNull();
  });
});

describe("refusesPhoto", () => {
  it("refuses nudity SafeSearch rates likely or very likely", () => {
    expect(refusesPhoto(annotation("LIKELY"))).toBe(true);
    expect(refusesPhoto(annotation("VERY_LIKELY"))).toBe(true);
  });

  it("lets a gym photo through, however racy (the owner's call)", () => {
    expect(refusesPhoto(annotation("POSSIBLE", "VERY_LIKELY"))).toBe(false);
    expect(refusesPhoto(annotation("UNLIKELY", "LIKELY"))).toBe(false);
    expect(refusesPhoto(undefined)).toBe(false);
  });
});

describe("safeSearch", () => {
  it("asks Vision for SafeSearch on the image's bytes", async () => {
    const fetchImpl = visionAnswer({
      responses: [{ safeSearchAnnotation: annotation("UNLIKELY") }],
    });
    const result = await safeSearch(Buffer.from("jpeg"), "token", fetchImpl);
    expect(result.adult).toBe("UNLIKELY");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://vision.googleapis.com/v1/images:annotate");
    expect(init.headers.Authorization).toBe("Bearer token");
    expect(JSON.parse(init.body)).toEqual({
      requests: [
        {
          image: { content: Buffer.from("jpeg").toString("base64") },
          features: [{ type: "SAFE_SEARCH_DETECTION" }],
        },
      ],
    });
  });

  it("throws when Vision is off or answers with an error", async () => {
    await expect(
      safeSearch(
        Buffer.from("x"),
        "t",
        visionAnswer(
          { error: { message: "Cloud Vision API has not been used" } },
          403
        )
      )
    ).rejects.toThrow(/403.*Cloud Vision API/);
    await expect(
      safeSearch(
        Buffer.from("x"),
        "t",
        visionAnswer({ responses: [{ error: { message: "Bad image" } }] })
      )
    ).rejects.toThrow(/Bad image/);
  });
});

describe("screenStoredPhoto", () => {
  const bucketWith = () => {
    const file = {
      download: vi.fn(async () => [Buffer.from("jpeg")]),
      delete: vi.fn(async () => undefined),
    };
    return { file, bucket: { file: vi.fn(() => file) } };
  };

  it("deletes a refused photo's file", async () => {
    const { file, bucket } = bucketWith();
    const result = await screenStoredPhoto({
      bucket,
      path: "space-photos/u1/1.jpg",
      accessToken: "t",
      fetchImpl: visionAnswer({
        responses: [{ safeSearchAnnotation: annotation("VERY_LIKELY") }],
      }),
    });
    expect(result).toEqual({ refused: true, adult: "VERY_LIKELY" });
    expect(bucket.file).toHaveBeenCalledWith("space-photos/u1/1.jpg");
    expect(file.delete).toHaveBeenCalledWith({ ignoreNotFound: true });
  });

  it("keeps a photo that passes", async () => {
    const { file, bucket } = bucketWith();
    const result = await screenStoredPhoto({
      bucket,
      path: "profile-photos/u1/a.jpg",
      accessToken: "t",
      fetchImpl: visionAnswer({
        responses: [{ safeSearchAnnotation: annotation("UNLIKELY", "LIKELY") }],
      }),
    });
    expect(result.refused).toBe(false);
    expect(file.delete).not.toHaveBeenCalled();
  });
});
