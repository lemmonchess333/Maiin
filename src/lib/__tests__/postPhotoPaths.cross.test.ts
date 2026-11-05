/**
 * One place for a shared session's photos, held everywhere it is named
 * (Soc15 call 2): `post-photos/{uid}/{activityId}/{photoId}.jpg`.
 *
 * The app and server must agree: the app's callable upload
 * (postPhotoUpload.ts), the gateway (functions/lib/activityMedia.js),
 * storage.rules (direct reads/uploads denied; owner cleanup retained), firestore.rules (the URLs a post may name, `isPostPhotoUrl`),
 * the server's copy of that answer for the moderation queue
 * (functions/lib/postPhotos.js), the photo screen
 * (functions/lib/photoScreen.js), the post's delete trigger
 * (onActivityDeleted, functions/lib/postPhotos.js) and the account-deletion
 * sweep (functions/accountDeletion.js, inventory key postPhotosStorage,
 * unit::accountDeletion.postPhotosStorage). A photo uploaded where the
 * screen does not look would reach readers unchecked; one the sweeps do not
 * reach would outlive its post or its account.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { newPostPhotoId, POST_PHOTO_MAX } from "../postPhotos";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const read = (file: string) => readFileSync(resolve(repoRoot, file), "utf8");
const require = createRequire(import.meta.url);

const upload = read("src/lib/postPhotoUpload.ts");
const storageRules = read("storage.rules");
const gateway = read("functions/lib/activityMedia.js");
const media = require("../../../functions/lib/activityMedia.js");
const firestoreRules = read("firestore.rules");
const serverPhotos = require("../../../functions/lib/postPhotos.js");

/** The id rule as each side writes it. */
const ID_RULE = "^[A-Za-z0-9_-]{8,64}";

