import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { Readable } from "node:stream";
const require = createRequire(import.meta.url);
const {
  createActivityMediaHandlers,
  mediaUrl,
  LIMITS,
} = require("../lib/activityMedia");
const JPEG = Buffer.from([255, 216, 1, 2, 255, 217]);
const BUCKET = "adaptive-fitness-af8bb.firebasestorage.app";
function fixture({
  visibility = "public",
  kind = "photo",
  viewer = "viewer",
} = {}) {
  const request = {
    activityId: "post",
    kind,
    id: kind === "photo" ? "photo_001" : "light",
  };
  const path = `${kind === "photo" ? "post-photos" : "route-maps"}/author/post/${request.id}.jpg`;
  const url = mediaUrl(BUCKET, path);
  const activity = {
    authorId: "author",
    visibility,
    photos: [{ id: request.id, url: url + "?alt=media&token=legacy" }],
    routePreview: [
      [0, 0],
      [1, 1],
    ],
    routeMap: { light: url },
  };
  const docs = new Map([
    ["activities/post", activity],
    ["users/author", {}],
    ["users/viewer", {}],
  ]);
  const ref = (path) => ({
    path,
    collection: (name) => ({ doc: (id) => ref(`${path}/${name}/${id}`) }),
  });
  const db = {
    collection: (name) => ({ doc: (id) => ref(`${name}/${id}`) }),
    runTransaction: async (fn) =>
      fn({
        get: async (r) => ({
          exists: docs.has(r.path),
          data: () => docs.get(r.path),
        }),
      }),
  };
  const state = {
    downloads: 0,
    saves: [],
    deletes: [],
    objects: new Map([
      [
        path,
        {
          bytes: JPEG,
          metadata: {
            generation: "1",
            size: String(JPEG.length),
            contentType: "image/jpeg",
            metadata: { firebaseStorageDownloadTokens: "legacy" },
          },
        },
      ],
    ]),
  };
  const bucket = {
    name: BUCKET,
    file: (name, opts) => ({
      getMetadata: async () => {
        const o = state.objects.get(name);
        if (!o) throw Object.assign(new Error(), { code: 404 });
        return [o.metadata];
      },
      createReadStream: () => {
        state.downloads++;
        state.downloadOptions = opts;
        const o = state.objects.get(name);
        state.onRead?.();
        return Readable.from([o.bytes]);
      },
      save: async (bytes, options) => {
        state.saves.push(options);
        const old = state.objects.get(name);
        if (
          String(options.preconditionOpts.ifGenerationMatch) !==
          String(old?.metadata.generation || 0)
        )
          throw Object.assign(new Error(), { code: 412 });
        state.objects.set(name, {
          bytes,
          metadata: {
            ...options.metadata,
            generation: "2",
            size: String(bytes.length),
          },
        });
        state.onSave?.();
      },
      delete: async (options) => {
        state.deletes.push({ opts, options });
        state.objects.delete(name);
      },
    }),
  };
  let screenResult = { adult: "VERY_UNLIKELY" };
  const api = createActivityMediaHandlers({
    db,
    bucket,
    assertAdmin: () => {
      if (!state.adminEnabled)
        throw Object.assign(new Error(), { code: "permission-denied" });
    },
    getAccessToken: async () => "test-credential",
    screen: async () => {
      state.screenCalls = (state.screenCalls || 0) + 1;
      state.onScreen?.();
      if (screenResult instanceof Error) throw screenResult;
      return screenResult;
    },
  });
  return {
    request,
    path,
    url,
    activity,
    docs,
    state,
    api,
    bucket,
    context: { auth: { uid: viewer, token: { email_verified: true } } },
    refuse: (r) => {
      screenResult = r;
    },
  };
}
const denied = (p) =>
  expect(p).rejects.toMatchObject({ code: "permission-denied" });
