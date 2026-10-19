/**
 * screenPhoto is rate limited: thirty checks in ten minutes per account.
 *
 * Each call is a paid Cloud Vision request and nothing stopped one photo
 * being sent again and again. The upload trigger screens every file
 * anyway, so the limit costs a real person nothing.
 *
 * Run through the real callable over an in-memory Firestore. The Vision
 * step is reached through `admin.credential`, stubbed here to count its
 * calls and then throw, so a request the limiter lets through ends at
 * "unavailable" without leaving the process.
 */
import { describe, it, expect, afterEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "demo-tropos";

const admin = require("firebase-admin");
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const { screenPhoto } = require("../index");

let visionReached = 0;

function install(db) {
  const real = admin.firestore;
  const firestore = Object.assign(() => db, {
    FieldValue: real.FieldValue,
    Timestamp: real.Timestamp,
  });
  Object.defineProperty(admin, "firestore", {
    configurable: true,
    get: () => firestore,
  });
  Object.defineProperty(admin, "credential", {
    configurable: true,
    get: () => ({
      applicationDefault: () => ({
        getAccessToken: async () => {
          visionReached++;
          throw new Error("no credentials in tests");
        },
      }),
    }),
  });
}

afterEach(() => {
  delete admin.firestore;
  delete admin.credential;
  visionReached = 0;
});

const context = { auth: { uid: "u1", token: {} } };
const photo = { path: "profile-photos/u1/avatar.jpg" };

describe("screenPhoto's rate limit", () => {
  it("lets a check through on an account that has made none", async () => {
    // Anchor: the limiter does not refuse everything.
    install(memoryFirestore({}));
    await expect(screenPhoto.run(photo, context)).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(visionReached).toBe(1);
  });

  it("refuses the thirty-first check in ten minutes, before Vision", async () => {
    const now = Date.now();
    install(
      memoryFirestore({
        "rateLimits/u1_screenPhoto": {
          timestamps: Array.from({ length: 30 }, (_, i) => now - i * 1000),
        },
      })
    );
    await expect(screenPhoto.run(photo, context)).rejects.toMatchObject({
      code: "resource-exhausted",
    });
    expect(visionReached).toBe(0);
  });

  it("counts only the last ten minutes", async () => {
    const now = Date.now();
    install(
      memoryFirestore({
        "rateLimits/u1_screenPhoto": {
          timestamps: Array.from(
            { length: 30 },
            (_, i) => now - 11 * 60_000 - i * 1000
          ),
        },
      })
    );
    await expect(screenPhoto.run(photo, context)).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(visionReached).toBe(1);
  });
});
