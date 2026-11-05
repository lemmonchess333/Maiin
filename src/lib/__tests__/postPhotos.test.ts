/**
 * A post's photos as a reader takes them (Soc15 call 2): its own entries
 * in order, at most four, any that are not a photo's shape left out; a
 * new photo's random id; and the words a screen reader hears for one.
 */
import { describe, expect, it } from "vitest";
import {
  newPostPhotoId,
  POST_PHOTO_MAX,
  postPhotoAlt,
  postPhotosOf,
} from "../postPhotos";

const photo = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  url: `https://firebasestorage.googleapis.com/v0/b/b/o/post-photos%2Fu%2Fp%2F${id}.jpg`,
  w: 1600,
  h: 1200,
  ...extra,
});

describe("postPhotosOf", () => {
  it("reads a post's photos in their order", () => {
    const list = [photo("Aaaaaaaa1"), photo("Bbbbbbbb2")];
    expect(postPhotosOf(list)).toEqual(list);
  });

  it("reads at most four", () => {
    const list = ["A", "B", "C", "D", "E"].map((c) => photo(`${c}0000000`));
    expect(postPhotosOf(list)).toHaveLength(POST_PHOTO_MAX);
    expect(POST_PHOTO_MAX).toBe(4);
  });

  it.each([
    ["no id", { id: undefined }],
    ["a short id", { id: "abc" }],
    ["an id with a slash", { id: "abcd/efgh" }],
    ["a plain-http url", { url: "http://example.com/a.jpg" }],
    ["no url", { url: undefined }],
    ["a fractional width", { w: 10.5 }],
    ["a zero height", { h: 0 }],
    ["a side past 4096", { w: 5000 }],
    ["a text side", { h: "1200" }],
  ])("leaves out an entry with %s, keeping the rest", (_, extra) => {
    const good = photo("Aaaaaaaa1");
    expect(postPhotosOf([photo("Bbbbbbbb2", extra), good])).toEqual([good]);
  });

  it.each([undefined, null, "photos", { 0: photo("Aaaaaaaa1") }, [null, 7]])(
    "reads %j as no photos",
    (value) => {
      expect(postPhotosOf(value)).toEqual([]);
    }
  );
});

describe("newPostPhotoId", () => {
  it("is 20 letters and digits, a new one each time", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newPostPhotoId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9]{20}$/);
  });
});

describe("postPhotoAlt", () => {
  it("names the photo, its place and whose session it is", () => {
    expect(postPhotoAlt(1, 3, "Maya Chen", "run")).toBe(
      "Photo 2 of 3 from Maya Chen's run"
    );
    expect(postPhotoAlt(0, 1, "Sam", "workout")).toBe(
      "Photo 1 of 1 from Sam's workout"
    );
  });

  it("says this session when the post carries no name", () => {
    expect(postPhotoAlt(0, 2, "  ", "run")).toBe("Photo 1 of 2 from this run");
  });
});
