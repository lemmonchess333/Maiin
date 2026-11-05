// @vitest-environment jsdom
/**
 * Adding photos to a shared session's post, and taking them off (Soc15
 * call 2, `addPostPhotos` / `removePostPhoto`).
 *
 * What the post and its readers depend on:
 *   - each photo is re-encoded (1600 px, JPEG 0.82), uploaded beside the
 *     post under a new random id and screened before the post names it;
 *   - ONE update names the post's whole list, the photos it had first;
 *   - a refused photo is never named, and neither is one that failed or
 *     ran past its 30 s ceiling; the ones that passed are added anyway;
 *   - no more than four, whatever is picked;
 *   - taking one off writes the shorter list first, then deletes its file,
 *     and a file that will not delete does not undo the removal.
 *
 * The canvas encoder is mocked (jsdom has no canvas): it hands back a
 * blob and a size. Storage and the screening callable are mocked at their
 * SDK boundary; Firestore is the shared fake (ADR-0009).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  events: [] as string[],
  /** Per file name: what the screen answers. */
  screen: {} as Record<string, "ok" | "refused" | "unavailable">,
  /** Per file name: an upload that never settles, or one that fails. */
  upload: {} as Record<string, "hang" | "fail">,
  /** Which picked file each upload path came from. */
  sourceOf: new Map<string, string>(),
  deleteFails: false,
  encoded: [] as { name: string; opts: unknown }[],
  current: "",
}));

vi.mock("firebase/firestore");
vi.mock("../firebase", () => ({
  db: {},
  storage: {},
  functions: {},
  auth: { currentUser: { uid: "maya" } },
}));
vi.mock("../imageEncode", () => ({
  encodeJpeg: vi.fn(async (file: File, opts: unknown) => {
    H.encoded.push({ name: file.name, opts });
    H.current = file.name;
    return {
      blob: new Blob([new Uint8Array(200_000)], { type: "image/jpeg" }),
      width: 1600,
      height: 1200,
    };
  }),
}));
vi.mock("firebase/storage", () => ({
  ref: (_storage: unknown, path: string) => ({ fullPath: path }),
  uploadBytes: vi.fn(
    async (r: { fullPath: string }, _blob: Blob, meta: object) => {
      const source = H.current;
      H.sourceOf.set(r.fullPath, source);
      H.events.push(`upload ${source} ${JSON.stringify(meta)}`);
      if (H.upload[source] === "hang") return new Promise(() => {});
      if (H.upload[source] === "fail") throw new Error("network");
    }
  ),
  getDownloadURL: vi.fn(
    async (r: { fullPath: string }) =>
      `https://firebasestorage.googleapis.com/v0/b/adaptive-fitness-af8bb.firebasestorage.app/o/${encodeURIComponent(r.fullPath)}?alt=media&token=t`
  ),
  deleteObject: vi.fn(async (r: { fullPath: string }) => {
    H.events.push(`delete ${r.fullPath}`);
    if (H.deleteFails) throw new Error("storage/unauthorized");
  }),
}));
vi.mock("firebase/functions", () => ({
  httpsCallable: () => async (payload: { path: string }) => {
    const source = H.sourceOf.get(payload.path) ?? "";
    H.events.push(`screen ${source}`);
    const answer = H.screen[source] ?? "ok";
    if (answer === "unavailable") throw new Error("unavailable");
    return { data: { ok: answer === "ok" } };
  },
}));

import {
  failNextFirestore,
  readDoc,
  resetFirestore,
  seedFirestore,
  writeLog,
} from "@/test/firestoreHarness";
import { restoreRealTimers } from "@/test/fakeTimers";
import { encodeJpeg } from "../imageEncode";
import {
  addPostPhotos,
  POST_PHOTO_CEILING_MS,
  removePostPhoto,
} from "../postPhotoUpload";
import { knownPostPhotos, type PostPhoto } from "../postPhotos";

const POST = "post-1";
const file = (name: string) => new File([new Uint8Array(10)], name);
const PATH = new RegExp(`^post-photos/maya/${POST}/([A-Za-z0-9]{20})\\.jpg$`);

/** A photo already on the post. */
const onPost = (id: string): PostPhoto => ({
  id,
  url: `https://firebasestorage.googleapis.com/v0/b/adaptive-fitness-af8bb.firebasestorage.app/o/post-photos%2Fmaya%2F${POST}%2F${id}.jpg?alt=media&token=t`,
  w: 1200,
  h: 1600,
});

