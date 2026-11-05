/**
 * One place for a run post's map images, held everywhere it is named
 * (Soc15 call 5): `route-maps/{uid}/{activityId}/{light|dark}.jpg`.
 *
 * The app and server must agree: the app's callable upload
 * (routeMapUpload.ts), the gateway (functions/lib/activityMedia.js),
 * storage.rules (direct reads/uploads denied; owner cleanup retained), firestore.rules (the URLs a post may name), the photo
 * screen (functions/lib/photoScreen.js), the post's delete trigger
 * (functions/lib/routeMapFiles.js) and the account-deletion sweep
 * (functions/accountDeletion.js, inventory key routeMapsStorage,
 * unit::accountDeletion.routeMapsStorage). A map uploaded where the
 * screen does not look would reach readers unchecked; one the sweeps do
 * not reach would outlive its post or its account.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ROUTE_MAP_THEMES } from "../routeMapGeometry";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const read = (file: string) => readFileSync(resolve(repoRoot, file), "utf8");
const require = createRequire(import.meta.url);

const upload = read("src/lib/routeMapUpload.ts");
const storageRules = read("storage.rules");
const gateway = read("functions/lib/activityMedia.js");
const media = require("../../../functions/lib/activityMedia.js");
const firestoreRules = read("firestore.rules");

describe("route-maps/{uid}/{activityId}/{theme}.jpg, named the same everywhere", () => {
  it("uses the callable for JPEG uploads for each theme", () => {
    expect(upload).toContain('uploadActivityMedia(');
    expect(upload).toContain('{ activityId, kind: "map", id: theme }');
    expect(upload).not.toContain("uploadBytes(");
    expect(upload).not.toContain("getDownloadURL(");
    expect([...ROUTE_MAP_THEMES].sort()).toEqual(["dark", "light"]);
    expect(gateway).toContain('${request.kind === "photo" ? "post-photos" : "route-maps"}/${authorId}/${request.activityId}/${request.id}.jpg');
    expect(gateway).toContain('["light", "dark"].includes(data.id)');
    expect(gateway).toContain('contentType: "image/jpeg"');
    expect(media.LIMITS.map).toBe(512 * 1024);
    expect(upload).toContain("export const ROUTE_MAP_MAX_BYTES = 400 * 1024;");
    for (const theme of ROUTE_MAP_THEMES) {
      const path = `route-maps/u1/post-1/${theme}.jpg`;
      expect(media.namesMedia(media.mediaUrl(
        "adaptive-fitness-af8bb.firebasestorage.app", path
      ), path)).toBe(true);
    }
  });

  it("denies direct Storage reads/uploads while retaining owner cleanup", () => {
    const block = storageRules.slice(
      storageRules.indexOf("match /route-maps/{uid}/{activityId}/{name}"),
      storageRules.indexOf("match /post-photos/{uid}/{activityId}/{name}")
    );
    expect(block).toContain("allow get, list, create, update: if false;");
    expect(block).toContain("allow delete: if isOwnerAndWritable(uid);");
  });

  it("is the only folder a post's routeMap may name, one image per theme", () => {
    const fn = firestoreRules.slice(
      firestoreRules.indexOf("function isRouteMapUrl("),
      firestoreRules.indexOf("function isRouteMap(")
    );
    expect(fn).toContain(
      "/o/route-maps%2F' + authorId + '%2F' + postId + '%2F' + theme + '\\\\.jpg([?#].*)?$'"
    );
    expect(firestoreRules).toContain(
      "isRouteMapUrl(m.light, authorId, postId, 'light')"
    );
    expect(firestoreRules).toContain(
      "isRouteMapUrl(m.dark, authorId, postId, 'dark')"
    );
  });

  it("is screened as every photo others see is", () => {
    const { screenedOwner } = require("../../../functions/lib/photoScreen.js");
    for (const theme of ROUTE_MAP_THEMES) {
      expect(screenedOwner(`route-maps/u1/post-1/${theme}.jpg`)).toBe("u1");
    }
  });

  it("is emptied when its post is deleted", () => {
    const {
      routeMapPrefix,
    } = require("../../../functions/lib/routeMapFiles.js");
    expect(routeMapPrefix("u1", "post-1")).toBe("route-maps/u1/post-1/");
    expect(read("functions/index.js")).toMatch(
      /onActivityDeleted[\s\S]*?routeMapFiles\.deleteRouteMapFiles\(/
    );
  });

  it("is in the account-deletion sweep (unit::accountDeletion.routeMapsStorage)", () => {
    expect(read("functions/accountDeletion.js")).toContain(
      '"route-maps/__UID__/"'
    );
    const {
      storagePrefixesFor,
    } = require("../../../functions/accountDeletion.js");
    expect(storagePrefixesFor("u1")).toContain("route-maps/u1/");
    const inventory = JSON.parse(
      read("functions/accountDeletionInventory.json")
    );
    const entry = inventory.included.find(
      (e: { key: string }) => e.key === "routeMapsStorage"
    );
    expect(entry).toMatchObject({
      type: "storagePrefix",
      path: "route-maps/{uid}/",
      strategy: "deleteStoragePrefix",
    });
  });
});