describe("post-photos/{uid}/{activityId}/{photoId}.jpg, named the same everywhere", () => {
  it("uses the callable for JPEG uploads under a new random id", () => {
    expect(upload).toMatch(/uploadActivityMedia\(\s*\{\s*activityId,\s*kind: "photo",\s*id\s*\},\s*blob\s*\)/);
    expect(upload).not.toContain("uploadBytes(");
    expect(upload).not.toContain("getDownloadURL(");
    expect(upload).toContain("const id = newPostPhotoId();");
    expect(newPostPhotoId()).toMatch(new RegExp(`${ID_RULE}$`));
    expect(gateway).toContain('${request.kind === "photo" ? "post-photos" : "route-maps"}/${authorId}/${request.activityId}/${request.id}.jpg');
    expect(gateway).toContain('/^[A-Za-z0-9_-]{8,64}$/');
    expect(gateway).toContain('contentType: "image/jpeg"');
    expect(media.LIMITS.photo).toBe(2 * 1024 * 1024);
    expect(media.namesMedia(media.mediaUrl(
      "adaptive-fitness-af8bb.firebasestorage.app",
      "post-photos/u1/post-1/Ab3dEf6hIj.jpg"
    ), "post-photos/u1/post-1/Ab3dEf6hIj.jpg")).toBe(true);
  });

  it("denies direct Storage reads/uploads while retaining owner cleanup", () => {
    const block = storageRules.slice(
      storageRules.indexOf("match /post-photos/{uid}/{activityId}/{name}"),
      storageRules.indexOf("// Profile photos")
    );
    expect(block).toContain("allow get, list, create, update: if false;");
    expect(block).toContain("allow delete: if isOwnerAndWritable(uid);");
    expect(upload).toContain(
      "export const POST_PHOTO_MAX_BYTES = 2 * 1024 * 1024;"
    );
    expect(upload).toContain("ref(storage, `post-photos/${uid}/${activityId}/${id}.jpg`)");
  });

  it("is the only folder a post's photos may name, each its own id, at most four", () => {
    const fn = firestoreRules.slice(
      firestoreRules.indexOf("function isPostPhotoUrl("),
      firestoreRules.indexOf("function isPostPhoto(")
    );
    expect(fn).toContain(
      "/o/post-photos%2F' + authorId + '%2F' + postId + '%2F' + id + '\\\\.jpg([?#].*)?$'"
    );
    const entry = firestoreRules.slice(
      firestoreRules.indexOf("function isPostPhoto("),
      firestoreRules.indexOf("function isPostPhotoList(")
    );
    expect(entry).toContain(`p.id.matches('${ID_RULE}$')`);
    const list = firestoreRules.slice(
      firestoreRules.indexOf("function isPostPhotoList("),
      firestoreRules.indexOf("function onlyRemovesPostPhotos(")
    );
    expect(list).toContain(`photos.size() <= ${POST_PHOTO_MAX}`);
    expect(serverPhotos.MAX_POST_PHOTOS).toBe(POST_PHOTO_MAX);
    // `photos` is never on a create's allowlist.
    const create = firestoreRules.slice(
      firestoreRules.indexOf("match /activities/{activityId}"),
      firestoreRules.indexOf("allow update: if request.auth != null")
    );
    expect(create).not.toContain("'photos'");
  });

  it("takes the ids the app makes and refuses the ones the rules refuse", () => {
    const urlFor = (id: string) =>
      `https://firebasestorage.googleapis.com/v0/b/adaptive-fitness-af8bb.firebasestorage.app/o/post-photos%2Fu1%2Fpost-1%2F${id}.jpg?alt=media`;
    const made = newPostPhotoId();
    expect(
      serverPhotos.isPostPhotoUrl(urlFor(made), "u1", "post-1", made)
    ).toBe(true);
    for (const id of ["Aa1", "x".repeat(65), "has space1", "Aaaa/aaa1"]) {
      expect(serverPhotos.isPostPhotoUrl(urlFor(id), "u1", "post-1", id)).toBe(
        false
      );
    }
  });

  it("is what the moderation queue takes as the post's own photo", () => {
    const own = `https://firebasestorage.googleapis.com/v0/b/adaptive-fitness-af8bb.firebasestorage.app/o/post-photos%2Fu1%2Fpost-1%2FAb3dEf6hIj.jpg?alt=media&token=t`;
    expect(serverPhotos.isPostPhotoUrl(own, "u1", "post-1", "Ab3dEf6hIj")).toBe(
      true
    );
    expect(
      serverPhotos.isPostPhotoUrl(
        own.replace("post-photos", "route-maps"),
        "u1",
        "post-1",
        "Ab3dEf6hIj"
      )
    ).toBe(false);
  });

  it("is screened as every photo others see is", () => {
    const { screenedOwner } = require("../../../functions/lib/photoScreen.js");
    expect(screenedOwner(`post-photos/u1/post-1/${newPostPhotoId()}.jpg`)).toBe(
      "u1"
    );
  });

  it("is emptied when its post is deleted, whatever the post names", () => {
    expect(serverPhotos.postPhotoPrefix("u1", "post-1")).toBe(
      "post-photos/u1/post-1/"
    );
    expect(read("functions/index.js")).toMatch(
      /onActivityDeleted[\s\S]*?postPhotos\.deletePostPhotoFiles\(/
    );
  });

  it("is in the account-deletion sweep (unit::accountDeletion.postPhotosStorage)", () => {
    expect(read("functions/accountDeletion.js")).toContain(
      '"post-photos/__UID__/"'
    );
    const {
      storagePrefixesFor,
    } = require("../../../functions/accountDeletion.js");
    expect(storagePrefixesFor("u1")).toContain("post-photos/u1/");
    const inventory = JSON.parse(
      read("functions/accountDeletionInventory.json")
    );
    const entry = inventory.included.find(
      (e: { key: string }) => e.key === "postPhotosStorage"
    );
    expect(entry).toMatchObject({
      type: "storagePrefix",
      path: "post-photos/{uid}/",
      strategy: "deleteStoragePrefix",
    });
  });
});
