/**
 * Screening the photos other people see (lib/photoScreen.js, Ship1):
 * which uploads are screened, what SafeSearch rating refuses one (nudity,
 * not a gym photo), and that a refused photo's file is deleted.
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  isUnscreenable,
  refusesPhoto,
  safeSearch,
  screenStoredPhoto,
  screenedOwner,
  VISION_REQUEST_LIMIT_BYTES,
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
  it("names the uploader of a Space post's photo, a profile photo, a run post's map or a post's photo", () => {
    expect(screenedOwner("space-photos/u1/1760000000000.jpg")).toBe("u1");
    expect(screenedOwner("profile-photos/u1/avatar-1.jpg")).toBe("u1");
    // Soc15 call 5: any client can put any JPEG at its own map path.
    expect(screenedOwner("route-maps/u1/post-1/light.jpg")).toBe("u1");
    expect(screenedOwner("route-maps/u1/post-1/dark.jpg")).toBe("u1");
    expect(screenedOwner("route-maps//post-1/dark.jpg")).toBeNull();
    // Soc15 call 2: a shared session's photos, by their random ids.
    expect(
      screenedOwner("post-photos/u1/post-1/Ab3dEf6hIj9kLm2nOp5q.jpg")
    ).toBe("u1");
    expect(screenedOwner("post-photos//post-1/Ab3dEf6h.jpg")).toBeNull();
  });

  it.each(["space-photos", "profile-photos", "route-maps", "post-photos"])(
    "covers recursive Storage objects under %s, including dotted filenames",
    (prefix) => {
      expect(screenedOwner(`${prefix}/u1/nested/a.jpg`)).toBe("u1");
      expect(screenedOwner(`${prefix}/u1/a..jpg`)).toBe("u1");
      expect(screenedOwner(`${prefix}/u1/nested/../a.jpg`)).toBe("u1");
      expect(screenedOwner(`${prefix}/u1/line\nbreak.jpg`)).toBe("u1");
      expect(screenedOwner(`${prefix}/u1`)).toBe("u1");
      expect(screenedOwner(`${prefix}/u1/`)).toBe("u1");
    }
  );

  it("leaves out what no one else sees, and anything malformed", () => {
    expect(screenedOwner("progress-photos/u1/a.bin")).toBeNull();
    expect(screenedOwner("food-photos/u1/m.jpg")).toBeNull();
    expect(screenedOwner("space-photos//a.jpg")).toBeNull();
    expect(screenedOwner("profile-photos/")).toBeNull();
    expect(screenedOwner("space-photos")).toBeNull();
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

  it("reads only Vision's per-image INVALID_ARGUMENT as the photo's own fault", async () => {
    const unreadable = await safeSearch(
      Buffer.from("x"),
      "t",
      visionAnswer({
        responses: [{ error: { code: 3, message: "Bad image data." } }],
      })
    ).catch((err) => err);
    expect(isUnscreenable(unreadable)).toBe(true);
    expect(unreadable.message).toMatch(/Bad image data/);
    // The service failing, per image or as a whole, is never the photo's.
    for (const [body, status] of [
      [{ responses: [{ error: { code: 14, message: "Unavailable" } }] }, 200],
      [{ responses: [{ error: { code: 13, message: "Internal" } }] }, 200],
      [{ responses: [{ error: { code: 8, message: "Quota" } }] }, 200],
      [{ responses: [{ error: { message: "Bad image" } }] }, 200],
      [{ responses: [{}] }, 200],
      [{ error: { message: "Cloud Vision API has not been used" } }, 403],
      [{ error: { message: "Quota exceeded" } }, 429],
      [{ error: { message: "Invalid JSON payload" } }, 400],
      [{ error: { message: "Backend Error" } }, 503],
    ]) {
      const failed = await safeSearch(
        Buffer.from("x"),
        "t",
        visionAnswer(body, status)
      ).catch((err) => err);
      expect(failed).toBeInstanceOf(Error);
      expect(isUnscreenable(failed)).toBe(false);
    }
    const transport = await safeSearch(Buffer.from("x"), "t", async () => {
      throw new TypeError("fetch failed");
    }).catch((err) => err);
    expect(isUnscreenable(transport)).toBe(false);
  });

  it("does not send Vision a photo past its request limit, and reads it as unscreenable", async () => {
    const fetchImpl = vi.fn();
    const tooLarge = Buffer.alloc(
      Math.ceil((VISION_REQUEST_LIMIT_BYTES * 3) / 4) + 1
    );
    const failed = await safeSearch(tooLarge, "t", fetchImpl).catch(
      (err) => err
    );
    expect(isUnscreenable(failed)).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
    // Anchor: a photo the app makes is sent.
    const fits = visionAnswer({
      responses: [{ safeSearchAnnotation: annotation("UNLIKELY") }],
    });
    await safeSearch(Buffer.alloc(2 * 1024 * 1024), "t", fits);
    expect(fits).toHaveBeenCalledOnce();
  });

  /* Storage must refuse a screened upload that Vision could never take,
     so the person is told at upload instead of having the photo accepted
     and then deleted as unscreenable. Read from storage.rules: each
     screened prefix's size cap, with a photo one byte under it, has to
     reach Vision. A Space photo was allowed 10 MB, and anything over
     about 7.86 MB was deleted on arrival. */
  it("a photo just under each screened path's Storage cap reaches Vision", async () => {
    const rules = readFileSync(
      fileURLToPath(new URL("../../storage.rules", import.meta.url)),
      "utf8"
    );
    const caps = {};
    for (const prefix of [
      "space-photos",
      "profile-photos",
      "route-maps",
      "post-photos",
    ]) {
      const block = rules.match(
        new RegExp(`match /${prefix}/\\{uid\\}[^\\n]* \\{\\n([\\s\\S]*?)\\n    \\}`)
      );
      expect(block, `${prefix} has a match block`).not.toBeNull();
      const size = block[1].match(
        /request\.resource\.size < (\d+) \* 1024(?: \* (1024))?/
      );
      expect(size, `${prefix} caps its uploads`).not.toBeNull();
      caps[prefix] = Number(size[1]) * 1024 * (size[2] ? 1024 : 1);
    }
    // Every screened path is one of the four read above.
    expect(Object.keys(caps).length).toBe(4);
    const reachesVision = {};
    for (const [prefix, cap] of Object.entries(caps)) {
      const fetchImpl = visionAnswer({
        responses: [{ safeSearchAnnotation: annotation("UNLIKELY") }],
      });
      const failed = await safeSearch(Buffer.alloc(cap - 1), "t", fetchImpl)
        .then(() => null)
        .catch((err) => err);
      reachesVision[prefix] =
        !isUnscreenable(failed) && fetchImpl.mock.calls.length === 1;
    }
    expect(reachesVision).toEqual({
      "space-photos": true,
      "profile-photos": true,
      "route-maps": true,
      "post-photos": true,
    });
    for (const prefix of Object.keys(caps))
      expect(screenedOwner(`${prefix}/u/x.jpg`)).toBe("u");
  });
});

