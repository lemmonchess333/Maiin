/**
 * Profile photo upload and removal.
 *
 * What a person and everyone who sees their avatar depend on:
 *   - one stored photo per account: a new upload deletes the one the
 *     public profile tracked, and does so LAST, so a failure anywhere
 *     earlier leaves them with their old photo rather than a broken one;
 *   - a photo is screened before anything names it, and a refused or
 *     unchecked photo changes nothing;
 *   - the new URL is cache-busted and lands on the owner-only doc and the
 *     public mirror in one batch, with the storage pointer on the mirror
 *     only, and on the Auth user as a best effort;
 *   - removal clears the same three, then deletes the tracked file, and
 *     never deletes anything for a photo it does not own (Google, Apple).
 *
 * Storage, Auth and the screening callable are mocked at their SDK
 * boundary; Firestore is the shared fake (ADR-0009). The storage mock
 * keeps the set of files that exist, so a test can say which photo is
 * left, not just which calls were made.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const H = vi.hoisted(() => ({
  auth: { currentUser: null as null | { uid: string } },
  /** Paths that exist in Storage. */
  files: new Set<string>(),
  /** Everything that happened, in order. */
  events: [] as string[],
  uploadError: null as Error | null,
  deleteError: null as Error | null,
  authError: null as Error | null,
  /** The screening callable's answer: ok, refused, or could not check. */
  screen: "ok" as "ok" | "refused" | "unavailable",
  /** Called as a delete starts, so a test can see what was already true. */
  onDelete: null as null | ((path: string) => void),
}));

vi.mock("firebase/firestore");
vi.mock("../firebase", () => ({
  db: {},
  storage: {},
  functions: {},
  auth: H.auth,
}));
vi.mock("firebase/storage", () => ({
  ref: (_storage: unknown, path: string) => ({ fullPath: path }),
  uploadBytes: vi.fn(async (r: { fullPath: string }) => {
    H.events.push(`upload ${r.fullPath}`);
    if (H.uploadError) throw H.uploadError;
    H.files.add(r.fullPath);
  }),
  getDownloadURL: vi.fn(async (r: { fullPath: string }) => {
    H.events.push(`url ${r.fullPath}`);
    return `https://storage.example.invalid/o/${encodeURIComponent(r.fullPath)}?alt=media&token=tok`;
  }),
  deleteObject: vi.fn(async (r: { fullPath: string }) => {
    H.events.push(`delete ${r.fullPath}`);
    H.onDelete?.(r.fullPath);
    if (H.deleteError) throw H.deleteError;
    H.files.delete(r.fullPath);
  }),
}));
vi.mock("firebase/auth", () => ({
  updateProfile: vi.fn(async (_user: unknown, p: { photoURL: string }) => {
    H.events.push(`auth ${p.photoURL === "" ? "cleared" : "set"}`);
    if (H.authError) throw H.authError;
  }),
}));
/* The real `screenUploadedPhoto` runs; only its callable is answered. A
   refused photo is deleted by the server, as functions/lib/photoScreen.js
   does. */
vi.mock("firebase/functions", () => ({
  httpsCallable: () => async (payload: { path: string }) => {
    H.events.push(`screen ${payload.path}`);
    if (H.screen === "unavailable") {
      throw Object.assign(new Error("internal"), {
        code: "functions/internal",
      });
    }
    if (H.screen === "refused") {
      H.files.delete(payload.path);
      return { data: { ok: false } };
    }
    return { data: { ok: true } };
  },
}));

import { updateProfile } from "firebase/auth";
import { uploadBytes } from "firebase/storage";
import { removeProfilePhoto, uploadProfilePhoto } from "../profilePhotoUpload";
import { PhotoRefusedError } from "../photoScreen";
import {
  batchLog,
  failNextFirestore,
  readDoc,
  resetFirestore,
  seedFirestore,
  unfiredFailures,
  writeLog,
} from "@/test/firestoreHarness";