const photosOnPost = () =>
  (readDoc(`activities/${POST}`)?.photos ?? []) as PostPhoto[];
const updates = () => writeLog().filter((w) => w.path === `activities/${POST}`);

beforeEach(() => {
  resetFirestore();
  H.events = [];
  H.screen = {};
  H.upload = {};
  H.sourceOf = new Map();
  H.deleteFails = false;
  H.encoded = [];
  seedFirestore({
    [`activities/${POST}`]: { authorId: "maya", type: "run" },
  });
});

afterEach(async () => {
  await restoreRealTimers();
});

describe("addPostPhotos", () => {
  it("encodes, uploads beside the post, screens each, then names the whole list in one update", async () => {
    const result = await addPostPhotos({
      uid: "maya",
      activityId: POST,
      current: [onPost("Existing01")],
      files: [file("a.heic"), file("b.jpg")],
    });

    // 1600 px on the longest side, JPEG 0.82.
    expect(H.encoded).toEqual([
      { name: "a.heic", opts: { maxEdge: 1600, quality: 0.82 } },
      { name: "b.jpg", opts: { maxEdge: 1600, quality: 0.82 } },
    ]);
    const meta = JSON.stringify({
      contentType: "image/jpeg",
      cacheControl: "public, max-age=31536000, immutable",
    });
    // Each screened before the next starts, and before anything is named.
    expect(H.events).toEqual([
      `upload a.heic ${meta}`,
      "screen a.heic",
      `upload b.jpg ${meta}`,
      "screen b.jpg",
    ]);
    const paths = [...H.sourceOf.keys()];
    expect(paths).toHaveLength(2);
    for (const path of paths) expect(path).toMatch(PATH);
    // Never an index: two new ids, neither the old one's.
    const ids = paths.map((p) => PATH.exec(p)![1]);
    expect(new Set(ids).size).toBe(2);

    expect(updates()).toHaveLength(1);
    const named = photosOnPost();
    expect(named.map((p) => p.id)).toEqual(["Existing01", ...ids]);
    expect(named[1]).toEqual({
      id: ids[0],
      url: expect.stringContaining(encodeURIComponent(paths[0])),
      w: 1600,
      h: 1200,
    });
    expect(Object.keys(named[1]).sort()).toEqual(["h", "id", "url", "w"]);
    expect(result).toMatchObject({ added: 2, refused: 0, failed: [] });
    expect(result.photos).toEqual(named);
    // A finish screen that mounts again opens with them.
    expect(knownPostPhotos(POST)).toEqual(named);
  });

  it("keeps the photos that passed when others are refused or fail", async () => {
    H.screen["refused.jpg"] = "refused";
    H.screen["unchecked.jpg"] = "unavailable";
    H.upload["dropped.jpg"] = "fail";
    const dropped = file("dropped.jpg");
    const unchecked = file("unchecked.jpg");
    const result = await addPostPhotos({
      uid: "maya",
      activityId: POST,
      current: [],
      files: [file("good.jpg"), file("refused.jpg"), dropped, unchecked],
    });

    expect(result.added).toBe(1);
    expect(result.refused).toBe(1);
    // The files to try again, the refused one not among them.
    expect(result.failed).toEqual([dropped, unchecked]);
    const named = photosOnPost();
    expect(named).toHaveLength(1);
    expect(H.sourceOf.get(`post-photos/maya/${POST}/${named[0].id}.jpg`)).toBe(
      "good.jpg"
    );
    expect(updates()).toHaveLength(1);
  });

  it("names nothing when every photo is refused", async () => {
    H.screen["a.jpg"] = "refused";
    H.screen["b.jpg"] = "refused";
    const result = await addPostPhotos({
      uid: "maya",
      activityId: POST,
      current: [onPost("Existing01")],
      files: [file("a.jpg"), file("b.jpg")],
    });
    expect(result).toMatchObject({ added: 0, refused: 2, failed: [] });
    expect(result.photos).toEqual([onPost("Existing01")]);
    // Anchor: both were uploaded and screened, and still no write.
    expect(H.events.filter((e) => e.startsWith("screen"))).toHaveLength(2);
    expect(updates()).toHaveLength(0);
  });

  it("gives up on a photo after its 30 s ceiling, and still adds the rest", async () => {
    vi.useFakeTimers();
    H.upload["slow.jpg"] = "hang";
    const slow = file("slow.jpg");
    const pending = addPostPhotos({
      uid: "maya",
      activityId: POST,
      current: [],
      files: [slow, file("quick.jpg")],
    });
    await vi.advanceTimersByTimeAsync(POST_PHOTO_CEILING_MS - 1);
    // Still waiting on the slow one: nothing past it has started.
    expect(H.events.some((e) => e.includes("quick.jpg"))).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;
    expect(result.failed).toEqual([slow]);
    expect(result.added).toBe(1);
    expect(photosOnPost()).toHaveLength(1);
  });

  it("adds no more than four, the first picked first", async () => {
    const result = await addPostPhotos({
      uid: "maya",
      activityId: POST,
      current: [
        onPost("Existing01"),
        onPost("Existing02"),
        onPost("Existing03"),
      ],
      files: [file("one.jpg"), file("two.jpg"), file("three.jpg")],
    });
    expect(H.encoded.map((e) => e.name)).toEqual(["one.jpg"]);
    expect(result.added).toBe(1);
    expect(photosOnPost()).toHaveLength(4);

    H.encoded = [];
    const full = await addPostPhotos({
      uid: "maya",
      activityId: POST,
      current: photosOnPost(),
      files: [file("five.jpg")],
    });
    expect(H.encoded).toEqual([]);
    expect(full.added).toBe(0);
  });

  it("adds nothing, and hands every photo back, when the post cannot be updated", async () => {
    failNextFirestore("updateDoc", { path: `activities/${POST}` });
    const a = file("a.jpg");
    const b = file("b.jpg");
    const result = await addPostPhotos({
      uid: "maya",
      activityId: "post-1",
      current: [onPost("Existing01")],
      files: [a, b],
    });
    expect(result).toMatchObject({ added: 0, refused: 0, failed: [a, b] });
    expect(result.photos).toEqual([onPost("Existing01")]);
    expect(readDoc(`activities/${POST}`)?.photos).toBeUndefined();
  });
});

