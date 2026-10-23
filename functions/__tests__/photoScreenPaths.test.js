/** Exercise the callable and upload backstop with Storage object names
 * accepted by the recursive public-photo rules. Cloud Storage names are
 * opaque keys: a slash or two dots in the name must not bypass screening. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "demo-tropos";

const admin = require("firebase-admin");
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const { screenPhoto, screenUploadedPhoto } = require("../index");

const originals = new Map(
  ["firestore", "storage", "credential"].map((name) => [
    name,
    Object.getOwnPropertyDescriptor(admin, name),
  ])
);
const realFirestore = admin.firestore;
const file = {
  download: vi.fn(async () => [Buffer.from("jpeg")]),
  delete: vi.fn(async () => undefined),
};
const bucket = { file: vi.fn(() => file) };
const storage = { bucket: vi.fn(() => bucket) };
const getAccessToken = vi.fn(async () => ({ access_token: "test-token" }));

beforeEach(() => {
  vi.clearAllMocks();
  const db = memoryFirestore({});
  const firestore = Object.assign(() => db, {
    FieldValue: realFirestore.FieldValue,
    Timestamp: realFirestore.Timestamp,
  });
  for (const [name, value] of [
    ["firestore", firestore],
    ["storage", () => storage],
    ["credential", { applicationDefault: () => ({ getAccessToken }) }],
  ]) {
    Object.defineProperty(admin, name, {
      configurable: true,
      get: () => value,
    });
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        responses: [{ safeSearchAnnotation: { adult: "VERY_LIKELY" } }],
      }),
    }))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(admin, name, descriptor);
    else delete admin[name];
  }
});

describe.each(["space-photos", "profile-photos"])(
  "%s path screening",
  (prefix) => {
    it.each(["/nested/a.jpg", "/a..jpg", "/nested/../a.jpg", "", "/"])(
      "the upload trigger screens and deletes a refused %s",
      async (suffix) => {
        const path = `${prefix}/u1${suffix}`;
        await screenUploadedPhoto.run({ name: path, bucket: "test-bucket" });

        expect(storage.bucket).toHaveBeenCalledWith("test-bucket");
        expect(bucket.file).toHaveBeenCalledWith(path);
        expect(file.download).toHaveBeenCalledOnce();
        expect(file.delete).toHaveBeenCalledWith({ ignoreNotFound: true });
      }
    );

    it("the callable screens an owner's nested object with dots in its name", async () => {
      const path = `${prefix}/u1/nested/a..jpg`;
      await expect(
        screenPhoto.run({ path }, { auth: { uid: "u1", token: {} } })
      ).resolves.toEqual({ ok: false });
      expect(bucket.file).toHaveBeenCalledWith(path);
      expect(file.delete).toHaveBeenCalledWith({ ignoreNotFound: true });
    });

    it("the callable still rejects another owner's nested object before Vision", async () => {
      await expect(
        screenPhoto.run(
          { path: `${prefix}/u2/nested/a..jpg` },
          { auth: { uid: "u1", token: {} } }
        )
      ).rejects.toMatchObject({ code: "invalid-argument" });
      expect(getAccessToken).not.toHaveBeenCalled();
      expect(bucket.file).not.toHaveBeenCalled();
    });
  }
);

it.each(["progress-photos/u1/nested/a.jpg", "food-photos/u1/a..jpg"])(
  "the upload trigger leaves the private object %s unscreened",
  async (path) => {
    await screenUploadedPhoto.run({ name: path, bucket: "test-bucket" });
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(bucket.file).not.toHaveBeenCalled();
  }
);
