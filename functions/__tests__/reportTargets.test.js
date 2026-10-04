import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  normalizeCreateReportInput,
  resolveReportTarget,
  isReportTargetError,
  queueContentHide,
  HIDEABLE_TARGET_TYPES,
  TARGET_TYPES,
} = require("../lib/reportTargets");

/**
 * Fake Firestore. `docs` maps a path → data (or null for "missing").
 * `firestore.doc(path)` returns a ref carrying its path + a .get() (the
 * creation/queue read mode). A separate `reader` with .get(ref) models the
 * transaction read mode.
 */
function makeFs(docs) {
  const snap = (path) => ({
    exists: docs[path] !== undefined && docs[path] !== null,
    data: () => docs[path] || null,
  });
  const firestore = {
    doc: (path) => ({ _path: path, get: async () => snap(path) }),
  };
  const txReader = { get: async (ref) => snap(ref._path) };
  return { firestore, txReader };
}

async function expectFail(promise, code) {
  await expect(promise).rejects.toMatchObject({ code });
  await promise.catch((e) => expect(isReportTargetError(e)).toBe(true));
}

describe("normalizeCreateReportInput", () => {
  it("accepts a valid activity report and maps impersonation→other", () => {
    const out = normalizeCreateReportInput({
      targetType: "activity",
      targetId: "act1",
      category: "impersonation",
      freeformNote: "x".repeat(500),
    });
    expect(out.targetType).toBe("activity");
    expect(out.category).toBe("impersonation");
    expect(out.reason).toBe("other");
    expect(out.freeformNote).toHaveLength(500);
    expect(out.hideFromFeed).toBe(false);
  });

  it("rejects an unknown create key (forgeable field)", () => {
    expect(() =>
      normalizeCreateReportInput({
        targetType: "activity",
        targetId: "a",
        category: "spam",
        targetUid: "victim", // forbidden
      })
    ).toThrow();
  });

  it("rejects a 501-char note but accepts 500", () => {
    const base = { targetType: "user", targetId: "u", category: "spam" };
    expect(() =>
      normalizeCreateReportInput({ ...base, freeformNote: "x".repeat(501) })
    ).toThrow();
    expect(
      normalizeCreateReportInput({ ...base, freeformNote: "x".repeat(500) })
        .freeformNote
    ).toHaveLength(500);
  });

  it("rejects an unknown target type, category, and malformed compound id", () => {
    expect(() =>
      normalizeCreateReportInput({
        targetType: "ufo",
        targetId: "a",
        category: "spam",
      })
    ).toThrow();
    expect(() =>
      normalizeCreateReportInput({
        targetType: "activity",
        targetId: "a",
        category: "nope",
      })
    ).toThrow();
    expect(() =>
      normalizeCreateReportInput({
        targetType: "comment",
        targetId: "no-colon",
        category: "spam",
      })
    ).toThrow();
  });
});

describe("resolveReportTarget — target uid comes from the stored doc", () => {
  it("activity: derives targetUid from the current activity author (public)", async () => {
    const { firestore } = makeFs({
      "activities/a1": {
        authorId: "author-9",
        visibility: "public",
        authorName: "Bo",
      },
    });
    const r = await resolveReportTarget({
      firestore,
      reporterUid: "stranger",
      targetType: "activity",
      targetId: "a1",
    });
    expect(r.targetUid).toBe("author-9");
    expect(r.targetRef._path).toBe("activities/a1");
    expect(r.preview.authorName).toBe("Bo");
  });

  it("comment: derives from the comment author + requires the parent readable", async () => {
    const { firestore, txReader } = makeFs({
      "comments/a1/items/c1": { authorId: "commenter", text: "hi" },
      "activities/a1": { authorId: "author-9", visibility: "public" },
    });
    const r = await resolveReportTarget({
      firestore,
      reader: txReader,
      targetType: "comment",
      targetId: "a1:c1",
    });
    expect(r.targetUid).toBe("commenter");
    expect(r.targetRef._path).toBe("comments/a1/items/c1");
  });

  it("user: derives targetUid from the reported uid", async () => {
    const { firestore } = makeFs({
      "users/u5/public/profile": { displayName: "Dana" },
    });
    const r = await resolveReportTarget({
      firestore,
      targetType: "user",
      targetId: "u5",
    });
    expect(r.targetUid).toBe("u5");
    expect(r.preview.displayName).toBe("Dana");
  });

  it("space_post: derives from the post author", async () => {
    const { firestore } = makeFs({
      "spaces/s1/posts/p1": { authorId: "poster", title: "T", body: "B" },
    });
    const r = await resolveReportTarget({
      firestore,
      targetType: "space_post",
      targetId: "s1:p1",
    });
    expect(r.targetUid).toBe("poster");
    expect(r.preview.spaceId).toBe("s1");
  });

  it("a missing target and a missing authorId both surface as unavailable", async () => {
    const missing = makeFs({});
    await expectFail(
      resolveReportTarget({
        firestore: missing.firestore,
        targetType: "activity",
        targetId: "gone",
      }),
      "report-target-unavailable"
    );
    const noAuthor = makeFs({ "activities/a1": { visibility: "public" } });
    await expectFail(
      resolveReportTarget({
        firestore: noAuthor.firestore,
        targetType: "activity",
        targetId: "a1",
      }),
      "report-target-unavailable"
    );
  });
});

