import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
vi.mock("../firebase", () => ({ auth: { currentUser: null }, functions: {} }));
import { activityMediaKey } from "../activityMedia";
const require = createRequire(import.meta.url);
const {
  mediaUrl,
  namesMedia,
} = require("../../../functions/lib/activityMedia.js");

/** The server owns authorization; the client only transports bytes. This
 * pins their shared identity contract, not a client copy of authorization. */
describe("activity media identity across server and client", () => {
  for (const bucket of [
    "adaptive-fitness-af8bb.appspot.com",
    "adaptive-fitness-af8bb.firebasestorage.app",
  ]) {
    it(`reads server photo identities for ${bucket}, including legacy records`, () => {
      for (const id of ["Photo001", "a".repeat(64)]) {
        const path = `post-photos/author/post-1/${id}.jpg`;
        for (const suffix of ["", "?alt=media&token=legacy", "#old-record"]) {
          const url = mediaUrl(bucket, path) + suffix;
          expect(namesMedia(url, path)).toBe(true);
          expect(activityMediaKey(url)).toEqual({
            activityId: "post-1",
            kind: "photo",
            id,
          });
        }
      }
    });
    it(`reads both server map identities for ${bucket}`, () => {
      for (const id of ["light", "dark"]) {
        const path = `route-maps/author/post-1/${id}.jpg`;
        const url = mediaUrl(bucket, path);
        expect(namesMedia(url, path)).toBe(true);
        expect(activityMediaKey(url)).toEqual({
          activityId: "post-1",
          kind: "map",
          id,
        });
      }
    });
  }
  it("neither accepts another project's URLs", () => {
    const path = "post-photos/author/post-1/Photo001.jpg";
    const url = `https://firebasestorage.googleapis.com/v0/b/other.appspot.com/o/${encodeURIComponent(path)}`;
    expect(namesMedia(url, path)).toBe(false);
    expect(activityMediaKey(url)).toBeNull();
  });
});
