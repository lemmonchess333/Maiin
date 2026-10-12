/**
 * The weeks ahead on a race plan's card (R23): a closed disclosure that,
 * opened, lists the plan's coming weeks a row each, by the week's Monday,
 * with the long run and quality sessions named, the race last, and one line
 * saying it is the plan as it stands. Nothing for a free runner, or once the
 * race is this week. What each week holds is `raceWeeksAhead`'s, pinned in
 * its own suites; this pins what Train shows of it.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import RaceWeeksAhead from "../RaceWeeksAhead";
import { buildOnboardingPlan } from "@/lib/onboardingPlan";
import type { OnboardingDraft } from "@/lib/onboardingDraft";
import type { UserProfile } from "@/lib/auth";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { formatDayMonth } from "@/utils/formatters";
import {
  normalizeProgramState,
  type ProgramState,
} from "@/features/program/programTypes";
import { migrateProgramState } from "@/features/program/migrations";

const TODAY = localDateString(new Date());
const MONDAY = localWeekKey(parseLocalDate(TODAY));
const shift = (date: string, days: number) =>
  localDateString(addLocalDays(parseLocalDate(date), days));

const draft: OnboardingDraft = {
  step: 7,
  primaryGoal: "general",
  daysPerWeek: 3,
  equipment: "full_gym",
  runFrequency: "regular",
  runMode: "race_prep",
  weeklyRunDays: 4,
  raceDistance: "half",
  raceTargetDate: "",
  injuries: ["none"],
  gender: "female",
  ageRange: "25-34",
  heightCm: 168,
  weightKg: 62,
  heightUnit: "cm",
  weightUnit: "kg",
  trainingWhy: "",
  experience: "intermediate",
};

/** A race plan saved this Monday, its race on the Sunday `weeksOut` weeks
 *  after this one. */
function racePlan(answers: Partial<OnboardingDraft> & { weeksOut: number }): {
  profile: UserProfile;
  programState: ProgramState;
} {
  const { weeksOut, ...rest } = answers;
  const plan = buildOnboardingPlan(
    { ...draft, ...rest, raceTargetDate: shift(MONDAY, weeksOut * 7 + 6) },
    "recomp",
    MONDAY
  );
  return {
    profile: { uid: "u", ...plan.profileUpdates } as unknown as UserProfile,
    programState: migrateProgramState(
      normalizeProgramState(plan.programState),
      MONDAY
    ),
  };
}

function show(plan: { profile: UserProfile; programState: ProgramState }) {
  return render(<RaceWeeksAhead {...plan} recentLayoff="none" today={TODAY} />);
}

async function open() {
  fireEvent.click(screen.getByText("The weeks ahead"));
  return screen.findByRole("list", { name: "The weeks ahead" });
}

describe("RaceWeeksAhead", () => {
  it("opens closed, with nothing worked out until it is opened", () => {
    show(racePlan({ weeksOut: 12 }));
    const disclosure = screen.getByText("The weeks ahead").closest("details")!;
    expect(disclosure).not.toHaveAttribute("open");
    expect(
      screen.queryByRole("list", { name: "The weeks ahead" })
    ).not.toBeInTheDocument();
  });

  it("lists every week from next week to race week, the race last", async () => {
    show(racePlan({ weeksOut: 12 }));
    const list = await open();
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(12);
    rows.forEach((row, i) => {
      expect(row).toHaveTextContent(
        `Week of ${formatDayMonth(parseLocalDate(shift(MONDAY, 7 * (i + 1))))}`
      );
    });
    expect(rows.at(-1)).toHaveTextContent("Half Marathon Race");
    // The first week holds its long run, by the name Train gives it.
    expect(rows[0]).toHaveTextContent(/Long \d+K/);
  });

  it("says it is the plan as it stands", async () => {
    show(racePlan({ weeksOut: 12 }));
    await open();
    expect(
      screen.getByText(
        "The plan as it stands today. Each week is set when it starts, from what you've run."
      )
    ).toBeVisible();
  });

  it("names lighter weeks and no phase, and lists no easy run", async () => {
    show(racePlan({ weeksOut: 12 }));
    const list = await open();
    expect(within(list).getAllByText(/Lighter week/).length).toBeGreaterThan(0);
    // Base, build and peak stay unnamed on a new surface (E3a, Run9f).
    expect(list).not.toHaveTextContent(/\b(Base|Build|Peak)\b/i);
    // An easy run, strides or a medium-long is the day to day.
    expect(list).not.toHaveTextContent(/Easy \d|strides|Medium-long/);
  });

  it("shows numbers in the numeral font", async () => {
    show(racePlan({ weeksOut: 12 }));
    const list = await open();
    const first = within(list).getAllByRole("listitem")[0];
    const numerals = Array.from(first.querySelectorAll(".font-mono"));
    expect(numerals.length).toBeGreaterThan(1);
    expect(numerals.every((n) => n.classList.contains("tabular-nums"))).toBe(
      true
    );
  });

  it("is not there without a race plan, or once the race is this week", () => {
    const { container: free } = show(
      racePlan({ runMode: "freeform", weeksOut: 12 })
    );
    expect(free).toBeEmptyDOMElement();
    const { container: raceWeek } = show(racePlan({ weeksOut: 0 }));
    expect(raceWeek).toBeEmptyDOMElement();
    // Anchor: the same card has its weeks a race further out.
    show(racePlan({ weeksOut: 1 }));
    expect(screen.getByText("The weeks ahead")).toBeInTheDocument();
  });
});
