/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock framer-motion to render plain divs, preserving key/children
vi.mock("framer-motion", function () {
  return {
    motion: new Proxy(
      {},
      {
        get: function (_target: any, prop: string) {
          if (prop === "create") {
            return function (Component: any) {
              return function (props: any) {
                const {
                  initial: _i,
                  animate: _a,
                  exit: _e,
                  transition: _t,
                  variants: _v,
                  whileTap: _w,
                  ...rest
                } = props;
                return <Component {...rest} />;
              };
            };
          }
          return function (props: any) {
            const {
              initial: _i,
              animate: _a,
              exit: _e,
              transition: _t,
              variants: _v,
              whileTap: _w,
              ...rest
            } = props;
            const Tag = prop;
            return <Tag {...rest} />;
          };
        },
      }
    ),
    AnimatePresence: function ({ children }: any) {
      return children;
    },
  };
});

vi.mock("@/lib/haptic", function () {
  return { haptic: vi.fn() };
});

vi.mock("@/hooks/useCountUp", function () {
  return {
    useCountUp: function (val: number) {
      return val;
    },
  };
});

import StackedCTACards from "../StackedCTACards";
import { todayCard, todayCardTarget } from "@/lib/firstGuide";
import type {
  RestDayOffer,
  TodayLift,
  TodayRun,
  TodaySession,
} from "@/lib/todaySession";

/* The cards draw what `todaySession` decided; which card a day gets, and
   in what order a rest day's offers win, is tested there
   (todaySession.test.ts). These pin how each decision is drawn. */
const PUSH = {
  dayName: "Push Day",
  dayType: "push",
  exercises: [{ name: "Bench Press" }, { name: "OHP" }],
} as any;

const lift = (extra: Partial<TodayLift> = {}): TodayLift => ({
  workout: PUSH,
  index: null,
  isStartable: true,
  status: "planned",
  muscleGroups: "",
  ...extra,
});

const run = (extra: Partial<TodayRun> = {}): TodayRun => ({
  runDay: null,
  completed: false,
  isFirst: false,
  ...extra,
});

const liftDay = (extra: Partial<TodayLift> = {}): TodaySession => ({
  type: "lift",
  restContext: {},
  lift: lift(extra),
  run: null,
  rest: null,
});

const runDay = (extra: Partial<TodayRun> = {}): TodaySession => ({
  type: "run",
  restContext: {},
  lift: null,
  run: run(extra),
  rest: null,
});

const bothDay = (
  liftExtra: Partial<TodayLift> = {},
  runExtra: Partial<TodayRun> = {}
): TodaySession => ({
  type: "both",
  restContext: {},
  lift: lift(liftExtra),
  run: run(runExtra),
  rest: null,
});

const restDay = (
  offer: RestDayOffer = { kind: "rest", tomorrow: null }
): TodaySession => ({
  type: "rest",
  restContext: {},
  lift: null,
  run: null,
  rest: offer,
});

function renderCards(session: TodaySession = bothDay(), navigate = vi.fn()) {
  return render(
    <MemoryRouter>
      <StackedCTACards session={session} navigate={navigate} />
    </MemoryRouter>
  );
}