describe("authenticated activity media", () => {
  it("reads only pinned bytes, not a bearer URL, and permits legacy identifiers", async () => {
    const f = fixture();
    expect(await f.api.read(f.request, f.context)).toEqual({
      base64: JPEG.toString("base64"),
      contentType: "image/jpeg",
    });
    expect(f.state.downloadOptions).toEqual({ generation: "1" });
  });
  it("requires authentication before any download", async () => {
    const f = fixture();
    await expect(f.api.read(f.request, {})).rejects.toMatchObject({
      code: "unauthenticated",
    });
    expect(f.state.downloads).toBe(0);
  });
  it("allows the private owner but not a signed-in stranger", async () => {
    const f = fixture({ visibility: "private" });
    await denied(f.api.read(f.request, f.context));
    f.context.auth.uid = "author";
    await f.api.read(f.request, f.context);
  });
  it("requires an accepted follower, not a follow request", async () => {
    const f = fixture({ visibility: "followers" });
    f.docs.set("followRequests/author/users/viewer", {});
    await denied(f.api.read(f.request, f.context));
    f.docs.set("followers/author/users/viewer", {});
    await f.api.read(f.request, f.context);
    f.docs.delete("followers/author/users/viewer");
    await denied(f.api.read(f.request, f.context));
  });
  for (const edge of [
    "blocks/author/users/viewer",
    "blocks/viewer/users/author",
  ])
    it(`denies public media across ${edge}`, async () => {
      const f = fixture();
      f.docs.set(edge, {});
      await denied(f.api.read(f.request, f.context));
      expect(f.state.downloads).toBe(0);
    });
  for (const uid of ["author", "viewer"])
    for (const collection of ["deletedAccounts", "accountDeletionRequests"])
      it(`denies ${collection} for ${uid}`, async () => {
        const f = fixture();
        f.docs.set(`${collection}/${uid}`, { status: "running" });
        await denied(f.api.read(f.request, f.context));
      });
  for (const uid of ["author", "viewer"])
    it(`denies missing live account ${uid}`, async () => {
      const f = fixture();
      f.docs.delete(`users/${uid}`);
      await denied(f.api.read(f.request, f.context));
    });
  it("does not disclose missing posts, removed media or cross-post URL membership", async () => {
    const f = fixture();
    f.activity.photos[0].url = mediaUrl(
      BUCKET,
      f.path.replace("/post/", "/other/")
    );
    await denied(f.api.read(f.request, f.context));
    f.activity.photos = [];
    await denied(f.api.read(f.request, f.context));
    f.docs.delete("activities/post");
    await denied(f.api.read(f.request, f.context));
    expect(f.state.downloads).toBe(0);
  });
  it("requires shared route and exact theme membership for maps", async () => {
    const f = fixture({ kind: "map" });
    await f.api.read(f.request, f.context);
    f.activity.routeMap.light += "evil";
    await denied(f.api.read(f.request, f.context));
    f.activity.routeMap.light = f.url;
    f.activity.routePreview = [];
    await denied(f.api.read(f.request, f.context));
  });
  for (const mutate of [
    (f) => {
      f.activity.visibility = "private";
    },
    (f) => {
      f.activity.photos = [];
    },
    (f) => f.docs.set("blocks/author/users/viewer", {}),
    (f) => f.docs.set("accountDeletionRequests/author", { status: "running" }),
  ])
    it("rechecks revocation after download", async () => {
      const f = fixture();
      f.state.onRead = () => mutate(f);
      await denied(f.api.read(f.request, f.context));
    });
  it("bounds streaming bytes even if metadata lies", async () => {
    const f = fixture();
    f.state.objects.get(f.path).bytes = Buffer.alloc(LIMITS.photo);
    await denied(f.api.read(f.request, f.context));
  });
  it("rejects oversized metadata before downloading", async () => {
    const f = fixture();
    f.state.objects.get(f.path).metadata.size = LIMITS.photo;
    await denied(f.api.read(f.request, f.context));
    expect(f.state.downloads).toBe(0);
  });
  it("rejects unsafe IDs and kinds", async () => {
    const f = fixture();
    for (const data of [
      { ...f.request, activityId: "../post" },
      { ...f.request, id: "../photo" },
      { ...f.request, kind: "avatar" },
    ])
      await expect(f.api.read(data, f.context)).rejects.toMatchObject({
        code: "invalid-argument",
      });
  });
});
describe("server-only media upload", () => {
  function uploadFixture(options) {
    const f = fixture({ viewer: "author", ...options });
    f.state.objects.delete(f.path);
    f.request.base64 = JPEG.toString("base64");
    return f;
  }
  it("screens before create, never returns tokens, and disables storage caching", async () => {
    const f = uploadFixture();
    expect(await f.api.upload(f.request, f.context)).toEqual({ url: f.url });
    expect(f.state.screenCalls).toBe(1);
    expect(f.state.saves[0].preconditionOpts.ifGenerationMatch).toBe(0);
    expect(f.state.saves[0].metadata).toMatchObject({
      contentType: "image/jpeg",
      cacheControl: "private, no-store, max-age=0",
      metadata: { firebaseStorageDownloadTokens: "" },
    });
  });
  it("refuses non-owner and unverified uploads", async () => {
    const f = uploadFixture();
    f.context.auth.uid = "viewer";
    await denied(f.api.upload(f.request, f.context));
    f.context.auth.uid = "author";
    f.context.auth.token.email_verified = false;
    await denied(f.api.upload(f.request, f.context));
    expect(f.state.saves).toHaveLength(0);
  });
  it("refuses restricted public uploads but permits private ones", async () => {
    const f = uploadFixture();
    f.docs.set("globalRestrictedUids/author", {});
    await denied(f.api.upload(f.request, f.context));
    f.activity.visibility = "private";
    await f.api.upload(f.request, f.context);
  });
  it("refuses adult content before it reaches storage", async () => {
    const f = uploadFixture();
    f.refuse({ adult: "LIKELY" });
    await expect(f.api.upload(f.request, f.context)).rejects.toMatchObject({
      code: "failed-precondition",
      details: { reason: "photo-refused" },
    });
    expect(f.state.saves).toHaveLength(0);
  });
  it("fails closed when screening is unavailable", async () => {
    const f = uploadFixture();
    f.refuse(new Error("private service response"));
    await expect(f.api.upload(f.request, f.context)).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(f.state.saves).toHaveLength(0);
  });
  it("fails closed on missing, unknown or malformed screening annotations", async () => {
    for (const annotation of [
      null,
      {},
      { adult: "UNKNOWN" },
      { adult: "nonsense" },
    ]) {
      const f = uploadFixture();
      f.refuse(annotation);
      await expect(f.api.upload(f.request, f.context)).rejects.toMatchObject({
        code: "unavailable",
      });
      expect(f.state.saves).toHaveLength(0);
    }
  });
  it("validates base64, JPEG markers and size", async () => {
    const f = uploadFixture();
    for (const base64 of [
      "!invalid!",
      Buffer.from("not jpeg").toString("base64"),
      JPEG.toString("base64") + "\n",
      Buffer.alloc(LIMITS.photo).toString("base64"),
    ])
      await expect(
        f.api.upload({ ...f.request, base64 }, f.context)
      ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(f.state.screenCalls).toBeUndefined();
  });
  it("does not overwrite a photo id", async () => {
    const f = uploadFixture();
    await f.api.upload(f.request, f.context);
    await expect(f.api.upload(f.request, f.context)).rejects.toMatchObject({
      code: "aborted",
    });
  });
  it("overwrites maps with generation checks and replaces legacy token metadata", async () => {
    const f = fixture({ viewer: "author", kind: "map" });
    f.request.base64 = JPEG.toString("base64");
    await f.api.upload(f.request, f.context);
    expect(f.state.saves[0].preconditionOpts.ifGenerationMatch).toBe("1");
    expect(
      f.state.objects.get(f.path).metadata.metadata
        .firebaseStorageDownloadTokens
    ).toBe("");
  });
  it("rechecks deletion after screening before saving", async () => {
    const f = uploadFixture();
    f.state.onScreen = () =>
      f.docs.set("accountDeletionRequests/author", { status: "running" });
    await denied(f.api.upload(f.request, f.context));
    expect(f.state.saves).toHaveLength(0);
  });
  it("cleans up only its own generation if deletion races the save", async () => {
    const f = uploadFixture();
    f.state.onSave = () => f.docs.set("deletedAccounts/author", {});
    await denied(f.api.upload(f.request, f.context));
    expect(f.state.deletes[0].opts).toEqual({ generation: "2" });
    expect(f.state.objects.has(f.path)).toBe(false);
  });
  it("does not delete a competing upload on compensation", async () => {
    const f = uploadFixture();
    f.state.onSave = () => {
      f.docs.delete("activities/post");
      f.state.objects.get(f.path).metadata.metadata.activityMediaUploadId =
        "another-upload";
    };
    await denied(f.api.upload(f.request, f.context));
    expect(f.state.deletes).toHaveLength(0);
  });
});

describe("reported activity media", () => {
  function reported() {
    const f = fixture({ visibility: "private" });
    f.state.adminEnabled = true;
    f.docs.set("reports/report_1", {
      status: "pending",
      targetId: "attacker-controlled",
    });
    f.docs.set("reportAuthority/report_1", {
      version: 1,
      targetType: "activity",
      targetId: "post",
    });
    f.input = { reportId: "report_1", id: f.request.id };
    return f;
  }
  it("allows a current moderator to inspect a pending report's private photo", async () => {
    const f = reported();
    f.docs.set("blocks/author/users/viewer", {});
    expect(await f.api.readReported(f.input, f.context)).toEqual({
      base64: JPEG.toString("base64"),
      contentType: "image/jpeg",
    });
  });
  it("rejects non-admins before storage access", async () => {
    const f = reported();
    f.state.adminEnabled = false;
    await denied(f.api.readReported(f.input, f.context));
    expect(f.state.downloads).toBe(0);
  });
  it("never trusts forged report targets or client activity ids", async () => {
    const f = reported();
    f.docs.delete("reportAuthority/report_1");
    await denied(
      f.api.readReported({ ...f.input, activityId: "post" }, f.context)
    );
    expect(f.state.downloads).toBe(0);
  });
  it("rejects authority for other content types", async () => {
    const f = reported();
    f.docs.get("reportAuthority/report_1").targetType = "user";
    await denied(f.api.readReported(f.input, f.context));
  });
  it("requires the photo to remain named on the reported activity", async () => {
    const f = reported();
    f.activity.photos = [];
    await denied(f.api.readReported(f.input, f.context));
  });
  it("does not expose deleted authors to moderators", async () => {
    const f = reported();
    f.docs.set("deletedAccounts/author", {});
    await denied(f.api.readReported(f.input, f.context));
  });
  for (const revoke of [
    (f) => {
      f.state.adminEnabled = false;
    },
    (f) => {
      f.docs.get("reports/report_1").status = "resolved";
    },
    (f) => {
      f.docs.delete("reportAuthority/report_1");
    },
  ])
    it("rechecks role and report authority after download", async () => {
      const f = reported();
      f.state.onRead = () => revoke(f);
      await denied(f.api.readReported(f.input, f.context));
    });
  it("ignores reportId on the ordinary endpoint, so it never grants admin access", async () => {
    const f = reported();
    await denied(f.api.read({ ...f.request, reportId: "report_1" }, f.context));
  });
});
