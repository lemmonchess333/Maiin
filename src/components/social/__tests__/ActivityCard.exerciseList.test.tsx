/**
 * A lift card's exercise list, as the owner read it on the feed: a
 * "4 exercises" post listing three with no sign of the fourth, a skipped
 * exercise drawn as "T-Bar Row —", and a Push day titled "Push" over the
 * tag line "Push · Arms".
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ActivityCard from "../ActivityCard";
import type { FeedItem } from "../../../hooks/useSocialFeed";
import { liftPost } from "@/lib/liftPost";
import type { WorkoutExercise } from "@/lib/savedWorkouts";

vi.mock("../../../lib/auth", () => ({
  useAuth: () => ({ user: { uid: "viewer" }, profile: null }),
}));
vi.mock("../../../lib/socialApi", () => ({
  giveHighFive: vi.fn(),
  getKudosList: vi.fn(async () => []),
  blockUser: vi.fn(),
}));
vi.mock("../../../hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => ({ isRestricted: false, loading: false }),
}));
vi.mock("../../../hooks/useBlockedUsers", () => ({
  useBlockedUsers: () => ({ addBlocked: vi.fn(), blocked: new Set() }),
}));
vi.mock("../../../hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km",
}));
// The sheet has its own suite; here it only lists what it was handed.
vi.mock("../SaveRoutineSheet", () => ({
  default: ({ exercises }: { exercises: { name: string }[] }) => (
    <ul aria-label="Routine to save">
      {exercises.map((ex) => (
        <li key={ex.name}>{ex.name}</li>
      ))}
    </ul>
  ),
}));

/** An exercise as the saved workout holds it: the sets done, or none for
 *  one left out on the day. */
const done = (
  exerciseName: string,
  exerciseId: string,
  category: string,
  sets: number,
  reps: number,
  weightKg: number
): WorkoutExercise => ({
  exerciseId,
  exerciseName,
  category,
  sets: Array.from({ length: sets }, (_, i) => ({
    setNumber: i + 1,
    reps,
    weightKg,
  })),
  plannedSetCount: 3,
  caloriesBurned: 0,
});

/** A Push day of five exercises done and one skipped, posted as the
 *  finish screen posts it. */
const PUSH_DAY = liftPost(
  { uid: "author", displayName: "Test Author" },
  {
    title: "Push — Chest Focus",
    durationMinutes: 48,
    exercises: [
      done("Bench Press", "bench-press", "horizontal_push", 3, 8, 60),
      done("Overhead Press", "overhead-press", "vertical_push", 3, 8, 35),
      done(
        "Incline Dumbbell Press",
        "incline-db-press",
        "horizontal_push",
        3,
        10,
        22
      ),
      done("Lateral Raise", "lateral-raise", "vertical_push", 0, 0, 0),
      done(
        "Rope Tricep Pushdown",
        "rope-tricep-pushdown",
        "arms_triceps",
        3,
        12,
        25
      ),
      done(
        "Overhead Tricep Extension",
        "overhead-extension",
        "arms_triceps",
        2,
        12,
        15
      ),
    ],
  },
  { visibility: "public" }
);

function feedItem(activity: Record<string, unknown>): FeedItem {
  return {
    id: "post-1",
    activityId: "post-1",
    authorId: "author",
    authorName: "Test Author",
    type: "workout",
    summary: "",
    createdAt: { toDate: () => new Date() },
    kudosCount: 0,
    activity: { authorId: "author", type: "workout", ...activity },
  } as unknown as FeedItem;
}

function renderCard(item: FeedItem, allExercises = false) {
  return render(
    <MemoryRouter>
      <ActivityCard feedItem={item} allExercises={allExercises} />
    </MemoryRouter>
  );
}

/** The figure over the stats' "exercises" (or "exercise") caption. */
const exerciseCountShown = () =>
  screen
    .getAllByText(/^exercises?$/)
    .find((el) => !el.classList.contains("sr-only"))?.previousElementSibling
    ?.textContent;

describe("a superset on a lift card (Mob1 call 2)", () => {
  it("tags the exercises done in it, and no others", () => {
    const post = liftPost(
      { uid: "author", displayName: "Test Author" },
      {
        title: "Push",
        durationMinutes: 30,
        exercises: [
          {
            ...done("Bench Press", "bench-press", "horizontal_push", 3, 8, 60),
            superset: 1,
          },
          {
            ...done("Cable Fly", "cable-fly", "horizontal_push", 3, 12, 20),
            superset: 1,
          },
          done("Overhead Press", "overhead-press", "vertical_push", 3, 8, 35),
        ],
      },
      { visibility: "public" }
    );
    renderCard(feedItem(post as unknown as Record<string, unknown>));
    expect(
      within(
        screen.getByRole("button", { name: "Compare your Bench Press" })
      ).getByText("Superset A")
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("button", { name: "Compare your Cable Fly" })
      ).getByText("Superset A")
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("button", { name: "Compare your Overhead Press" })
      ).queryByText(/^Superset/)
    ).toBeNull();
  });
});