describe("StackedCTACards", function () {
  beforeEach(function () {
    localStorage.clear();
  });

  describe("card ordering", function () {
    it("LiftCTA appears before RunCTA on both days", function () {
      const { container } = renderCards();
      const allText = container.textContent || "";
      const liftIdx = allText.indexOf("Planned for today");
      const runIdx = allText.indexOf("Today · Run day");
      expect(liftIdx).toBeGreaterThan(-1);
      expect(runIdx).toBeGreaterThan(-1);
      expect(liftIdx).toBeLessThan(runIdx);
    });
  });

  describe("home-declutter 4a — the session stack only", function () {
    it("renders no water, weight or welcome-back content", function () {
      const { container } = renderCards();
      const allText = container.textContent || "";
      expect(allText.indexOf("Water")).toBe(-1);
      expect(allText.indexOf("Weight")).toBe(-1);
      expect(allText.indexOf("Welcome back")).toBe(-1);
    });
  });

  describe("conditional CTA cards", function () {
    it("shows LiftCTA on a lifting day with a workout", function () {
      renderCards(liftDay());
      expect(screen.getByText("Push Day")).toBeInTheDocument();
    });

    it("shows no lift on a rest day", function () {
      renderCards(restDay());
      expect(screen.queryByText("Push Day")).not.toBeInTheDocument();
    });

    it("opens Programme without selecting an overflow day when today's lift is missing", function () {
      const navigate = vi.fn();
      renderCards(liftDay({ workout: null, index: 6 }), navigate);
      expect(screen.queryByText("Push Day")).not.toBeInTheDocument();
      expect(screen.queryByText("Today · Rest day")).not.toBeInTheDocument();
      expect(screen.getByText("Check your lifting plan")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Open programme" }));
      expect(navigate).toHaveBeenCalledExactlyOnceWith("/program");
    });

    it("keeps the run available alongside recovery for a missing lift on a both day", function () {
      renderCards(bothDay({ workout: null }));
      expect(screen.getByText("Today · Run day")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Open programme" })
      ).toBeInTheDocument();
    });

    it.each([
      ["rest", restDay()],
      ["run", runDay()],
    ] as const)("does not show lift recovery on a %s day", function (_, day) {
      renderCards(day);
      expect(
        screen.queryByRole("button", { name: "Open programme" })
      ).not.toBeInTheDocument();
    });

    it("does not show lift recovery when the planned workout is available", function () {
      renderCards(liftDay());
      expect(
        screen.queryByRole("button", { name: "Open programme" })
      ).not.toBeInTheDocument();
    });

    it("shows RunCTA on a run day", function () {
      renderCards(runDay());
      expect(screen.getByText(/Run day/)).toBeInTheDocument();
    });

    it("shows no run on a rest day", function () {
      renderCards(restDay());
      expect(screen.queryByText("Today · Run day")).not.toBeInTheDocument();
    });

    it("shows both CTAs on a lift and run day", function () {
      renderCards(bothDay());
      expect(screen.getByText("Push Day")).toBeInTheDocument();
      expect(screen.getByText(/Run day/)).toBeInTheDocument();
    });
  });

  describe("#972 cold-start framing", function () {
    it("frames the run card as 'Your first run' for a new person's first", function () {
      renderCards(runDay({ isFirst: true }));
      expect(screen.getByText("Your first run")).toBeInTheDocument();
    });

    it("keeps the standard lift eyebrow", function () {
      /* "Planned for today", not the run card's "Today · Run day": ADR-0002
         makes a run's identity its date and a lift's the cursor's call, so
         the lift card describes the plan rather than naming the session as
         today's. The register split is pinned in liftCardRegister.test.tsx. */
      renderCards(liftDay({ index: 2 }));
      expect(screen.getByText("Planned for today")).toBeInTheDocument();
      expect(screen.queryByText("Your first workout")).not.toBeInTheDocument();
    });

    it("shows the FirstMealCard on a new person's rest day", function () {
      renderCards(restDay({ kind: "first-meal" }));
      expect(screen.getByText("Log your first meal")).toBeInTheDocument();
      expect(screen.queryByText("Recover today")).not.toBeInTheDocument();
    });

    it("shows the normal RestDayCard on any other rest day", function () {
      renderCards(restDay());
      expect(screen.getByText("Recover today")).toBeInTheDocument();
      expect(screen.queryByText("Log your first meal")).not.toBeInTheDocument();
    });
  });
});

describe("HOME-ACTION-01 — deep-link + terminal states", function () {
  /* The run card's preview opens today's date in Train's Run tab, so the
     date is pinned: a run straddling midnight would otherwise compare
     two different days. Only Date is faked; no timers move. */
  beforeEach(function () {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 27, 12, 0, 0));
  });
  afterEach(function () {
    vi.useRealTimers();
  });

  it("tapping the lift card opens the exact Programme day (?day=N)", function () {
    const navigate = vi.fn();
    renderCards(liftDay({ index: 2 }), navigate);
    fireEvent.click(
      screen.getByRole("button", { name: "Open Push Day in Train" })
    );
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/program?day=2");
  });

  it("Start workout opens the same day and starts it (&start=1)", function () {
    const navigate = vi.fn();
    renderCards(liftDay({ index: 2 }), navigate);
    fireEvent.click(screen.getByRole("button", { name: "Start workout" }));
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/program?day=2&start=1");
  });

  it("the lift card carries no chevron: Start is the action, the card the preview", function () {
    /* A right-pointing arrow before a pill's word read as a stray
       character, owner-reported from a device as "it's >". The DS3 card
       has no pill to hold one: the only icon on it is Start's play mark,
       which sits inside a full-width labelled button. Whichever card grows
       a chevron again, this fails. */
    const { container } = renderCards(bothDay({ index: 2 }));
    expect(container.querySelector(".lucide-chevron-right")).toBeNull();
    expect(screen.queryByText("View")).toBeNull();
    expect(screen.queryByText("View run")).toBeNull();
  });

  it("a completed lift is labelled Completed, offers no Start and still opens the day", function () {
    const navigate = vi.fn();
    renderCards(
      liftDay({ index: 1, isStartable: false, status: "completed" }),
      navigate
    );
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start workout" })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Open Push Day in Train" })
    );
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/program?day=1");
  });

  it("a skipped run is labelled Skipped and does not relaunch /run", function () {
    const navigate = vi.fn();
    renderCards(
      runDay({
        runDay: {
          id: "run-1",
          dayIndex: 3,
          templateId: "easy_30",
          type: "easy",
          status: "skipped",
        } as any,
      }),
      navigate
    );
    expect(screen.getByText("Skipped")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start run" })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Open Easy 30 in Train" })
    );
    expect(navigate).toHaveBeenCalledExactlyOnceWith(
      "/program?tab=run&rday=2026-09-27"
    );
  });

  it("a startable run launches /run with the template params", function () {
    const navigate = vi.fn();
    renderCards(
      runDay({
        runDay: {
          id: "run-2",
          dayIndex: 3,
          templateId: "easy_30",
          type: "easy",
          status: "planned",
        } as any,
      }),
      navigate
    );
    fireEvent.click(screen.getByRole("button", { name: "Start run" }));
    expect(navigate).toHaveBeenCalledExactlyOnceWith(
      "/run?template=easy_30&scheduledRunId=run-2"
    );
  });

  it("tapping a startable run's card previews it in Train instead of starting it", function () {
    const navigate = vi.fn();
    renderCards(
      runDay({
        runDay: {
          id: "run-2",
          dayIndex: 3,
          templateId: "easy_30",
          type: "easy",
          status: "planned",
        } as any,
      }),
      navigate
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Open Easy 30 in Train" })
    );
    expect(navigate).toHaveBeenCalledExactlyOnceWith(
      "/program?tab=run&rday=2026-09-27"
    );
  });
});