describe("screenStoredPhoto", () => {
  const bucketWith = () => {
    const file = {
      getMetadata: vi.fn(async () => [{ generation: "1700000000000001" }]),
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
    // The generation screened comes back, for the callable's record of a pass.
    expect(result).toEqual({
      refused: true,
      adult: "VERY_LIKELY",
      generation: "1700000000000001",
    });
    expect(bucket.file).toHaveBeenLastCalledWith("space-photos/u1/1.jpg", {
      generation: "1700000000000001",
      preconditionOpts: { ifGenerationMatch: "1700000000000001" },
    });
    expect(file.delete).toHaveBeenCalledWith({
      ignoreNotFound: true,
    });
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

  it("uses the finalize event's generation without resolving a newer object", async () => {
    const { file, bucket } = bucketWith();
    await screenStoredPhoto({
      bucket,
      path: "profile-photos/u1/a.jpg",
      generation: "123",
      accessToken: "t",
      fetchImpl: visionAnswer({
        responses: [{ safeSearchAnnotation: annotation("LIKELY") }],
      }),
    });
    expect(file.getMetadata).not.toHaveBeenCalled();
    expect(bucket.file).toHaveBeenCalledExactlyOnceWith(
      "profile-photos/u1/a.jpg",
      { generation: "123", preconditionOpts: { ifGenerationMatch: "123" } }
    );
    expect(file.delete).toHaveBeenCalledWith({
      ignoreNotFound: true,
    });
  });

  it("cannot delete a newer replacement while Vision checks the old bytes", async () => {
    let current = "123";
    const deleted = [];
    const bucket = {
      file: vi.fn((_path, options) => ({
        getMetadata: async () => [{ generation: current }],
        download: async () => [Buffer.from(options.generation)],
        delete: async (conditions) => {
          expect(conditions.ignoreNotFound).toBe(true);
          expect(options.preconditionOpts.ifGenerationMatch).toBe(
            options.generation
          );
          deleted.push(options.generation);
        },
      })),
    };
    await screenStoredPhoto({
      bucket,
      path: "profile-photos/u1/a.jpg",
      accessToken: "t",
      fetchImpl: async (_url, request) => {
        expect(JSON.parse(request.body).requests[0].image.content).toBe(
          Buffer.from("123").toString("base64")
        );
        current = "124";
        return {
          ok: true,
          status: 200,
          json: async () => ({
            responses: [{ safeSearchAnnotation: annotation("LIKELY") }],
          }),
        };
      },
    });
    expect(deleted).toEqual(["123"]);
    expect(current).toBe("124");
  });

  it.each([
    undefined,
    null,
    "",
    "not-a-generation",
    123,
    "0",
    "9007199254740993",
  ])(
    "fails closed for missing or malformed metadata generation %s",
    async (generation) => {
      const { file, bucket } = bucketWith();
      file.getMetadata.mockResolvedValue([{ generation }]);
      const fetchImpl = vi.fn();
      await expect(
        screenStoredPhoto({
          bucket,
          path: "profile-photos/u1/a.jpg",
          accessToken: "t",
          fetchImpl,
        })
      ).rejects.toThrow("Photo generation unavailable");
      expect(file.download).not.toHaveBeenCalled();
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(file.delete).not.toHaveBeenCalled();
    }
  );
});
