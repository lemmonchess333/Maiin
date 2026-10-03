import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { FORM_ARTWORK, getReleasedFormArtwork } from "../formArtwork";
import { getAuthoredBeats, getFormBeats } from "../bodyRig";
import { validateOwnerArtworkRelease } from "../formArtOwnerRelease";
import {
  artworkReviewExpectation,
  validateArtworkReview,
} from "../formArtReview";

const ids = ["goblet-squat", "squat", "barbell-curl"];
const sha = (bytes: string | Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
/** A set's release record, and what it must say about the set as it ships:
 *  the same expectation the audit checks every record against. */
function evidence(id: string) {
  const art = FORM_ARTWORK[id];
  return {
    review: JSON.parse(readFileSync(art.reviewFile!, "utf8")),
    expected: artworkReviewExpectation(id, art, getAuthoredBeats(id)!, {
      asset: (path) => sha(readFileSync(`public/${path}`)),
      text: sha,
    }),
  };
}

describe("owner-authorized artwork activation", () => {
  /* An explicit budget, and the reason is NOT this case's own cost —
     an earlier note here blamed "real I/O plus hashing" and that was
     measured wrong. The work is negligible: the ten guides come to 60
     frames and 3.4 MB, which hash in ~0.00s, and the whole file runs in
     ~800ms on its own.

     What it actually overruns on is worker starvation under the full
     730-file parallel suite — observed at 8.7s against the old 5s
     default and once at 32s against this 30s one, for a case doing
     ~109ms of work. So the budget absorbs SCHEDULING contention, not
     I/O, and raising it further would be treating the symptom. If this
     starts failing regularly rather than occasionally, the thing to
     look at is suite concurrency, not this number. */
  it("ships exactly three owner-authorized guides bound to source, delivered assets and cues", () => {
    expect(
      Object.keys(FORM_ARTWORK)
        .filter(
          (id) => FORM_ARTWORK[id].status === "owner-released-with-findings"
        )
        .sort()
    ).toEqual([...ids].sort());
    for (const id of ids) {
      expect(getFormBeats(id), id).toHaveLength(6);
      const { review, expected } = evidence(id);
      expect(validateOwnerArtworkRelease(review, expected), id).toEqual([]);
      // Owner permission must never masquerade as passing strict visual QA.
      expect(
        validateArtworkReview(review, expected).length,
        id
      ).toBeGreaterThan(0);
      for (const frame of review.frames)
        expect(sha(readFileSync(frame.source.path)), frame.source.path).toBe(
          frame.source.sha256
        );
    }
  }, 30_000);
  it("keeps incomplete pilots inactive", () => {
    for (const id of ["lat-pulldown", "deadlift", "incline-db-bench"])
      expect(getReleasedFormArtwork(id), id).toBeNull();
  });
  /* Every approved set, not a hand-kept list of them: a list that each
     release had to extend covered 26 of the 54. The budget is the one
     above, for the same reason: the whole library is hashed here, and
     under the full parallel suite the worker can wait for its turn. */
  it("releases every approved set as its review recorded it, with its cues live", () => {
    const approved = Object.keys(FORM_ARTWORK).filter(
      (id) => FORM_ARTWORK[id].status === "approved"
    );
    expect(approved.length).toBeGreaterThan(0);
    for (const id of approved) {
      expect(getReleasedFormArtwork(id)?.status, id).toBe("approved");
      expect(getFormBeats(id), id).toHaveLength(6);
      const { review, expected } = evidence(id);
      expect(validateArtworkReview(review, expected), id).toEqual([]);
    }
  }, 30_000);
  it("rejects missing permission, erased findings, certified checks and stale release data", () => {
    /* An owner release whose record passes as it stands. This used
       barbell-shrug, which has since been re-released under strict
       review: its record failed the owner contract before any change, so
       every case below passed without testing anything. */
    const { review, expected } = evidence("goblet-squat");
    expect(FORM_ARTWORK["goblet-squat"].status).toBe(
      "owner-released-with-findings"
    );
    expect(validateOwnerArtworkRelease(review, expected)).toEqual([]);
    for (const mutate of [
      (r: typeof review) => {
        delete r.approval;
      },
      (r: typeof review) => {
        r.findings = [];
      },
      (r: typeof review) => {
        r.checks.mobileDark.passed = true;
      },
      (r: typeof review) => {
        r.decision = "approved";
      },
      (r: typeof review) => {
        r.exerciseId = "db-curl";
      },
      (r: typeof review) => {
        r.cueSha256 = "a".repeat(64);
      },
      (r: typeof review) => {
        r.reference.sha256 = "a".repeat(64);
      },
      (r: typeof review) => {
        r.frames[2].sha256 = "a".repeat(64);
      },
      (r: typeof review) => {
        r.frames.reverse();
      },
      (r: typeof review) => {
        r.frames.pop();
      },
      (r: typeof review) => {
        delete r.frames[0].source;
      },
    ]) {
      const changed = structuredClone(review);
      mutate(changed);
      expect(
        validateOwnerArtworkRelease(changed, expected).length
      ).toBeGreaterThan(0);
    }
    for (const bad of [null, {}, [], { frames: [null] }])
      expect(validateOwnerArtworkRelease(bad, expected).length).toBeGreaterThan(
        0
      );
  });
});
