/**
 * The weeks ahead of a plan with no race date (Run24 (3), D7), on its card
 * on Train: a closed disclosure that, opened, lists the next twelve weeks a
 * row each, as a race plan's are listed (by Monday, "Lighter week" on the
 * one in four that steps back, the long run and the sessions by name), and
 * one line saying where the long run holds. What each week holds is
 * `rollingWeeksAhead`'s, pinned to the rollover in its own suite; this pins
 * what Train shows of it.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import RollingWeeksAhead from "../RollingWeeksAhead";
import RollingPlanCard from "../RollingPlanCard";
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
import { rollingWeeksAhead } from "@/features/program/rollingWeeksAhead";
import type { RollingGoal } from "@/features/program/rollingPlan";
import {
  rollingRunPlan,
  rollingWeeksFrom,
} from "@/features/program/rollingWeek";

const TODAY = localDateString(new Date());
const MONDAY = localWeekKey(parseLocalDate(TODAY));
const weeksOn = (weeks: number) =>
  localDateString(addLocalDays(parseLocalDate(MONDAY), weeks * 7));

const draft: OnboardingDraft = {
  step: 7,
  primaryGoal: "general",
  daysPerWeek: 0,
  equipment: "full_gym",
  runFrequency: "regular",
  runMode: "freeform",
  weeklyRunDays: 4,
  raceDistance: "10k",
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

/** A plan with no race date saved this Monday. */
function rollingPlan(goal: RollingGoal): {
  profile: UserProfile;
  programState: ProgramState;
} {
  const plan = buildOnboardingPlan(
    { ...draft, rollingGoal: goal },
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
  return render(
    <RollingWeeksAhead {...plan} recentLayoff="none" today={TODAY} />
  );
}

/** A line whose numbers are set in their own spans (`InlineNumerals`). */
const line = (text: string) =>
  screen.getByText(
    (_, element) => element?.tagName === "P" && element.textContent === text
  );

async function open() {
  fireEvent.click(screen.getByText("The weeks ahead"));
  return screen.findByRole("list", { name: "The weeks ahead" });
}

describe("RollingWeeksAhead", () => {
  it("opens closed, with nothing worked out until it is opened", () => {
    show(rollingPlan("build_10k"));
    const disclosure = screen.getByText("The weeks ahead").closest("details")!;
    expect(disclosure).not.toHaveAttribute("open");
    expect(
      screen.queryByRole("list", { name: "The weeks ahead" })
    ).not.toBeInTheDocument();
  });

  it("lists the next twelve weeks by their Mondays, every fourth lighter", async () => {
    show(rollingPlan("build_10k"));
    const rows = within(await open()).getAllByRole("listitem");
    expect(rows).toHaveLength(12);
    rows.forEach((row, i) => {
      expect(row).toHaveTextContent(
        `Week of ${formatDayMonth(parseLocalDate(weeksOn(i + 1)))}`
      );
    });
    // The plan's weeks 3, 7 and 11 step back: next week is its week 1.
    const lighter = rows.flatMap((row, i) =>
      /Lighter week/.test(row.textContent ?? "") ? [i + 1] : []
    );
    expect(lighter).toEqual([3, 7, 11]);
    expect(rows[0]).toHaveTextContent(/Long \d+K/);
  });

  it("names the long run's climb and its sessions, the time trials among them", async () => {
    show(rollingPlan("faster_5k"));
    const list = await open();
    expect(list).toHaveTextContent(/5K time trial/);
    // No phase, and no easy run: the day to day stays on the day's card.
    expect(list).not.toHaveTextContent(/\b(Base|Build|Peak|Taper)\b/i);
    expect(list).not.toHaveTextContent(/Easy \d|strides|Medium-long/);
  });

  it("says where the long run holds, from the plan's own weeks", async () => {
    const plan = rollingPlan("build_10k");
    show(plan);
    await open();
    const { hold } = rollingWeeksAhead({
      ...plan,
      recentLayoff: "none",
      today: TODAY,
    });
    expect(
      line(
        `The long run climbs to 12 km by the week of ${formatDayMonth(
          parseLocalDate(hold!.from)
        )}, then holds there, with a lighter week every fourth.`
      )
    ).toBeVisible();
  });

  it("says the long run holds once the plan is past its climb", async () => {
    // Its thirtieth week, as the rollover built it this Monday.
    const plan = rollingPlan("build_5k");
    const [runDays] = rollingWeeksFrom({
      profile: plan.profile,
      goal: "build_5k",
      planWeek: 30,
      weekStart: MONDAY,
      count: 1,
      recentLayoff: "none",
      recentRuns: null,
      recentRunsAsOf: TODAY,
    });
    show({
      ...plan,
      programState: {
        ...plan.programState,
        runDays,
        runPlan: rollingRunPlan("build_5k", 30, MONDAY),
      },
    });
    await open();
    expect(
      line("The long run holds at 8 km, with a lighter week every fourth.")
    ).toBeVisible();
  });

  it("says it is the plan as it stands, in the numeral font", async () => {
    show(rollingPlan("keep_fit"));
    const intro = screen.getByText(/weeks as the plan stands today/);
    expect(intro).toHaveTextContent(
      "The next 12 weeks as the plan stands today. Each week is set when it starts, from what you’ve run."
    );
    expect(intro.querySelector(".font-mono")).toHaveTextContent("12");
    const first = within(await open()).getAllByRole("listitem")[0];
    expect(
      Array.from(first.querySelectorAll(".font-mono")).every((n) =>
        n.classList.contains("tabular-nums")
      )
    ).toBe(true);
  });

  it("is not there without a plan with no race date", () => {
    const plan = rollingPlan("keep_fit");
    const { container: raced } = show({
      ...plan,
      profile: { ...plan.profile, runMode: "race_prep" },
    });
    expect(raced).toBeEmptyDOMElement();
    const { container: none } = show({
      ...plan,
      programState: { ...plan.programState, runPlan: undefined },
    });
    expect(none).toBeEmptyDOMElement();
  });
});

describe("RollingPlanCard", () => {
  it("names the goal and what its weeks hold, with the weeks ahead under them", () => {
    const plan = rollingPlan("build_10k");
    render(
      <RollingPlanCard
        goal="build_10k"
        {...plan}
        recentLayoff="none"
        today={TODAY}
      />
    );
    const card = screen.getByRole("region", { name: "Run plan" });
    expect(within(card).getByText("Plan, no race")).toBeInTheDocument();
    expect(
      within(card).getByRole("heading", { name: "Build to 10K" })
    ).toBeInTheDocument();
    expect(
      within(card).getByText(
        "Up to a long run of 12 km, with tempo and intervals in turn."
      )
    ).toBeInTheDocument();
    expect(within(card).getByText("The weeks ahead")).toBeInTheDocument();
  });
});
