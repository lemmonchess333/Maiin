/**
 * App1 Q62: a reminder ignored three times running goes quiet, and Home
 * says so once. The phone's rules (`reminderAttention.ts`).
 */
import { describe, expect, it } from "vitest";
import {
  IGNORED_LIMIT,
  countReminderFires,
  pushReminderKind,
  pushRemindersToAnswer,
  quietMessage,
  quietToShow,
  type AttentionCount,
} from "../reminderAttention";

const at = (day: number, hour: number) =>
  new Date(2026, 10, day, hour, 0).getTime();
const empty: AttentionCount = { ignored: {}, counted: {}, tapped: {} };

describe("a push answered by opening the app", () => {
  it("answers one sent earlier today that nothing has answered", () => {
    const now = at(12, 21);
    expect(pushRemindersToAnswer({ streakSentAt: at(12, 20) }, now)).toEqual([
      "streak",
    ]);
    // Already answered, or answered after it.
    expect(
      pushRemindersToAnswer(
        { streakSentAt: at(12, 20), streakAnsweredAt: at(12, 20) + 1 },
        now
      )
    ).toEqual([]);
    // Answered before it: an older push's answer.
    expect(
      pushRemindersToAnswer(
        { reviewSentAt: at(12, 9), reviewAnsweredAt: at(11, 9) },
        now
      )
    ).toEqual(["review"]);
  });

  it("does not answer one from another day, or none at all", () => {
    expect(
      pushRemindersToAnswer({ streakSentAt: at(11, 20) }, at(12, 9))
    ).toEqual([]);
    expect(pushRemindersToAnswer(null, at(12, 9))).toEqual([]);
    expect(pushRemindersToAnswer({ streakSentAt: null }, at(12, 9))).toEqual(
      []
    );
  });

  it("knows which pushes are reminders", () => {
    expect(pushReminderKind("streak")).toBe("streak");
    expect(pushReminderKind("recap")).toBe("review");
    expect(pushReminderKind("fellbehind")).toBe("review");
    for (const type of ["badge", "challenges", "comment", undefined])
      expect(pushReminderKind(type)).toBeNull();
  });
});

describe("the phone's count", () => {
  it("counts a day's fires as one occasion, answered by the app opening that day", () => {
    const fires = [
      { kind: "meals" as const, at: at(10, 8), seen: at(11, 9) },
      { kind: "meals" as const, at: at(10, 12), seen: at(11, 9) },
      { kind: "meals" as const, at: at(10, 18), seen: at(11, 9) },
    ];
    expect(countReminderFires(empty, fires)).toEqual({
      count: {
        ignored: { meals: 1 },
        counted: { meals: "2026-11-10" },
        tapped: {},
      },
      quiet: [],
    });
    // Seen the same day: answered.
    const seenSameDay = fires.map((fire) => ({ ...fire, seen: at(10, 19) }));
    expect(countReminderFires(empty, seenSameDay).count.ignored).toEqual({
      meals: 0,
    });
  });

  it("goes quiet on the third occasion ignored running, and starts again", () => {
    const fires = [10, 11, 12].map((day) => ({
      kind: "training" as const,
      at: at(day, 7),
      seen: at(14, 9),
    }));
    const { count, quiet } = countReminderFires(empty, fires);
    expect(IGNORED_LIMIT).toBe(3);
    expect(quiet).toEqual(["training"]);
    expect(count.ignored.training).toBe(0);
  });

  it("an answer in between resets the run", () => {
    const fires = [
      { kind: "streak" as const, at: at(10, 20), seen: at(12, 9) },
      { kind: "streak" as const, at: at(11, 20), seen: at(11, 21) },
      { kind: "streak" as const, at: at(12, 20), seen: at(14, 9) },
      { kind: "streak" as const, at: at(13, 20), seen: at(14, 9) },
    ];
    const { count, quiet } = countReminderFires(
      { ...empty, ignored: { streak: 1 } },
      fires
    );
    expect(quiet).toEqual([]);
    expect(count.ignored.streak).toBe(2);
  });

  it("a tap after it is an answer, even past midnight", () => {
    const fires = [
      { kind: "streak" as const, at: at(10, 21), seen: at(11, 9) },
    ];
    expect(
      countReminderFires(
        { ...empty, tapped: { streak: at(11, 0) + 600_000 } },
        fires
      ).count.ignored.streak
    ).toBe(0);
  });

  it("never counts a day twice", () => {
    const first = countReminderFires(empty, [
      { kind: "meals", at: at(10, 8), seen: at(11, 9) },
    ]);
    const again = countReminderFires(first.count, [
      { kind: "meals", at: at(10, 18), seen: at(12, 9) },
    ]);
    expect(again.count.ignored.meals).toBe(1);
  });
});

describe("what Home says", () => {
  it("names what stopped, why, and where to turn it back on", () => {
    expect(quietMessage(["streak"])).toEqual({
      title: "Streak reminders are off",
      body: "The last 3 went unopened, so we stopped them. Turn them back on in Settings.",
    });
    expect(quietMessage(["training", "meals"])?.title).toBe(
      "Meal and workout reminders are off"
    );
    expect(quietMessage(["streak", "review", "meals"])?.title).toBe(
      "Meal, weekly review and streak reminders are off"
    );
    expect(quietMessage([])).toBeNull();
  });

  it("says it once: a kind marked shown is not said again", () => {
    expect(
      quietToShow({
        streakQuietAt: at(12, 20),
        streakQuietShown: false,
        mealsQuietAt: at(11, 9),
        mealsQuietShown: true,
      })
    ).toEqual(["streak"]);
    expect(quietToShow({})).toEqual([]);
  });
});
