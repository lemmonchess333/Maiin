/**
 * One place for a run post's map images, held everywhere it is named
 * (Soc15 call 5): `route-maps/{uid}/{activityId}/{light|dark}.jpg`.
 *
 * Six things name it, and each can drift on its own without the others
 * noticing: the app's upload (routeMapUpload.ts), storage.rules (who may
 * write there), firestore.rules (the URLs a post may name), the photo
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
const firestoreRules = read("firestore.rules");

describe("route-maps/{uid}/{activityId}/{theme}.jpg, named the same everywhere", () => {
  it("is where the app uploads, a JPEG for each theme", () => {
    expect(upload).toContain(
      "ref(storage, `route-maps/${uid}/${activityId}/${theme}.jpg`)"
    );
    expect(upload).toContain('contentType: "image/jpeg"');
    expect([...ROUTE_MAP_THEMES].sort()).toEqual(["dark", "light"]);
  });

  it("is what storage.rules lets the owner write: those two names, a JPEG, beside their own post", () => {
    const block = storageRules.slice(
      storageRules.indexOf("match /route-maps/{uid}/{activityId}/{name}"),
      storageRules.indexOf("// Profile photos")
    );
    expect(block).toContain("allow get: if request.auth != null;");
    expect(block).not.toMatch(/allow (read|list)/);
    expect(block).toContain("isOwnerAndWritable(uid)");
    expect(block).toContain("name in ['light.jpg', 'dark.jpg']");
    expect(block).toContain("request.resource.contentType == 'image/jpeg'");
    expect(block).toMatch(/request\.resource\.size < 512 \* 1024/);
    expect(block).toContain("activities/$(activityId)");
    expect(block).toContain(".data.authorId == uid");
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
