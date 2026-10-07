/**
 * The packet 14 report callables, driven through `.run(data, context)`.
 * The heavy target-resolution / authority logic lives in
 * reportTargets.test.js (pure) and the emulator integration lane; this file
 * pins the wiring around it:
 *
 *   - createReport rejects an unauthenticated call BEFORE doing any work.
 *   - createReport stores the report and its authority, THEN emails the
 *     owner (MODERATION_ALERT_EMAIL) through Resend; a failed or hung email
 *     never fails the report, and a report that failed to store sends none.
 *   - listPendingReports says which reports Hide content can act on.
 *   - resolveReport's Hide content removes each kind of content: an activity
 *     made private, a comment or Space comment deleted with its parent's
 *     count, a space post deleted with its likes and comments.
 *   - resolveReport's Restrict user writes the restriction, and the
 *     moderation page's Lift takes it off again (S4e).
 *
 * Firestore is the in-memory double (helpers/memoryFirestore.cjs), put
 * behind `admin.firestore()` for the duration of a test; the rate limiter
 * and the deletion lock are swapped on their module objects (index.js calls
 * both through the module). Resend is mocked at `fetch`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// firebase-functions/v1 refuses to construct triggers without a project id.
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "demo-tropos";

const admin = require("firebase-admin");
const rateLimiter = require("../rateLimiter");
const accountDeletionLocks = require("../lib/accountDeletionLocks");
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const {
  createReport,
  listPendingReports,
  resolveReport,
  listRestrictedUsers,
  liftRestriction,
} = require("../index");

const realIsRateLimited = rateLimiter.isRateLimited;
const realActorLock = accountDeletionLocks.assertCallableActorNotDeleting;

/** Point admin.firestore() at an in-memory database. FieldValue sentinels
 *  become plain markers so stored values read back as data. */
function useMemoryFirestore(seed) {
  const db = memoryFirestore(seed);
  const ns = Object.assign(() => db, admin.firestore, {
    FieldValue: {
      serverTimestamp: () => "SERVER_TS",
      increment: (n) => ({ increment: n }),
    },
  });
  Object.defineProperty(admin, "firestore", {
    value: ns,
    configurable: true,
    writable: true,
  });
  return db;
}

beforeEach(() => {
  rateLimiter.isRateLimited = async () => false;
  accountDeletionLocks.assertCallableActorNotDeleting = async () => {};
});