describe("removePostPhoto", () => {
  beforeEach(() => {
    seedFirestore({
      [`activities/${POST}`]: {
        authorId: "maya",
        photos: [onPost("Keep000001"), onPost("Drop000002")],
      },
    });
  });

  it("writes the shorter list first, then deletes the photo's file", async () => {
    let listWhenDeleted: PostPhoto[] | undefined;
    const { deleteObject } = await import("firebase/storage");
    vi.mocked(deleteObject).mockImplementationOnce(async (r) => {
      listWhenDeleted = photosOnPost();
      H.events.push(`delete ${(r as { fullPath: string }).fullPath}`);
    });
    const photos = await removePostPhoto({
      uid: "maya",
      activityId: POST,
      current: [onPost("Keep000001"), onPost("Drop000002")],
      photoId: "Drop000002",
    });
    expect(photos).toEqual([onPost("Keep000001")]);
    expect(photosOnPost()).toEqual([onPost("Keep000001")]);
    // The post no longer named it when its file went.
    expect(listWhenDeleted).toEqual([onPost("Keep000001")]);
    expect(H.events).toEqual([
      `delete post-photos/maya/${POST}/Drop000002.jpg`,
    ]);
  });

  it("still takes the photo off when its file will not delete", async () => {
    H.deleteFails = true;
    await expect(
      removePostPhoto({
        uid: "maya",
        activityId: POST,
        current: [onPost("Keep000001"), onPost("Drop000002")],
        photoId: "Drop000002",
      })
    ).resolves.toEqual([onPost("Keep000001")]);
    expect(photosOnPost()).toEqual([onPost("Keep000001")]);
  });

  it("deletes no file when the post could not be updated", async () => {
    failNextFirestore("updateDoc", { path: `activities/${POST}` });
    await expect(
      removePostPhoto({
        uid: "maya",
        activityId: POST,
        current: [onPost("Keep000001"), onPost("Drop000002")],
        photoId: "Drop000002",
      })
    ).rejects.toBeDefined();
    expect(H.events).toEqual([]);
    expect(photosOnPost()).toHaveLength(2);
  });
});

describe("encodeJpeg is the one encoder", () => {
  it("is what the uploader calls, so no photo leaves as the file picked", async () => {
    await addPostPhotos({
      uid: "maya",
      activityId: POST,
      current: [],
      files: [file("a.jpg")],
    });
    expect(encodeJpeg).toHaveBeenCalled();
  });
});