describe("a lift card's exercise list", () => {
  it("draws three rows and one row that opens the post for the rest", () => {
    renderCard(feedItem(PUSH_DAY as unknown as Record<string, unknown>));
    for (const name of [
      "Bench Press",
      "Overhead Press",
      "Incline Dumbbell Press",
    ])
      expect(
        screen.getByRole("button", { name: `Compare your ${name}` })
      ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Compare your Rope Tricep Pushdown",
      })
    ).toBeNull();
    const more = screen.getByRole("link", { name: "+2 more exercises" });
    expect(more).toHaveAttribute("href", "/activity/post-1");
    // Five done: the skipped raise is neither drawn nor counted.
    expect(exerciseCountShown()).toBe("5");
  });

  it("lists every exercise done on the post's own page, with no more row", () => {
    renderCard(feedItem(PUSH_DAY as unknown as Record<string, unknown>), true);
    expect(
      screen.getByRole("button", {
        name: "Compare your Overhead Tricep Extension",
      })
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /^Compare your / })
    ).toHaveLength(5);
    expect(screen.queryByRole("link", { name: /more exercise/ })).toBeNull();
    expect(screen.queryByText("Lateral Raise")).toBeNull();
  });

  it("has no more row when the post has three exercises or fewer", () => {
    renderCard(
      feedItem({
        activityTitle: "Legs",
        exerciseCount: 3,
        exercises: PUSH_DAY.exercises?.slice(0, 3),
      })
    );
    expect(
      screen.getAllByRole("button", { name: /^Compare your / })
    ).toHaveLength(3);
    expect(screen.queryByRole("link", { name: /more/ })).toBeNull();
  });

  it("leaves a skipped exercise off an older post, and out of its count", () => {
    // Shared from a saved workout before every lift post was built from
    // what was done: every exercise listed, the skipped one with no sets,
    // and the workout's whole count.
    renderCard(
      feedItem({
        activityTitle: "Pull",
        exerciseCount: 4,
        exercises: [
          { name: "Lat Pulldown", sets: 2, reps: 8, weightKg: 42.5 },
          { name: "Seated Cable Row", sets: 2, reps: 10, weightKg: 40 },
          { name: "T-Bar Row", sets: 0, reps: 0, weightKg: 0 },
          { name: "Face Pull", sets: 2, reps: 15, weightKg: 15 },
        ],
      })
    );
    expect(screen.getByText("Face Pull")).toBeInTheDocument();
    expect(screen.queryByText("T-Bar Row")).toBeNull();
    expect(screen.queryByText("—")).toBeNull();
    expect(screen.queryByRole("link", { name: /more/ })).toBeNull();
    expect(exerciseCountShown()).toBe("3");
  });

  it("saves as a routine only the exercises it draws", () => {
    renderCard(
      feedItem({
        activityTitle: "Pull",
        exerciseCount: 2,
        exercises: [
          {
            name: "Lat Pulldown",
            setCount: 2,
            targetReps: 8,
            targetWeightKg: 42.5,
          },
          { name: "T-Bar Row", setCount: 0, targetReps: 0, targetWeightKg: 0 },
          {
            name: "Face Pulls",
            setCount: 2,
            targetReps: 15,
            targetWeightKg: 15,
          },
        ],
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Save as routine" }));
    const routine = screen.getByRole("list", { name: "Routine to save" });
    expect(
      within(routine)
        .getAllByRole("listitem")
        .map((li) => li.textContent)
    ).toEqual(["Lat Pulldown", "Face Pulls"]);
  });

  it("drops the tag that repeats the title", () => {
    renderCard(feedItem(PUSH_DAY as unknown as Record<string, unknown>));
    // The title is the day's type; the tag line keeps only what it adds.
    expect(screen.getAllByText("Push")).toHaveLength(1);
    expect(screen.getByText("Arms")).toBeInTheDocument();
  });

  it("compares the tag with the title whatever its case", () => {
    renderCard(
      feedItem({
        activityTitle: "legs",
        muscleGroups: ["knee_dominant", "core"],
        exercises: PUSH_DAY.exercises?.slice(0, 1),
      })
    );
    expect(screen.getByText("legs")).toBeInTheDocument();
    expect(screen.queryByText("Legs")).toBeNull();
    expect(screen.getByText("Core")).toBeInTheDocument();
  });

  it("keeps every tag on a post whose title names none of them", () => {
    const { container } = renderCard(
      feedItem({
        activityTitle: "Tuesday at the gym",
        muscleGroups: ["horizontal_push", "arms_triceps"],
        exercises: PUSH_DAY.exercises?.slice(0, 1),
      })
    );
    const line = container.querySelector("[data-meta-separator]")?.closest("p");
    expect(line).not.toBeNull();
    expect(within(line as HTMLElement).getByText("Push")).toBeInTheDocument();
    expect(within(line as HTMLElement).getByText("Arms")).toBeInTheDocument();
  });
});