/**
 * Where a tap on a Today card lands.
 *
 * The card-wide preview is a button beneath the content, and the content
 * lets taps through to it with `pointer-events-none`. jsdom does no hit
 * testing, so a click dispatched on an element reaches it whatever the
 * CSS says; `tapTarget` models the rule the card relies on instead. A tap
 * goes to the nearest element, from the one under the finger up to the
 * card, that takes pointer events. `pointer-events` is inherited, so an
 * element takes them unless it or an ancestor says `pointer-events-none`
 * with no nearer `pointer-events-auto`. When nothing on the way takes the
 * tap, it reaches the preview, which covers the whole card.
 */
describe("Today cards — every part that is not Start opens the day", function () {
  beforeEach(function () {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 27, 12, 0, 0));
  });
  afterEach(function () {
    vi.useRealTimers();
  });

  function takesPointerEvents(node: Element): boolean {
    for (let n: Element | null = node; n; n = n.parentElement) {
      if (n.classList.contains("pointer-events-auto")) return true;
      if (n.classList.contains("pointer-events-none")) return false;
    }
    return true;
  }

  function tapTarget(under: Element, preview: HTMLElement): Element {
    const card = preview.parentElement;
    for (
      let node: Element | null = under;
      node && node !== card;
      node = node.parentElement
    ) {
      if (takesPointerEvents(node)) return node;
    }
    return preview;
  }

  const skippedRun = {
    id: "run-1",
    dayIndex: 0,
    templateId: "easy_30",
    type: "easy",
    status: "skipped",
  } as any;
  const plannedRun = { ...skippedRun, id: "run-2", status: "planned" };

  it("a tap on a finished lift's status opens the day", function () {
    const navigate = vi.fn();
    renderCards(
      liftDay({ index: 1, isStartable: false, status: "completed" }),
      navigate
    );
    const preview = screen.getByRole("button", {
      name: "Open Push Day in Train",
    });
    const status = screen.getByText("Completed");
    const target = tapTarget(status, preview);
    expect(target).toBe(preview);
    // And the space around the status, the rest of the card's foot.
    expect(tapTarget(status.parentElement!, preview)).toBe(preview);
    fireEvent.click(target);
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/program?day=1");
  });

  it("a tap on a skipped run's status opens the run in Train", function () {
    const navigate = vi.fn();
    renderCards(runDay({ runDay: skippedRun }), navigate);
    const preview = screen.getByRole("button", {
      name: "Open Easy 30 in Train",
    });
    const status = screen.getByText("Skipped");
    const target = tapTarget(status, preview);
    expect(target).toBe(preview);
    expect(tapTarget(status.parentElement!, preview)).toBe(preview);
    fireEvent.click(target);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(
      "/program?tab=run&rday=2026-09-27"
    );
  });

  it("Start keeps its own taps, and the space around it opens the day", function () {
    renderCards(bothDay({ index: 2 }, { runDay: plannedRun }));
    for (const [start, previewName] of [
      ["Start workout", "Open Push Day in Train"],
      ["Start run", "Open Easy 30 in Train"],
    ] as const) {
      const preview = screen.getByRole("button", { name: previewName });
      const button = screen.getByRole("button", { name: start });
      expect(tapTarget(button, preview), start).toBe(button);
      // The Play mark inside Start is part of Start.
      const icon = button.querySelector("svg")!;
      expect(button.contains(tapTarget(icon, preview)), start).toBe(true);
      expect(tapTarget(button.parentElement!, preview), start).toBe(preview);
    }
  });
});