describe("resolveReportTarget — reporter visibility on private/followers", () => {
  const priv = () => ({
    authorId: "author-9",
    visibility: "private",
    authorName: "Bo",
  });
  const fol = () => ({ authorId: "author-9", visibility: "followers" });

  it("owner and public are always visible; a stranger on private is not", async () => {
    const owner = makeFs({ "activities/a1": priv() });
    await expect(
      resolveReportTarget({
        firestore: owner.firestore,
        reporterUid: "author-9",
        targetType: "activity",
        targetId: "a1",
      })
    ).resolves.toMatchObject({ targetUid: "author-9" });

    const stranger = makeFs({ "activities/a1": priv() });
    await expectFail(
      resolveReportTarget({
        firestore: stranger.firestore,
        reporterUid: "mallory",
        targetType: "activity",
        targetId: "a1",
      }),
      "report-target-unavailable"
    );
  });

  it("a follower can see a followers-only activity; a former follower cannot", async () => {
    const follower = makeFs({
      "activities/a1": fol(),
      "followers/author-9/users/carol": { since: 1 },
    });
    await expect(
      resolveReportTarget({
        firestore: follower.firestore,
        reader: follower.txReader,
        reporterUid: "carol",
        targetType: "activity",
        targetId: "a1",
      })
    ).resolves.toMatchObject({ targetUid: "author-9" });

    const former = makeFs({ "activities/a1": fol() }); // no follower doc
    await expectFail(
      resolveReportTarget({
        firestore: former.firestore,
        reader: former.txReader,
        reporterUid: "dave",
        targetType: "activity",
        targetId: "a1",
      }),
      "report-target-unavailable"
    );
  });

  it("the admin path (no reporterUid) skips the visibility gate", async () => {
    const { firestore } = makeFs({ "activities/a1": priv() });
    await expect(
      resolveReportTarget({ firestore, targetType: "activity", targetId: "a1" })
    ).resolves.toMatchObject({ targetUid: "author-9" });
  });
});

