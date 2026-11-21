/**
 * The client reports exactly the targets the server validates.
 *
 * A report is a callable (createReport), and the server refuses any
 * target type or id shape it does not know (functions/lib/reportTargets.js
 * normalizeCreateReportInput). The client's half lives in two places:
 * REPORT_TARGET_TYPES (src/lib/socialApi.ts) and the id builders
 * (src/lib/reportTargetIds.ts). A mismatch would not show in either suite
 * alone: the report form would submit, and the server would answer
 * "The report request is invalid." to every report of that kind.
 *
 * So the ids the client builds are run through the server's own parser,
 * and resolved against a fake Firestore to check they name the documents
 * they mean to.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { REPORT_TARGET_TYPES } from "@/lib/socialApi";
import { REPORT_CATEGORY_OPTIONS } from "@/lib/reportCategories";
import {
  commentReportTargetId,
  spacePostCommentReportTargetId,
  spacePostReportTargetId,
} from "@/lib/reportTargetIds";

const require = createRequire(import.meta.url);
const server = require("../../../functions/lib/reportTargets.js");
const alert = require("../../../functions/lib/reportAlert.js");

/** Docs keyed by path; `doc(path).get()` reads one. */
function fakeFirestore(docs: Record<string, Record<string, unknown>>) {
  return {
    doc: (path: string) => ({
      path,
      get: async () => ({
        exists: path in docs,
        data: () => docs[path],
      }),
    }),
  };
}

describe("report targets — client and server agree", () => {
  it("the client offers exactly the server's target types", () => {
    expect([...REPORT_TARGET_TYPES]).toEqual([...server.TARGET_TYPES]);
  });

  it.each([
    ["comment", commentReportTargetId("act1", "c1")],
    ["space_post", spacePostReportTargetId("runners", "p1")],
    [
      "space_post_comment",
      spacePostCommentReportTargetId("runners", "p1", "c1"),
    ],
  ])("the server accepts a %s id the client builds", (targetType, targetId) => {
    expect(
      server.normalizeCreateReportInput({
        targetType,
        targetId,
        category: "harassment",
      })
    ).toMatchObject({ targetType, targetId });
  });

  it("a Space comment id names the comment under its post", async () => {
    const firestore = fakeFirestore({
      "spaces/runners/posts/p1": { authorId: "poster" },
      "spaces/runners/posts/p1/comments/c1": {
        authorId: "commenter",
        text: "x",
      },
    });
    const target = await server.resolveReportTarget({
      firestore,
      targetType: "space_post_comment",
      targetId: spacePostCommentReportTargetId("runners", "p1", "c1"),
    });
    expect(target.targetRef.path).toBe("spaces/runners/posts/p1/comments/c1");
    expect(target.targetUid).toBe("commenter");
  });

  it("an activity comment id names the comment under its activity", async () => {
    const firestore = fakeFirestore({
      "activities/act1": { authorId: "author", visibility: "public" },
      "comments/act1/items/c1": { authorId: "commenter", text: "x" },
    });
    const target = await server.resolveReportTarget({
      firestore,
      targetType: "comment",
      targetId: commentReportTargetId("act1", "c1"),
    });
    expect(target.targetRef.path).toBe("comments/act1/items/c1");
  });

  it("a segment is reported by its own id, and resolves to its maker", async () => {
    // The page reports the id it was opened with; the maker comes from the
    // owner record, which the reporter cannot read.
    expect(
      server.normalizeCreateReportInput({
        targetType: "segment",
        targetId: "hill",
        category: "inappropriate",
      })
    ).toMatchObject({ targetType: "segment", targetId: "hill" });
    const firestore = fakeFirestore({
      "segments/hill": { name: "Common hill" },
      "segmentOwners/hill": { uid: "maker" },
    });
    const target = await server.resolveReportTarget({
      firestore,
      reporterUid: "stranger",
      targetType: "segment",
      targetId: "hill",
    });
    expect(target.targetRef.path).toBe("segments/hill");
    expect(target.targetUid).toBe("maker");
  });

  it("the parts cannot be swapped between the two comment kinds", () => {
    // A Space comment id is not a valid activity comment id, and the other
    // way round: each kind takes exactly its own number of parts.
    expect(() =>
      server.normalizeCreateReportInput({
        targetType: "comment",
        targetId: spacePostCommentReportTargetId("runners", "p1", "c1"),
        category: "spam",
      })
    ).toThrow();
    expect(() =>
      server.normalizeCreateReportInput({
        targetType: "space_post_comment",
        targetId: commentReportTargetId("act1", "c1"),
        category: "spam",
      })
    ).toThrow();
  });
});

describe("report reasons — the form, the server and the alert email agree", () => {
  it("the form offers exactly the categories the server accepts", () => {
    expect(REPORT_CATEGORY_OPTIONS.map((c) => c.value)).toEqual([
      ...server.REPORT_CATEGORIES,
    ]);
  });

  it("the alert email names each category as the form does", () => {
    // The owner reads the reason in the email the reporter picked in the
    // form; a label written twice would drift.
    expect(
      Object.fromEntries(REPORT_CATEGORY_OPTIONS.map((c) => [c.value, c.label]))
    ).toEqual({ ...alert.CATEGORY_LABELS });
  });

  it("the server records every sub-reason the form offers, as written", () => {
    // The server keeps the reporter's words rather than a list of its own,
    // so a new sub-reason (Child safety, Copyright) is client-only, and
    // this is what holds it to the server's limit.
    for (const option of REPORT_CATEGORY_OPTIONS) {
      for (const subReason of option.subReasons) {
        expect(
          server.normalizeCreateReportInput({
            targetType: "segment",
            targetId: "hill",
            category: option.value,
            subReason,
          })
        ).toMatchObject({ category: option.value, subReason });
      }
    }
  });

  it("the alert email has a name for every kind of target", () => {
    expect(Object.keys(alert.TARGET_LABELS).sort()).toEqual(
      [...REPORT_TARGET_TYPES].sort()
    );
  });
});