const UID = "u1";
const MAIN = `users/${UID}`;
const PUBLIC = `users/${UID}/public/profile`;
const OLD_PATH = `profile-photos/${UID}/1000.jpg`;
const OLD_URL = "https://storage.example.invalid/old.jpg?alt=media&token=old";
const NOW = Date.now();
const NEW_PATH = `profile-photos/${UID}/${NOW}.jpg`;
const NEW_BASE_URL = `https://storage.example.invalid/o/${encodeURIComponent(NEW_PATH)}?alt=media&token=tok`;
const NEW_URL = `${NEW_BASE_URL}&v=${NOW}`;
const PHOTO = new Blob(["jpeg bytes"], { type: "image/jpeg" });

/** An account with an uploaded photo, as the last upload left it. */
function seedUploadedPhoto() {
  seedFirestore({
    [MAIN]: { displayName: "Sam", photoURL: OLD_URL },
    [PUBLIC]: {
      displayName: "Sam",
      photoURL: OLD_URL,
      photoStoragePath: OLD_PATH,
    },
  });
  H.files.add(OLD_PATH);
}

beforeEach(() => {
  resetFirestore();
  H.auth.currentUser = { uid: UID };
  H.files.clear();
  H.events.length = 0;
  H.uploadError = null;
  H.deleteError = null;
  H.authError = null;
  H.screen = "ok";
  H.onDelete = null;
  vi.clearAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(NOW);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("uploadProfilePhoto", () => {
  it("replaces the old photo everywhere and deletes the old file last", async () => {
    seedUploadedPhoto();
    let pointerAtDelete: unknown;
    H.onDelete = () => {
      pointerAtDelete = readDoc(PUBLIC)?.photoStoragePath;
    };

    const result = await uploadProfilePhoto(UID, PHOTO);

    expect(result).toEqual({ photoURL: NEW_URL, photoStoragePath: NEW_PATH });
    expect(H.events).toEqual([
      `upload ${NEW_PATH}`,
      `screen ${NEW_PATH}`,
      `url ${NEW_PATH}`,
      "auth set",
      `delete ${OLD_PATH}`,
    ]);
    // The old file went only once the profile named the new one.
    expect(pointerAtDelete).toBe(NEW_PATH);
    expect([...H.files]).toEqual([NEW_PATH]);
  });

  it("writes the cache-busted URL to both profile docs in one batch, the storage pointer to the public one only", async () => {
    seedUploadedPhoto();

    await uploadProfilePhoto(UID, PHOTO);

    expect(NEW_URL.startsWith(NEW_BASE_URL)).toBe(true);
    expect(readDoc(PUBLIC)).toMatchObject({
      displayName: "Sam",
      photoURL: NEW_URL,
      photoStoragePath: NEW_PATH,
    });
    expect(readDoc(MAIN)).toEqual({ displayName: "Sam", photoURL: NEW_URL });
    expect(batchLog()).toHaveLength(1);
    expect(
      batchLog()[0]
        .map((w) => w.path)
        .sort()
    ).toEqual([MAIN, PUBLIC]);
    expect(updateProfile).toHaveBeenCalledWith(H.auth.currentUser, {
      photoURL: NEW_URL,
    });
  });

  it("stores the photo as a JPEG that may be cached for good, under a new name", async () => {
    seedUploadedPhoto();

    await uploadProfilePhoto(UID, PHOTO);

    expect(uploadBytes).toHaveBeenCalledWith({ fullPath: NEW_PATH }, PHOTO, {
      contentType: "image/jpeg",
      cacheControl: "public, max-age=31536000, immutable",
    });
    expect(NEW_PATH).not.toBe(OLD_PATH);
  });

  it("deletes nothing on a first upload, or for a photo it does not store (Google, Apple)", async () => {
    seedFirestore({
      [MAIN]: { photoURL: "https://lh3.example.invalid/a.jpg" },
      [PUBLIC]: { photoURL: "https://lh3.example.invalid/a.jpg" },
    });

    await uploadProfilePhoto(UID, PHOTO);

    expect(readDoc(PUBLIC)?.photoStoragePath).toBe(NEW_PATH);
    expect(H.events.filter((e) => e.startsWith("delete"))).toEqual([]);
  });

  it("does not delete the file it has just written when the tracked path is the same", async () => {
    // A retry in the same millisecond as a save that landed.
    seedFirestore({
      [MAIN]: { photoURL: OLD_URL },
      [PUBLIC]: { photoURL: OLD_URL, photoStoragePath: NEW_PATH },
    });

    await uploadProfilePhoto(UID, PHOTO);

    expect(readDoc(PUBLIC)?.photoURL).toBe(NEW_URL);
    expect(H.events.filter((e) => e.startsWith("delete"))).toEqual([]);
    expect(H.files.has(NEW_PATH)).toBe(true);
  });

  it("refuses when no one is signed in, before uploading anything", async () => {
    seedUploadedPhoto();
    H.auth.currentUser = null;

    await expect(uploadProfilePhoto(UID, PHOTO)).rejects.toThrow(
      "Not signed in."
    );
    expect(uploadBytes).not.toHaveBeenCalled();
    expect(readDoc(PUBLIC)?.photoURL).toBe(OLD_URL);
  });

  it("refuses to upload for another account", async () => {
    seedUploadedPhoto();
    H.auth.currentUser = { uid: "someone-else" };

    await expect(uploadProfilePhoto(UID, PHOTO)).rejects.toThrow(
      "Cannot upload a profile photo for another user."
    );
    expect(uploadBytes).not.toHaveBeenCalled();
    expect(writeLog()).toHaveLength(0);
  });

  it("keeps the old photo when the upload fails", async () => {
    seedUploadedPhoto();
    H.uploadError = Object.assign(new Error("offline"), {
      code: "storage/retry-limit-exceeded",
    });

    await expect(uploadProfilePhoto(UID, PHOTO)).rejects.toThrow("offline");
    expect(H.events).toEqual([`upload ${NEW_PATH}`]);
    expect(writeLog()).toHaveLength(0);
    expect([...H.files]).toEqual([OLD_PATH]);
  });

  it("keeps the old photo when the new one is refused as nudity", async () => {
    seedUploadedPhoto();
    H.screen = "refused";

    await expect(uploadProfilePhoto(UID, PHOTO)).rejects.toBeInstanceOf(
      PhotoRefusedError
    );
    expect(writeLog()).toHaveLength(0);
    expect(readDoc(PUBLIC)?.photoURL).toBe(OLD_URL);
    expect(updateProfile).not.toHaveBeenCalled();
    // The server took the refused file; the old one stays.
    expect([...H.files]).toEqual([OLD_PATH]);
  });

  it("keeps the old photo when the new one could not be checked", async () => {
    seedUploadedPhoto();
    H.screen = "unavailable";

    await expect(uploadProfilePhoto(UID, PHOTO)).rejects.toMatchObject({
      code: "functions/internal",
    });
    expect(writeLog()).toHaveLength(0);
    expect(H.files.has(OLD_PATH)).toBe(true);
    expect(H.events.filter((e) => e.startsWith("delete"))).toEqual([]);
  });

  it("keeps the old photo, file and all, when the profile write fails", async () => {
    seedUploadedPhoto();
    failNextFirestore("commit", { code: "unavailable" });

    await expect(uploadProfilePhoto(UID, PHOTO)).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(unfiredFailures()).toHaveLength(0);
    expect(readDoc(PUBLIC)).toMatchObject({
      photoURL: OLD_URL,
      photoStoragePath: OLD_PATH,
    });
    expect(readDoc(MAIN)?.photoURL).toBe(OLD_URL);
    expect(updateProfile).not.toHaveBeenCalled();
    expect(H.files.has(OLD_PATH)).toBe(true);
    expect(H.events.filter((e) => e.startsWith("delete"))).toEqual([]);
  });

  it("still succeeds when the Auth profile cannot be updated", async () => {
    seedUploadedPhoto();
    H.authError = new Error("auth/network-request-failed");

    await expect(uploadProfilePhoto(UID, PHOTO)).resolves.toEqual({
      photoURL: NEW_URL,
      photoStoragePath: NEW_PATH,
    });
    expect(readDoc(MAIN)?.photoURL).toBe(NEW_URL);
    expect([...H.files]).toEqual([NEW_PATH]);
  });

  it("still succeeds when the old file cannot be deleted", async () => {
    seedUploadedPhoto();
    H.deleteError = Object.assign(new Error("gone"), {
      code: "storage/object-not-found",
    });

    await expect(uploadProfilePhoto(UID, PHOTO)).resolves.toEqual({
      photoURL: NEW_URL,
      photoStoragePath: NEW_PATH,
    });
    expect(readDoc(PUBLIC)?.photoStoragePath).toBe(NEW_PATH);
    expect(H.events).toContain(`delete ${OLD_PATH}`);
  });
});

describe("removeProfilePhoto", () => {
  it("clears the photo everywhere, then deletes the stored file", async () => {
    seedUploadedPhoto();
    let atDelete: unknown;
    H.onDelete = () => {
      atDelete = {
        public: readDoc(PUBLIC)?.photoURL,
        main: readDoc(MAIN)?.photoURL,
        auth: H.events.includes("auth cleared"),
      };
    };

    await removeProfilePhoto(UID);

    expect(readDoc(PUBLIC)).toEqual({
      displayName: "Sam",
      photoURL: "",
      photoStoragePath: null,
    });
    expect(readDoc(MAIN)).toEqual({ displayName: "Sam", photoURL: "" });
    expect(batchLog()).toHaveLength(1);
    expect(updateProfile).toHaveBeenCalledWith(H.auth.currentUser, {
      photoURL: "",
    });
    expect(H.events).toEqual(["auth cleared", `delete ${OLD_PATH}`]);
    expect(atDelete).toEqual({ public: "", main: "", auth: true });
    expect(H.files.size).toBe(0);
  });

  it("deletes no file for a photo it does not store (Google, Apple)", async () => {
    seedFirestore({
      [MAIN]: { photoURL: "https://lh3.example.invalid/a.jpg" },
      [PUBLIC]: { photoURL: "https://lh3.example.invalid/a.jpg" },
    });

    await removeProfilePhoto(UID);

    expect(readDoc(PUBLIC)?.photoURL).toBe("");
    expect(readDoc(MAIN)?.photoURL).toBe("");
    expect(H.events).toEqual(["auth cleared"]);
  });

  it("refuses for another account, or no account, and changes nothing", async () => {
    seedUploadedPhoto();
    for (const currentUser of [{ uid: "someone-else" }, null]) {
      H.auth.currentUser = currentUser;
      await expect(removeProfilePhoto(UID)).rejects.toThrow(
        "Cannot remove another user's profile photo."
      );
    }
    expect(writeLog()).toHaveLength(0);
    expect(H.files.has(OLD_PATH)).toBe(true);
    expect(H.events).toEqual([]);
  });

  it("keeps the photo and its file when the profile write fails", async () => {
    seedUploadedPhoto();
    failNextFirestore("commit", { code: "unavailable" });

    await expect(removeProfilePhoto(UID)).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(unfiredFailures()).toHaveLength(0);
    expect(readDoc(PUBLIC)?.photoURL).toBe(OLD_URL);
    expect(H.files.has(OLD_PATH)).toBe(true);
    expect(H.events).toEqual([]);
  });

  it("still removes the photo when the Auth profile or the file delete fails", async () => {
    seedUploadedPhoto();
    H.authError = new Error("auth/network-request-failed");
    H.deleteError = new Error("storage/unknown");

    await expect(removeProfilePhoto(UID)).resolves.toBeUndefined();
    expect(readDoc(PUBLIC)?.photoURL).toBe("");
    expect(readDoc(MAIN)?.photoURL).toBe("");
    // Auth failing did not stop the delete being tried.
    expect(H.events).toEqual(["auth cleared", `delete ${OLD_PATH}`]);
  });
});