describe("space_post_comment — the Space comment target", () => {
  it("is a target type, and one Hide content can act on", () => {
    expect(TARGET_TYPES).toContain("space_post_comment");
    expect(HIDEABLE_TARGET_TYPES).toContain("space_post_comment");
    // A profile has no content of its own; its action is Restrict user.
    expect(HIDEABLE_TARGET_TYPES).not.toContain("user");
  });

  it("takes exactly three ids, space:post:comment", () => {
    const out = normalizeCreateReportInput({
      targetType: "space_post_comment",
      targetId: "runners:p1:c1",
      category: "harassment",
    });
    expect(out).toMatchObject({
      targetType: "space_post_comment",
      targetId: "runners:p1:c1",
    });
    for (const targetId of ["runners:p1", "runners:p1:c1:x", "runners::c1"]) {
      expect(() =>
        normalizeCreateReportInput({
          targetType: "space_post_comment",
          targetId,
          category: "spam",
        })
      ).toThrow();
    }
  });

  it("leaves the two-part ids of comment and space_post as they were", () => {
    expect(() =>
      normalizeCreateReportInput({
        targetType: "comment",
        targetId: "a1:c1:extra",
        category: "spam",
      })
    ).toThrow();
    expect(
      normalizeCreateReportInput({
        targetType: "space_post",
        targetId: "runners:p1",
        category: "spam",
      }).targetId
    ).toBe("runners:p1");
  });

  it("resolves the comment's author, its text, and the post holding its count", async () => {
    const { firestore, txReader } = makeFs({
      "spaces/runners/posts/p1": { authorId: "poster", body: "B" },
      "spaces/runners/posts/p1/comments/c1": {
        authorId: "commenter",
        authorName: "Sam",
        text: "rude words",
      },
    });
    const r = await resolveReportTarget({
      firestore,
      reader: txReader,
      reporterUid: "stranger",
      targetType: "space_post_comment",
      targetId: "runners:p1:c1",
    });
    expect(r.targetUid).toBe("commenter");
    expect(r.targetRef._path).toBe("spaces/runners/posts/p1/comments/c1");
    expect(r.parentRef._path).toBe("spaces/runners/posts/p1");
    expect(r.preview).toEqual({
      authorId: "commenter",
      authorName: "Sam",
      text: "rude words",
      spaceId: "runners",
      postId: "p1",
    });
  });

  it("is unavailable when the comment or its post is gone", async () => {
    const noComment = makeFs({ "spaces/runners/posts/p1": { authorId: "x" } });
    await expectFail(
      resolveReportTarget({
        firestore: noComment.firestore,
        targetType: "space_post_comment",
        targetId: "runners:p1:c1",
      }),
      "report-target-unavailable"
    );
    const noPost = makeFs({
      "spaces/runners/posts/p1/comments/c1": { authorId: "commenter" },
    });
    await expectFail(
      resolveReportTarget({
        firestore: noPost.firestore,
        targetType: "space_post_comment",
        targetId: "runners:p1:c1",
      }),
      "report-target-unavailable"
    );
  });

  it("an activity comment also resolves the activity holding its count", async () => {
    const { firestore } = makeFs({
      "comments/a1/items/c1": { authorId: "commenter", text: "hi" },
      "activities/a1": { authorId: "author-9", visibility: "public" },
    });
    const r = await resolveReportTarget({
      firestore,
      targetType: "comment",
      targetId: "a1:c1",
    });
    expect(r.parentRef._path).toBe("activities/a1");
  });
});

describe("queueContentHide — what Hide content writes", () => {
  function recorder() {
    const writes = [];
    return {
      writes,
      transaction: {
        update: (ref, data) => writes.push(["update", ref._path, data]),
        delete: (ref) => writes.push(["delete", ref._path]),
      },
    };
  }
  const ref = (path) => ({ _path: path });
  const deps = {
    adminUid: "admin-1",
    serverTimestamp: () => "SERVER_TS",
    increment: (n) => ({ increment: n }),
  };

  it("makes an activity private and flags it, keeping the document", () => {
    const { writes, transaction } = recorder();
    const outcome = queueContentHide({
      transaction,
      target: { targetType: "activity", targetRef: ref("activities/a1") },
      ...deps,
    });
    expect(outcome).toBe("flagged-private");
    expect(writes).toEqual([
      [
        "update",
        "activities/a1",
        {
          flagged: true,
          flaggedBy: "admin",
          flaggedByAdminUid: "admin-1",
          flaggedAt: "SERVER_TS",
          visibility: "private",
        },
      ],
    ]);
  });

  it.each([
    ["comment", "comments/a1/items/c1", "activities/a1"],
    [
      "space_post_comment",
      "spaces/runners/posts/p1/comments/c1",
      "spaces/runners/posts/p1",
    ],
  ])(
    "deletes a %s and takes one off its parent's commentCount",
    (targetType, path, parentPath) => {
      const { writes, transaction } = recorder();
      const outcome = queueContentHide({
        transaction,
        target: {
          targetType,
          targetRef: ref(path),
          parentRef: ref(parentPath),
        },
        ...deps,
      });
      expect(outcome).toBe("deleted");
      expect(writes).toEqual([
        ["delete", path],
        ["update", parentPath, { commentCount: { increment: -1 } }],
      ]);
    }
  );

  it("deletes a space post (it has no visibility to turn off)", () => {
    const { writes, transaction } = recorder();
    expect(
      queueContentHide({
        transaction,
        target: {
          targetType: "space_post",
          targetRef: ref("spaces/runners/posts/p1"),
        },
        ...deps,
      })
    ).toBe("deleted");
    expect(writes).toEqual([["delete", "spaces/runners/posts/p1"]]);
  });

  it("refuses a profile, which has no content to hide", () => {
    const { writes, transaction } = recorder();
    expect(() =>
      queueContentHide({
        transaction,
        target: {
          targetType: "user",
          targetRef: ref("users/u1/public/profile"),
        },
        ...deps,
      })
    ).toThrow(TypeError);
    expect(writes).toEqual([]);
  });
});
