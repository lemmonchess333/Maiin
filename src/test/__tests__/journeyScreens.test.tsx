/**
 * The journeys' screen names (`src/test/journeyScreens.ts`) against the
 * components that draw them: Train's exercise lines and the tab bar here;
 * setup's names in `Onboarding.test.tsx`, the offer's in `Upgrade.test.tsx`
 * and the workout screen's in `WorkoutSessionCompletion.test.tsx`.
 *
 * A journey runs for minutes in its own CI job. A renamed button or a
 * reworded line should fail here, in seconds, on the PR that changed it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import BottomNavigation from "@/components/BottomNavigation";
import { HomeTabIcon } from "@/components/icons/TabIcons";
import ExerciseRowSummary from "@/components/program/ExerciseRowSummary";
import SessionCommandCard from "@/components/program/SessionCommandCard";
import { HOME, TABS, WORKOUT, trainRowText } from "../journeyScreens";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/preloadTab", () => ({ preloadTab: vi.fn() }));
vi.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: () => true }));

afterEach(cleanup);

type RowExercise = Parameters<typeof ExerciseRowSummary>[0]["exercise"];

function exercise(over: Partial<RowExercise>): RowExercise {
  return {
    exerciseId: "bench-press",
    name: "Bench Press",
    sets: 3,
    reps: 5,
    weight: 100,
    ...over,
  } as RowExercise;
}

/**
 * Text as Playwright's `getByText(words, { exact: true })` reads it: an
 * element's whole text, spaces collapsed, on the smallest element that
 * holds it. Testing Library's own matcher reads an element's text nodes
 * only, so a line split over spans never matches there.
 */
function playwrightText(words: string) {
  const read = (node: Element | null) =>
    (node?.textContent ?? "").replace(/\s+/g, " ").trim();
  return (_: string, element: Element | null) =>
    read(element) === words &&
    !Array.from(element?.children ?? []).some((child) => read(child) === words);
}

describe("Train's line for each exercise, as the journeys read it", () => {
  const cases: [string, RowExercise, string][] = [
    ["a loaded lift", exercise({}), "3 sets × 5 reps · 100 kg"],
    [
      "a rep range",
      exercise({
        reps: 8,
        baseReps: 8,
        repRangeMax: 12,
        progressionType: "double",
        weight: 60,
      }),
      "3 sets × 8–12 reps · 60 kg",
    ],
    [
      "a bodyweight lift, with no weight",
      exercise({
        exerciseId: "pull-ups",
        name: "Pull-ups",
        reps: 8,
        weight: 0,
      }),
      "3 sets × 8 reps",
    ],
    [
      "a timed hold",
      exercise({
        exerciseId: "plank",
        name: "Plank",
        reps: 30,
        repUnit: "seconds",
        weight: 0,
      }),
      "3 sets × 30s",
    ],
  ];
  for (const [what, row, words] of cases) {
    it(`${what}: "${words}"`, () => {
      expect(trainRowText(row)).toBe(words);
      render(<ExerciseRowSummary exercise={row} />);
      expect(screen.getByText(playwrightText(words))).toBeInTheDocument();
    });
  }
});

describe("the tab bar the journeys move by", () => {
  /** The app's tabs, read out of `Layout.tsx`, where they are drawn from. */
  function layoutTabs(): { to: string; label: string }[] {
    const layout = readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        "../../components/Layout.tsx"
      ),
      "utf8"
    );
    const list = layout.match(/const tabs: [^=]+= \[([\s\S]*?)\];/)?.[1];
    if (!list)
      throw new Error(
        "could not find the tab list in Layout.tsx: if it moved, point this at it rather than deleting the check"
      );
    return [
      ...list.matchAll(/\{ to: "([^"]+)", icon: \w+, label: "([^"]+)" \}/g),
    ].map(([, to, label]) => ({ to, label }));
  }

  it("names each of the app's tabs, and only those", () => {
    const tabs = layoutTabs();
    const { navigation, ...names } = TABS;
    expect(tabs.map((tab) => tab.label).sort()).toEqual(
      Object.values(names).sort()
    );
    render(
      <MemoryRouter>
        <BottomNavigation
          tabs={tabs.map((tab) => ({ ...tab, icon: HomeTabIcon }))}
          pathname="/"
          unreadCount={0}
          onSocialVisit={() => {}}
        />
      </MemoryRouter>
    );
    const bar = screen.getByRole("navigation", { name: navigation });
    for (const name of Object.values(names))
      expect(within(bar).getByRole("link", { name })).toBeInTheDocument();
  });
});

describe("Train's start, as the journeys press it", () => {
  it("the startable day's card is started by its name", () => {
    // Train hands the card its label (`Program.tsx`), and the card makes it
    // the button's name.
    const program = readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        "../../pages/Program.tsx"
      ),
      "utf8"
    );
    expect(program).toContain(`? "${WORKOUT.start}"`);
    const start = vi.fn();
    render(
      <SessionCommandCard
        sport="lift"
        eyebrow="Up next"
        title="Full Body"
        description="Squat focus"
        meta={["5 lifts"]}
        primaryActionLabel={WORKOUT.start}
        onPrimaryAction={start}
      />
    );
    screen.getByRole("button", { name: WORKOUT.start }).click();
    expect(start).toHaveBeenCalledTimes(1);
  });
});

describe("Home, where setup lands", () => {
  it("is titled as the journeys wait for it", () => {
    const home = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../../pages/Home.tsx"),
      "utf8"
    );
    expect(home).toContain(`title="${HOME.heading}"`);
  });
});
