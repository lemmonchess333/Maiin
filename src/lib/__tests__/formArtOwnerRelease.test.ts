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
  it("ships no guides under owner-only approval after the final two strict reviews", () => {
    expect(
      Object.values(FORM_ARTWORK).filter(
        (art) => art.status === "owner-released-with-findings"
      )
    ).toEqual([]);
    for (const id of ["swimming", "turkish-get-up"]) {
      expect(FORM_ARTWORK[id].status, id).toBe("approved");
      expect(
        validateArtworkReview(evidence(id).review, evidence(id).expected),
        id
      ).toEqual([]);
    }
  }, 30_000);
  it("keeps draft and unregistered sets inactive", () => {
    for (const [id, art] of Object.entries(FORM_ARTWORK))
      if (art.status === "draft")
        expect(getReleasedFormArtwork(id), id).toBeNull();
    expect(getReleasedFormArtwork("not-an-exercise")).toBeNull();
  });
  /* Every approved set, not a hand-kept list of them: a list that each
     release had to extend covered 26 of the 54. The budget is the one
     above, for the same reason: the whole library is hashed here, and
     under the full parallel suite the worker can wait for its turn. */
  it("releases every approved set as its review recorded it, with its cues live", () => {
    const approved = Object.keys(FORM_ARTWORK).filter(
      (id) => FORM_ARTWORK[id].status === "approved"
    );
    expect(approved).toHaveLength(152);
    for (const id of approved) {
      expect(getReleasedFormArtwork(id)?.status, id).toBe("approved");
      expect(getFormBeats(id), id).toHaveLength(6);
      const { review, expected } = evidence(id);
      expect(validateArtworkReview(review, expected), id).toEqual([]);
    }
  }, 30_000);
  it("rejects missing permission, erased findings, certified checks and stale release data", () => {
    // The last active owner record has now passed strict review. Keep an
    // immutable historical owner fixture so negative contract cases still
    // start from a valid owner record, independently of today's activation.
    const review = JSON.parse(
      readFileSync(
        "docs/exercise-art/releases/2026-10-19-remaining33-batch1/turkish-get-up.json",
        "utf8"
      )
    );
    const expected = {
      exerciseId: "turkish-get-up",
      version: "anatomy-v3-2026-10-19-native-followup-v1",
      width: 1024,
      height: 1152,
      reference: {
        path: "form-frames/turkish-get-up/1.webp",
        sha256:
          "09af983678602258edaad79b70ef2791b8ffef99d00cabb53c81831b7d71b9c9",
      },
      cueSha256:
        "ef47e27eedd522dc2a95f35480974a7805650cdbb6dc8dff207b1ea406262925",
      frames: [
        {
          path: "form-frames/turkish-get-up/1.webp",
          sha256:
            "09af983678602258edaad79b70ef2791b8ffef99d00cabb53c81831b7d71b9c9",
        },
        {
          path: "form-frames/turkish-get-up/2.webp",
          sha256:
            "b9a49e9c834f84b06f42bc8c22b5bfc92f3beea5b9cefc3f52ce291c501a812e",
        },
        {
          path: "form-frames/turkish-get-up/3.webp",
          sha256:
            "7dd32179c3d2547a8521fb4c9161d89e81bbe80797ce47975c7f6041d79feece",
        },
        {
          path: "form-frames/turkish-get-up/4.webp",
          sha256:
            "643fc1b60c4d9f0a809bf4b134f056580992bd9e6e5c7a083fe31bf7d6e33abe",
        },
        {
          path: "form-frames/turkish-get-up/5.webp",
          sha256:
            "7e705ce5a72feefb363062c7517a692f495fc14e05129d06603e23fa071f4971",
        },
        {
          path: "form-frames/turkish-get-up/6.webp",
          sha256:
            "7f0ad1540c87d2a12bdde4442174321caa4c82dbaecc5fedf82de271a09c2b10",
        },
      ],
    };
    for (const frame of review.frames)
      expect(sha(readFileSync(frame.source.path)), frame.source.path).toBe(
        frame.source.sha256
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
