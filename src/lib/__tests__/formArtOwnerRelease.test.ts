import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { FORM_ARTWORK, getReleasedFormArtwork } from "../formArtwork";
import { getFormBeats } from "../bodyRig";
import { validateOwnerArtworkRelease } from "../formArtOwnerRelease";
import { validateArtworkReview } from "../formArtReview";

const ids = [
  "db-curl",
  "hammer-curl",
  "front-raise",
  "goblet-squat",
  "push-ups",
  "squat",
  "barbell-curl",
  "db-bench",
  "bodyweight-squat",
  "barbell-shrug",
];
const sha = (bytes: string | Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
function evidence(id: string) {
  const art = FORM_ARTWORK[id];
  const asset = (path: string) => ({
    path,
    sha256: sha(readFileSync(`public/${path}`)),
  });
  return {
    review: JSON.parse(readFileSync(art.reviewFile!, "utf8")),
    expected: {
      exerciseId: id,
      version: art.version,
      width: art.width,
      height: art.height,
      frames: art.frames.map(asset),
      reference: asset(art.reference),
      cueSha256: sha(
        JSON.stringify(
          getFormBeats(id)!.map(({ label, cue }) => ({ label, cue }))
        )
      ),
    },
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
  it("ships exactly ten complete guides bound to source, delivered assets and cues", () => {
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
  it("does not activate incomplete pilots or borrow a related exercise's artwork", () => {
    for (const id of [
      "lat-pulldown",
      "deadlift",
      "incline-db-bench",
      "concentration-curl",
    ])
      expect(getReleasedFormArtwork(id), id).toBeNull();
  });
  it("rejects missing permission, erased findings, certified checks and stale release data", () => {
    const { review, expected } = evidence("barbell-shrug");
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
