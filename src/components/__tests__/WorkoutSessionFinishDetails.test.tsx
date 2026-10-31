/**
 * The finish screen's details, through the real session screen: when the
 * session started, which the lifter can say was earlier (Mob2 call 12,
 * Lift3 STATUS), and an empty workout's name (Mob2 call 11). The saved
 * workout is dated by the start (`liftSessionDay`), so what the screen
 * hands the writer is the stated start.
 */
import { resetFirestore } from "@/test/firestoreHarness";
vi.mock("@/components/WeekPulseCard", () => ({ default: () => null }));
vi.mock("@/components/workout/SessionShareRow", () => ({
  default: () => null,
}));
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProgramExercise } from "@/features/program/programTypes";
import type { ComponentProps } from "react";
import type { LiftCompletionReceipt } from "@/lib/liftCompletion";
import { liftSessionDay } from "@/lib/liftCompletion";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { restoreRealTimers } from "@/test/fakeTimers";

const DAY = 86_400_000;
const h = vi.hoisted(() => ({
  load: vi.fn(() => null),
  save: vi.fn(),
  clear: vi.fn(),
  joined: 0,
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: null,
    profile: { createdAt: { toMillis: () => h.joined } },
  }),
  useUidForStorageKey: () => "test",
}));
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: null },
}));
vi.mock("firebase/firestore");
vi.mock("@/features/streaks/useStreaks", () => ({
  useStreaks: () => ({
    awardEventBadge: vi.fn(),
    awardEventBadges: vi.fn(),
  }),
}));
vi.mock("@/hooks/useWorkoutDraft", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useWorkoutDraft")>()),
  useWorkoutDraft: () => ({ load: h.load, save: h.save, clear: h.clear }),
  computeDraftIdentity: () => "test",
  createWorkoutCompletionId: () => "test",
}));
vi.mock("@/hooks/RemindersProvider", () => ({
  useStreakReminder: () => ({
    prefs: { enabled: false },
    loading: false,
    updatePrefs: vi.fn(),
    requestPermission: vi.fn(),
  }),
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));
vi.mock("@/components/workout/PlateCalculatorSheet", () => ({
  default: () => null,
}));
vi.mock("@/lib/restTimerNotification", () => ({
  restNotificationDelaySeconds: () => 0,
  scheduleRestEndNotification: vi.fn(),
  cancelRestEndNotification: vi.fn(),
}));
import WorkoutSession from "../WorkoutSession";
import { WORKOUT } from "@/test/journeyScreens";
import { emptyWorkoutDraftScope } from "@/features/program/emptyWorkout";

type CompleteDay = ComponentProps<typeof WorkoutSession>["onCompleteDay"];
const receipt = (): LiftCompletionReceipt => ({
  workoutId: "programme-test",
  share: {
    uid: "test",
    type: "workout",
    source: { kind: "workout", id: "programme-test" },
    post: async () => ({ status: "declined" }),
  },
  syncStatus: "synced",
  sync: Promise.resolve("synced"),
});

const CURL = {
  exerciseId: "bicep-curl",
  name: "Bicep Curl",
  instanceId: "curl-1",
  sets: 1,
  reps: 10,
  weight: 10,
  restSeconds: 0,
} as ProgramExercise;

/** A one-set session, its set done, on its finish screen. */
async function finishedSession(draftScope?: string) {
  const complete = vi.fn<CompleteDay>(async () => receipt());
  render(
    <WorkoutSession
      day={{
        dayName: "Arms",
        dayType: "upper",
        completed: false,
        exercises: [CURL],
      }}
      dayIndex={0}
      draftScope={draftScope}
      onCompleteDay={complete}
      onClose={vi.fn()}
    />
  );
  for (let guard = 0; guard < 6; guard++) {
    const open = screen.queryAllByRole("button", { name: WORKOUT.markSet });
    if (open.length === 0) break;
    fireEvent.click(open[0]);
  }
  await screen.findByRole("button", { name: WORKOUT.save });
  return complete;
}

const startedRow = () => screen.getByRole("button", { name: /^Started: / });
async function openStart() {
  fireEvent.click(startedRow());
  return screen.findByRole("dialog", { name: "When you started" });
}
const dayChoices = (sheet: HTMLElement) =>
  within(sheet)
    .getAllByRole("option")
    .filter((option) => option.closest("select")?.id.endsWith("-day"))
    .map((option) => (option as HTMLOptionElement).value);

/** Today at noon, as the clock has it: every window here is drawn from
 *  the day the run is on. */
const noon = () => {
  const at = parseLocalDate(localDateString(new Date()));
  at.setHours(12, 0, 0, 0);
  return at.getTime();
};

beforeEach(() => {
  vi.clearAllMocks();
  resetFirestore();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(noon());
  h.joined = Date.now() - 30 * DAY;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(async () => {
  cleanup();
  await restoreRealTimers();
  vi.unstubAllGlobals();
});

describe("when the session started", () => {
  it("shows the start, and a stated earlier one is what the workout is saved with", async () => {
    const complete = await finishedSession("routine:r1");
    expect(startedRow()).toHaveAccessibleName("Started: Today · 12:00. Change");
    const sheet = await openStart();
    fireEvent.change(within(sheet).getByLabelText("Day"), {
      target: {
        value: localDateString(addLocalDays(new Date(), -1)),
      },
    });
    fireEvent.change(within(sheet).getByLabelText("Hour"), {
      target: { value: "18" },
    });
    fireEvent.change(within(sheet).getByLabelText("Minute"), {
      target: { value: "30" },
    });
    fireEvent.click(
      within(sheet).getByRole("button", { name: "Save start time" })
    );
    await vi.waitFor(() =>
      expect(startedRow()).toHaveAccessibleName(
        "Started: Yesterday · 18:30. Change"
      )
    );
    fireEvent.click(screen.getByRole("button", { name: WORKOUT.save }));
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    const { startedAt } = complete.mock.calls[0][1];
    expect(new Date(startedAt!).getHours()).toBe(18);
    expect(new Date(startedAt!).getMinutes()).toBe(30);
    expect(liftSessionDay(startedAt)).toBe(
      localDateString(addLocalDays(new Date(), -1))
    );
  });

  it("is never later than now", async () => {
    await finishedSession("routine:r1");
    const sheet = await openStart();
    fireEvent.change(within(sheet).getByLabelText("Hour"), {
      target: { value: "13" },
    });
    expect(within(sheet).getByRole("alert")).toHaveTextContent(
      "That's later than now."
    );
    expect(
      within(sheet).getByRole("button", { name: "Save start time" })
    ).toBeDisabled();
  });

  it("goes back as far as the account for a routine, never before it", async () => {
    const joined = addLocalDays(new Date(), -3);
    joined.setHours(14, 0, 0, 0);
    h.joined = joined.getTime();
    await finishedSession("routine:r1");
    const sheet = await openStart();
    const days = dayChoices(sheet);
    expect(days).toHaveLength(4);
    expect(days.at(-1)).toBe(localDateString(new Date(h.joined)));
    fireEvent.change(within(sheet).getByLabelText("Day"), {
      target: { value: days.at(-1) },
    });
    fireEvent.change(within(sheet).getByLabelText("Hour"), {
      target: { value: "9" },
    });
    expect(within(sheet).getByRole("alert")).toHaveTextContent(
      "The earliest that day is 14:00."
    );
  });

  it("keeps a programme day in the plan's week", async () => {
    await finishedSession();
    const sheet = await openStart();
    const days = dayChoices(sheet);
    const monday = localWeekKey(new Date());
    expect(days.at(-1)).toBe(monday);
    expect(days).toHaveLength(
      Math.round(
        (parseLocalDate(localDateString(new Date())).getTime() -
          parseLocalDate(monday).getTime()) /
          DAY
      ) + 1
    );
  });
});

describe("an empty workout's name", () => {
  it("is given on the finish screen and saved with it", async () => {
    const complete = await finishedSession(emptyWorkoutDraftScope("s1"));
    const row = screen.getByRole("button", { name: /^Name: / });
    expect(row).toHaveAccessibleName("Name: Arms. Rename");
    fireEvent.click(row);
    const sheet = await screen.findByRole("dialog", {
      name: "Name this workout",
    });
    fireEvent.change(within(sheet).getByLabelText("Name"), {
      target: { value: "  Hotel   gym " },
    });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save name" }));
    await vi.waitFor(() =>
      expect(
        screen.getByRole("button", { name: /^Name: / })
      ).toHaveAccessibleName("Name: Hotel gym. Rename")
    );
    fireEvent.click(screen.getByRole("button", { name: WORKOUT.save }));
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(complete.mock.calls[0][1].prescription?.dayName).toBe("Hotel gym");
  });

  it("is a question for an empty workout only", async () => {
    await finishedSession("routine:r1");
    expect(screen.queryByRole("button", { name: /^Name: / })).toBeNull();
  });
});
