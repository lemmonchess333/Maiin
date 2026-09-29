// @vitest-environment jsdom — needs DOM/storage APIs; the rest of this directory runs in the fast node environment (audit batch 2).
/**
 * The saved sharing default: what the finish screen reads from the
 * account's answers, what answering its one question saves, and how a
 * device's own answers (saved before answers were kept on the account)
 * move there. Where the answer lives, end to end, is
 * `shareDefaultsAccount.test.tsx`.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  savedShareDefault,
  answerShareQuestion,
  finishShareStart,
  readDeviceShareDefaults,
  shareDefaultsToMove,
  withDeviceShareDefaults,
  forgetDeviceShareDefaults,
  restoreDeviceShareDefaults,
  type ShareDefault,
  type ShareDefaults,
} from "../shareDefaults";

// Device answers are uid-scoped (audit F9). Tests use a single signed-in uid
// unless they specifically exercise the cross-account isolation.
const UID = "u1";

/** A device answer saved the way the pre-account build saved it. */
function deviceAnswer(uid: string, type: "run" | "workout", value: string) {
  localStorage.setItem(`tropos.share.always.${uid}.${type}`, value);
}

function deviceKeys(): string[] {
  return Object.keys(localStorage)
    .filter((k) => k.startsWith("tropos.share.always"))
    .sort();
}

beforeEach(() => {
  localStorage.clear();
});

describe("savedShareDefault — the account's answer, as the finish screen reads it", function () {
  it("is the stored answer", function () {
    for (const answer of ["followers", "public", "never"] as const) {
      expect(savedShareDefault({ run: answer }, "run")).toBe(answer);
    }
  });

  it("is null (ask) when never answered, cleared, or unreadable", function () {
    expect(savedShareDefault(undefined, "run")).toBeNull();
    expect(savedShareDefault(null, "run")).toBeNull();
    expect(savedShareDefault({}, "run")).toBeNull();
    expect(savedShareDefault({ run: null }, "run")).toBeNull();
    expect(
      savedShareDefault({ run: "crews" } as unknown as ShareDefaults, "run")
    ).toBeNull();
    expect(
      savedShareDefault("public" as unknown as ShareDefaults, "run")
    ).toBeNull();
  });

  it("reads one type without the other", function () {
    const saved: ShareDefaults = { run: "never", workout: "public" };
    expect(savedShareDefault(saved, "run")).toBe("never");
    expect(savedShareDefault(saved, "workout")).toBe("public");
  });
});

describe("finishShareStart — what the finish screen does on save", function () {
  it("asks when no default is saved", function () {
    expect(finishShareStart(null, false)).toEqual({ kind: "ask" });
    expect(finishShareStart(null, true)).toEqual({ kind: "ask" });
  });

  it("posts with the saved audience, with no sheet", function () {
    expect(finishShareStart("followers", false)).toEqual({
      kind: "post",
      visibility: "followers",
    });
    expect(finishShareStart("public", false)).toEqual({
      kind: "post",
      visibility: "public",
    });
  });

  it("holds on 'never'", function () {
    expect(finishShareStart("never", false)).toEqual({
      kind: "hold",
      reason: "never",
    });
    expect(finishShareStart("never", true)).toEqual({
      kind: "hold",
      reason: "never",
    });
  });

  it("never posts for an account the rules will refuse (unverified email)", function () {
    for (const saved of ["followers", "public"] as const) {
      expect(finishShareStart(saved, true)).toEqual({
        kind: "hold",
        reason: "verify",
      });
    }
  });
});

describe("answerShareQuestion — the one question, asked once", function () {
  it("answers for runs and workouts together when neither has a default", function () {
    expect(answerShareQuestion(undefined, "workout", "followers")).toEqual({
      run: "followers",
      workout: "followers",
    });
  });

  it("never overwrites a default the user already chose for the other type", function () {
    expect(answerShareQuestion({ run: "never" }, "workout", "public")).toEqual({
      workout: "public",
    });
  });

  it("treats a cleared type ('Ask') as having no answer", function () {
    expect(
      answerShareQuestion({ run: null, workout: null }, "run", "never")
    ).toEqual({ run: "never", workout: "never" });
  });

  it("always answers the type it asked about", function () {
    expect(
      answerShareQuestion(
        { run: "followers", workout: "never" },
        "run",
        "public"
      )
    ).toEqual({ run: "public" });
  });

  it("'Don't share' saves never, so the question is not asked again", function () {
    const answers = answerShareQuestion(undefined, "run", "never");
    expect(finishShareStart(savedShareDefault(answers, "run"), false)).toEqual({
      kind: "hold",
      reason: "never",
    });
    expect(
      finishShareStart(savedShareDefault(answers, "workout"), false)
    ).toEqual({ kind: "hold", reason: "never" });
  });
});