describe("rest day — tomorrow's session", function () {
  it("names tomorrow's session and opens it", function () {
    const navigate = vi.fn();
    // The label as todaySession builds it (todaySession.test.ts pins that).
    renderCards(
      restDay({
        kind: "rest",
        tomorrow: { label: "Pull · Lat focus", target: "/program?day=3" },
      }),
      navigate
    );
    expect(screen.getByText(/Tomorrow:/)).toHaveTextContent(
      "Tomorrow: Pull · Lat focus."
    );
    fireEvent.click(screen.getByRole("button", { name: "See tomorrow" }));
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/program?day=3");
  });

  it("offers nothing to open when tomorrow is rest too", function () {
    renderCards(restDay({ kind: "rest", tomorrow: null }));
    expect(screen.getByText("Recover today")).toBeInTheDocument();
    expect(screen.queryByText(/Tomorrow:/)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("rest day — what else it can offer", function () {
  it("offers someone who runs freely a run instead of a rest day", function () {
    renderCards(restDay({ kind: "free-run" }));
    expect(screen.getByText("Run when it suits you")).toBeInTheDocument();
    expect(screen.queryByText(/Recover today/)).toBeNull();
  });

  it("offers a new lifter their first workout, opening at its day", function () {
    const navigate = vi.fn();
    renderCards(
      restDay({
        kind: "first-workout",
        workout: {
          dayName: "Full Body A",
          dayType: "full",
          exercises: [{ name: "Squat" }],
        } as any,
        index: 0,
      }),
      navigate
    );
    expect(screen.getByText("Your first workout")).toBeInTheDocument();
    expect(screen.queryByText("Run when it suits you")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Start workout" }));
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/program?day=0&start=1");
  });
});

/* The first-visit walk (FV1) points at the stack's first card by the
   `data-guide-stop` it carries; `todayCard` / `todayCardTarget` in
   firstGuide.ts name it. If the two disagree the walk's first stop points
   at nothing and is quietly passed over, so the pair is pinned here. */
describe("the first-visit walk finds today's card", function () {
  const firstWorkout: RestDayOffer = {
    kind: "first-workout",
    workout: PUSH,
    index: 0,
  };
  const days: [string, TodaySession][] = [
    ["a lifting day", liftDay()],
    ["a run day", runDay()],
    ["a day with both", bothDay()],
    ["a new lifter's rest day", restDay(firstWorkout)],
    ["a free runner's rest day", restDay({ kind: "free-run" })],
    ["a rest day", restDay()],
    ["a first-meal day", restDay({ kind: "first-meal" })],
  ];
  for (const [label, session] of days) {
    it(`on ${label}, the stop names the first card`, function () {
      const { container } = renderCards(session);
      const card = todayCard(session);
      expect(card).not.toBeNull();
      const first = container.querySelector("[data-guide-stop]");
      expect(first?.getAttribute("data-guide-stop")).toBe(
        todayCardTarget(card!)
      );
    });
  }
});

describe("today's run card names a race-pace finish (Run21 (2))", function () {
  const longDay = {
    id: "run-1",
    dayIndex: 3,
    templateId: "long_15k",
    type: "long",
    status: "planned",
  } as any;
  // The title sets its numerals apart (InlineNumerals), so read it whole.
  const title = (name: string) =>
    screen.getByText(function (_content, el) {
      return el?.tagName === "P" && el.textContent === name;
    });

  it("says 'with race pace' when the long run finishes at it", function () {
    renderCards(
      runDay({
        runDay: longDay,
        racePaceFinish: { blockKm: 5, goalPaceS: 300 },
      })
    );
    expect(title("Long 15K with race pace")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Open Long 15K with race pace in Train",
      })
    ).toBeInTheDocument();
  });

  it("is the plain long run without one", function () {
    renderCards(runDay({ runDay: longDay, racePaceFinish: null }));
    expect(title("Long 15K")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open Long 15K in Train" })
    ).toBeInTheDocument();
  });
});