afterEach(() => {
  // The own property shadowed firebase-admin's prototype getter.
  delete admin.firestore;
  rateLimiter.isRateLimited = realIsRateLimited;
  accountDeletionLocks.assertCallableActorNotDeleting = realActorLock;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("createReport — auth precedence", () => {
  it("rejects an unauthenticated call with unauthenticated", async () => {
    await expect(createReport.run({}, {})).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });
});

const SPACE = "spaces/runners/posts/p1";
const SPACE_COMMENT = `${SPACE}/comments/c1`;

function spaceCommentSeed() {
  return {
    [SPACE]: {
      authorId: "poster",
      body: "First run of the block.",
      commentCount: 2,
    },
    [SPACE_COMMENT]: {
      authorId: "commenter",
      authorName: "Sam",
      text: "rude words",
    },
  };
}

const REPORTER = { auth: { uid: "reporter-1" } };
const SPACE_COMMENT_REPORT = {
  targetType: "space_post_comment",
  targetId: "runners:p1:c1",
  category: "harassment",
  subReason: "Targeted insults or threats",
  freeformNote: "Third time this week.",
};

function storedReports(db) {
  return [...db.data.keys()].filter((k) => k.startsWith("reports/"));
}

describe("createReport — the alert to the owner", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("MODERATION_ALERT_EMAIL", "mod@troposfit.com");
    vi.stubEnv("PUBLIC_APP_BASE_URL", "https://troposfit.com/");
  });

  it("stores a Space comment report with its authority, then emails the owner", async () => {
    const db = useMemoryFirestore(spaceCommentSeed());
    let storedWhenEmailed = null;
    const fetchMock = vi.fn(async () => {
      storedWhenEmailed = storedReports(db).length;
      return { ok: true };
    });
    vi.stubGlobal("fetch", fetchMock);

    const { reportId } = await createReport.run(SPACE_COMMENT_REPORT, REPORTER);

    expect(db.data.get(`reports/${reportId}`)).toMatchObject({
      reporterId: "reporter-1",
      targetType: "space_post_comment",
      targetId: "runners:p1:c1",
      targetUid: "commenter",
      category: "harassment",
      freeformNote: "Third time this week.",
      status: "pending",
    });
    expect(db.data.get(`reportAuthority/${reportId}`)).toMatchObject({
      version: 1,
      targetType: "space_post_comment",
      targetUid: "commenter",
    });

    // One email, sent once the report was already stored.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(storedWhenEmailed).toBe(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test_key");
    const body = JSON.parse(init.body);
    expect(body.to).toBe("mod@troposfit.com");
    expect(body.subject).toBe(
      "New report: Harassment or bullying (a comment on a space post)"
    );
    expect(body.html).toContain(
      "Harassment or bullying: Targeted insults or threats"
    );
    expect(body.html).toContain("A comment on a space post");
    expect(body.html).toContain("Third time this week.");
    expect(body.html).toContain(
      'href="https://troposfit.com/admin/moderation"'
    );
    // No uids in the email: they stay behind the admin gate.
    expect(body.html).not.toContain("commenter");
    expect(body.html).not.toContain("reporter-1");
  });

  it("sends to support@troposfit.com when MODERATION_ALERT_EMAIL is unset", async () => {
    vi.stubEnv("MODERATION_ALERT_EMAIL", "");
    useMemoryFirestore(spaceCommentSeed());
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await createReport.run(SPACE_COMMENT_REPORT, REPORTER);

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).to).toBe(
      "support@troposfit.com"
    );
  });

  it("still files the report when the email fails", async () => {
    const db = useMemoryFirestore(spaceCommentSeed());
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Resend down")));

    const { reportId } = await createReport.run(SPACE_COMMENT_REPORT, REPORTER);

    expect(db.data.get(`reports/${reportId}`).status).toBe("pending");
  });

  it("still files the report when Resend never answers", async () => {
    vi.useFakeTimers();
    const db = useMemoryFirestore(spaceCommentSeed());
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {}))
    );

    const pending = createReport.run(SPACE_COMMENT_REPORT, REPORTER);
    await vi.advanceTimersByTimeAsync(10_000);
    const { reportId } = await pending;

    expect(db.data.get(`reports/${reportId}`).status).toBe("pending");
  });

  it("sends no email for a report that failed to store", async () => {
    const db = useMemoryFirestore(spaceCommentSeed());
    // The first auto id the in-memory database mints.
    db.failures.set(
      "create:reports/auto0000000000000001",
      new Error("commit failed")
    );
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createReport.run(SPACE_COMMENT_REPORT, REPORTER)
    ).rejects.toThrow("commit failed");
    expect(storedReports(db)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

const ADMIN = { auth: { uid: "admin-1" } };

function pendingReport(id, authority) {
  return {
    [`reports/${id}`]: {
      reporterId: "reporter-1",
      targetType: authority.targetType,
      targetId: authority.targetId,
      targetUid: authority.targetUid,
      reason: "harassment",
      category: "harassment",
      status: "pending",
      createdAt: 1,
    },
    [`reportAuthority/${id}`]: { version: 1, ...authority },
  };
}

describe("listPendingReports — what Hide content can act on", () => {
  beforeEach(() => vi.stubEnv("ADMIN_UIDS", "admin-1"));

  it("marks a Space comment hideable and a profile not", async () => {
    useMemoryFirestore({
      ...spaceCommentSeed(),
      "users/u9/public/profile": { displayName: "Dana" },
      ...pendingReport("r1", {
        targetType: "space_post_comment",
        targetId: "runners:p1:c1",
        targetUid: "commenter",
      }),
      ...pendingReport("r2", {
        targetType: "user",
        targetId: "u9",
        targetUid: "u9",
      }),
    });

    const { reports } = await listPendingReports.run({}, ADMIN);
    const byId = Object.fromEntries(reports.map((r) => [r.reportId, r]));

    expect(byId.r1).toMatchObject({
      targetType: "space_post_comment",
      targetActionable: true,
      targetHideable: true,
      target: { text: "rude words", authorName: "Sam" },
    });
    expect(byId.r2).toMatchObject({
      targetType: "user",
      targetActionable: true,
      targetHideable: false,
    });
  });
});

describe("resolveReport — Hide content", () => {
  beforeEach(() => vi.stubEnv("ADMIN_UIDS", "admin-1"));

  it("deletes a reported Space comment and takes it off the post's count", async () => {
    const db = useMemoryFirestore({
      ...spaceCommentSeed(),
      ...pendingReport("r1", {
        targetType: "space_post_comment",
        targetId: "runners:p1:c1",
        targetUid: "commenter",
      }),
    });

    await expect(
      resolveReport.run({ reportId: "r1", hideActivity: true }, ADMIN)
    ).resolves.toEqual({ ok: true });

    expect(db.data.has(SPACE_COMMENT)).toBe(false);
    expect(db.data.get(SPACE).commentCount).toEqual({ increment: -1 });
    expect(db.data.get("reports/r1")).toMatchObject({
      status: "resolved",
      resolvedBy: "admin-1",
      hideAppliedByAdmin: true,
      hideOutcome: "deleted",
      targetResolution: "revalidated",
    });
  });

  it("deletes a reported activity comment and takes it off the activity's count", async () => {
    const db = useMemoryFirestore({
      "activities/a1": {
        authorId: "author-9",
        visibility: "public",
        commentCount: 4,
      },
      "comments/a1/items/c1": { authorId: "commenter", text: "rude words" },
      ...pendingReport("r1", {
        targetType: "comment",
        targetId: "a1:c1",
        targetUid: "commenter",
      }),
    });

    await resolveReport.run({ reportId: "r1", hideActivity: true }, ADMIN);

    expect(db.data.has("comments/a1/items/c1")).toBe(false);
    expect(db.data.get("activities/a1").commentCount).toEqual({
      increment: -1,
    });
    expect(db.data.get("reports/r1").hideOutcome).toBe("deleted");
  });

  it("deletes a reported space post with its likes and comments", async () => {
    const db = useMemoryFirestore({
      ...spaceCommentSeed(),
      [`${SPACE}/likes/u2`]: { createdAt: 1 },
      "spaces/runners/posts/p2": { authorId: "someone", body: "Keep me." },
      ...pendingReport("r1", {
        targetType: "space_post",
        targetId: "runners:p1",
        targetUid: "poster",
      }),
    });

    await resolveReport.run({ reportId: "r1", hideActivity: true }, ADMIN);

    const left = [...db.data.keys()].filter((k) => k.startsWith("spaces/"));
    expect(left).toEqual(["spaces/runners/posts/p2"]);
    expect(db.data.get("reports/r1").hideOutcome).toBe("deleted");
  });

  it("still makes a reported activity private rather than deleting it", async () => {
    const db = useMemoryFirestore({
      "activities/a1": { authorId: "author-9", visibility: "public" },
      ...pendingReport("r1", {
        targetType: "activity",
        targetId: "a1",
        targetUid: "author-9",
      }),
    });

    await resolveReport.run({ reportId: "r1", hideActivity: true }, ADMIN);

    expect(db.data.get("activities/a1")).toMatchObject({
      visibility: "private",
      flagged: true,
      flaggedBy: "admin",
      flaggedByAdminUid: "admin-1",
    });
    expect(db.data.get("reports/r1").hideOutcome).toBe("flagged-private");
  });

  it("refuses to hide a profile, and leaves the report pending", async () => {
    const db = useMemoryFirestore({
      "users/u9/public/profile": { displayName: "Dana" },
      ...pendingReport("r1", {
        targetType: "user",
        targetId: "u9",
        targetUid: "u9",
      }),
    });

    await expect(
      resolveReport.run({ reportId: "r1", hideActivity: true }, ADMIN)
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(db.data.get("reports/r1").status).toBe("pending");
    expect(db.data.has("users/u9/public/profile")).toBe(true);
  });

  it("dismissing leaves the content where it is", async () => {
    const db = useMemoryFirestore({
      ...spaceCommentSeed(),
      ...pendingReport("r1", {
        targetType: "space_post_comment",
        targetId: "runners:p1:c1",
        targetUid: "commenter",
      }),
    });

    await resolveReport.run({ reportId: "r1", hideActivity: false }, ADMIN);

    expect(db.data.get("reports/r1").status).toBe("resolved");
    expect(db.data.get("reports/r1")).not.toHaveProperty("hideOutcome");
    expect(db.data.has(SPACE_COMMENT)).toBe(true);
    expect(db.data.get(SPACE).commentCount).toBe(2);
  });
});

describe("resolveReport — Restrict user (S4e)", () => {
  beforeEach(() => vi.stubEnv("ADMIN_UIDS", "admin-1"));

  it("restricts the reported account with the report, in one write", async () => {
    const db = useMemoryFirestore({
      ...spaceCommentSeed(),
      ...pendingReport("r1", {
        targetType: "space_post_comment",
        targetId: "runners:p1:c1",
        targetUid: "commenter",
      }),
    });

    await resolveReport.run(
      { reportId: "r1", hideActivity: false, restrictUser: true },
      ADMIN
    );

    expect(db.data.get("globalRestrictedUids/commenter")).toEqual({
      uid: "commenter",
      restrictedAt: "SERVER_TS",
      restrictionEndsAt: null,
      strikes: null,
      lastActionedReport: "r1",
    });
    expect(db.data.get("reports/r1")).toMatchObject({
      status: "resolved",
      restrictAppliedByAdmin: true,
      hideAppliedByAdmin: false,
    });
    // Restricting is not hiding: the comment stays until it is hidden.
    expect(db.data.has(SPACE_COMMENT)).toBe(true);
  });

  it("restricts nobody from a report the server cannot vouch for", async () => {
    const db = useMemoryFirestore({
      ...spaceCommentSeed(),
      "reports/r1": {
        reporterId: "reporter-1",
        targetUid: "commenter",
        status: "pending",
        createdAt: 1,
      },
    });

    await expect(
      resolveReport.run(
        { reportId: "r1", hideActivity: false, restrictUser: true },
        ADMIN
      )
    ).rejects.toMatchObject({ code: "failed-precondition" });
    expect(db.data.has("globalRestrictedUids/commenter")).toBe(false);
    expect(db.data.get("reports/r1").status).toBe("pending");
  });
});

describe("listRestrictedUsers and liftRestriction (S4e)", () => {
  beforeEach(() => vi.stubEnv("ADMIN_UIDS", "admin-1"));

  const restricted = (uid, report) => ({
    [`globalRestrictedUids/${uid}`]: {
      uid,
      restrictedAt: "SERVER_TS",
      restrictionEndsAt: null,
      strikes: null,
      lastActionedReport: report,
    },
  });

  it("lists each restricted account with its name and report", async () => {
    useMemoryFirestore({
      ...restricted("u1", "r1"),
      ...restricted("u2", "r2"),
      "users/u1/public/profile": { displayName: "Dana" },
    });

    const { restricted: rows } = await listRestrictedUsers.run({}, ADMIN);

    expect(rows).toEqual([
      {
        uid: "u1",
        displayName: "Dana",
        restrictedAt: null,
        lastActionedReport: "r1",
      },
      {
        uid: "u2",
        displayName: null,
        restrictedAt: null,
        lastActionedReport: "r2",
      },
    ]);
  });

  it("lifts a restriction and records who lifted it on its report", async () => {
    const db = useMemoryFirestore({
      ...restricted("u1", "r1"),
      "reports/r1": { status: "resolved", resolvedBy: "admin-2" },
    });

    await expect(liftRestriction.run({ uid: "u1" }, ADMIN)).resolves.toEqual({
      ok: true,
      lifted: true,
    });

    expect(db.data.has("globalRestrictedUids/u1")).toBe(false);
    expect(db.data.get("reports/r1")).toEqual({
      status: "resolved",
      resolvedBy: "admin-2",
      restrictionLiftedBy: "admin-1",
      restrictionLiftedAt: "SERVER_TS",
    });
    // A second tap finds nothing to lift and changes nothing.
    await expect(liftRestriction.run({ uid: "u1" }, ADMIN)).resolves.toEqual({
      ok: true,
      lifted: false,
    });
  });

  it("still lifts when the report has gone", async () => {
    const db = useMemoryFirestore(restricted("u1", "r-gone"));
    await liftRestriction.run({ uid: "u1" }, ADMIN);
    expect(db.data.has("globalRestrictedUids/u1")).toBe(false);
    expect(db.data.has("reports/r-gone")).toBe(false);
  });

  it("refuses anyone but an admin, and a malformed uid", async () => {
    const db = useMemoryFirestore(restricted("u1", "r1"));
    const someone = { auth: { uid: "someone" } };
    await expect(listRestrictedUsers.run({}, someone)).rejects.toMatchObject({
      code: "permission-denied",
    });
    await expect(
      liftRestriction.run({ uid: "u1" }, someone)
    ).rejects.toMatchObject({ code: "permission-denied" });
    await expect(liftRestriction.run({ uid: "u1" }, {})).rejects.toMatchObject({
      code: "unauthenticated",
    });
    for (const uid of ["", " u1", "a/b", "..", 7, undefined]) {
      await expect(liftRestriction.run({ uid }, ADMIN)).rejects.toMatchObject({
        code: "invalid-argument",
      });
    }
    expect(db.data.has("globalRestrictedUids/u1")).toBe(true);
  });
});