describe("answers saved on this device", function () {
  it("reads this account's answers, and never another account's", function () {
    deviceAnswer(UID, "run", "public");
    deviceAnswer("someone-else", "workout", "never");
    expect(readDeviceShareDefaults(UID)).toEqual({ run: "public" });
    expect(readDeviceShareDefaults("someone-else")).toEqual({
      workout: "never",
    });
  });

  it("reads a legacy 'crews' answer as followers (crews retirement)", function () {
    // The retired 'crews' audience was the followers fan-out plus a crewId
    // tag; an answer saved with it falls back to its underlying fan-out
    // rather than silently clearing.
    deviceAnswer(UID, "run", "crews");
    expect(readDeviceShareDefaults(UID)).toEqual({ run: "followers" });
  });

  it("ignores anything that is not an answer", function () {
    deviceAnswer(UID, "run", "ask");
    deviceAnswer(UID, "workout", "");
    expect(readDeviceShareDefaults(UID)).toEqual({});
  });

  it("purges the pre-uid-scoping global key without attributing it to anyone", function () {
    localStorage.setItem("tropos.share.always.run", "public");
    expect(readDeviceShareDefaults(UID)).toEqual({});
    expect(localStorage.getItem("tropos.share.always.run")).toBeNull();
  });

  it("forgets the named types for this account only, and says what it removed", function () {
    deviceAnswer(UID, "run", "never");
    deviceAnswer(UID, "workout", "public");
    deviceAnswer("someone-else", "run", "public");
    expect(forgetDeviceShareDefaults(UID, ["run"])).toEqual({ run: "never" });
    expect(deviceKeys()).toEqual([
      "tropos.share.always.someone-else.run",
      `tropos.share.always.${UID}.workout`,
    ]);
  });

  it("restores what it removed", function () {
    deviceAnswer(UID, "run", "never");
    const removed = forgetDeviceShareDefaults(UID, ["run", "workout"]);
    expect(readDeviceShareDefaults(UID)).toEqual({});
    restoreDeviceShareDefaults(UID, removed);
    expect(readDeviceShareDefaults(UID)).toEqual({ run: "never" });
  });
});

/**
 * The move's privacy rule, in full. Most private first: "never", no answer
 * (asks, posts nothing on its own), followers, public. For each type this
 * device answered, the account ends up with the more private of the two;
 * a type the account never answered takes the device's answer.
 */
describe("shareDefaultsToMove — the more private answer wins", function () {
  const ANSWERS: ShareDefault[] = ["never", "followers", "public"];

  it("moves a device answer the account does not have", function () {
    for (const answer of ANSWERS) {
      expect(shareDefaultsToMove(undefined, { run: answer })).toEqual({
        run: answer,
      });
      expect(shareDefaultsToMove({}, { workout: answer })).toEqual({
        workout: answer,
      });
      expect(shareDefaultsToMove(null, { run: answer })).toEqual({
        run: answer,
      });
    }
  });

  it("keeps the account's answer when the device's is less private", function () {
    expect(shareDefaultsToMove({ run: "never" }, { run: "public" })).toEqual(
      {}
    );
    expect(shareDefaultsToMove({ run: "never" }, { run: "followers" })).toEqual(
      {}
    );
    expect(
      shareDefaultsToMove({ run: "followers" }, { run: "public" })
    ).toEqual({});
    // A cleared answer ("Ask") posts nothing on its own: more private than
    // either audience.
    expect(shareDefaultsToMove({ run: null }, { run: "public" })).toEqual({});
    expect(shareDefaultsToMove({ run: null }, { run: "followers" })).toEqual(
      {}
    );
  });

  it("moves the device's answer when it is more private", function () {
    expect(shareDefaultsToMove({ run: "public" }, { run: "never" })).toEqual({
      run: "never",
    });
    expect(
      shareDefaultsToMove({ run: "public" }, { run: "followers" })
    ).toEqual({ run: "followers" });
    expect(shareDefaultsToMove({ run: "followers" }, { run: "never" })).toEqual(
      { run: "never" }
    );
    expect(shareDefaultsToMove({ run: null }, { run: "never" })).toEqual({
      run: "never",
    });
  });

  it("moves nothing when the answers agree", function () {
    for (const answer of ANSWERS) {
      expect(shareDefaultsToMove({ run: answer }, { run: answer })).toEqual({});
    }
  });

  it("decides each type on its own", function () {
    expect(
      shareDefaultsToMove(
        { run: "never", workout: "public" },
        { run: "public", workout: "never" }
      )
    ).toEqual({ workout: "never" });
  });

  it("treats an unreadable account value as no answer", function () {
    expect(
      shareDefaultsToMove({ run: "crews" } as unknown as ShareDefaults, {
        run: "public",
      })
    ).toEqual({ run: "public" });
  });
});

describe("withDeviceShareDefaults — a profile loaded before the move", function () {
  it("is the account's answers, untouched, when this device has none", function () {
    const account: ShareDefaults = { run: "public" };
    expect(withDeviceShareDefaults(UID, account)).toBe(account);
    expect(withDeviceShareDefaults(UID, undefined)).toBeUndefined();
  });

  it("applies this device's answers on the same terms as the move", function () {
    deviceAnswer(UID, "run", "never");
    deviceAnswer(UID, "workout", "public");
    expect(
      withDeviceShareDefaults(UID, { run: "public", workout: "never" })
    ).toEqual({ run: "never", workout: "never" });
  });

  it("keeps the account's answer for the other type", function () {
    deviceAnswer(UID, "run", "followers");
    expect(withDeviceShareDefaults(UID, { workout: null })).toEqual({
      run: "followers",
      workout: null,
    });
  });

  it("never applies another account's answers", function () {
    deviceAnswer("someone-else", "run", "never");
    expect(withDeviceShareDefaults(UID, { run: "public" })).toEqual({
      run: "public",
    });
  });
});
