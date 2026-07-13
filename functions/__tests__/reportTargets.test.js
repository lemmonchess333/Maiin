import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  normalizeCreateReportInput,
  resolveReportTarget,
  isReportTargetError,
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
