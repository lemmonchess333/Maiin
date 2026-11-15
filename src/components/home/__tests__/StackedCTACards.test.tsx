/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RUN } from "@/test/journeyScreens";
import { render, screen, fireEvent, within } from "@testing-library/react";
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
import { routineInProgress } from "@/lib/sessionsInFlight";
import type {
  RestDayOffer,
  TodayLift,
  TodayRun,
  TodaySession,
} from "@/lib/todaySession";
import { liftTargets, runStartTarget } from "@/lib/todaySession";
import { heroKicker } from "@/lib/homeHero";

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
  ...liftTargets(extra.index ?? null),
  isStartable: true,
  status: "planned",
  muscleGroups: "",
  ...extra,
});

const run = (extra: Partial<TodayRun> = {}): TodayRun => ({
  runDay: null,
  startTarget: runStartTarget(extra.runDay ?? null),
  completed: false,
  isFirst: false,
  dose: null,
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
      <StackedCTACards unit="km" session={session} navigate={navigate} />
    </MemoryRouter>
  );
}

describe("StackedCTACards", function () {
  beforeEach(function () {
    localStorage.clear();
  });

  describe("card ordering", function () {
    /* DS4: one hero, the session's name as its heading, and the day's
       second session as a compact card under it ("Also today"). */
    const alsoToday = () => screen.getByText("Also today").parentElement!;

    it("the lift is the hero on a day with both, the run under it", function () {
      const { container } = renderCards();
      expect(
        screen.getByRole("heading", { name: "Push Day" })
      ).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Free run" })).toBeNull();
      expect(alsoToday()).toHaveTextContent("Free run");
      const allText = container.textContent || "";
      expect(allText.indexOf("Push Day")).toBeLessThan(
        allText.indexOf("Free run")
      );
    });

    it("the run is the hero when running is the person's aim", function () {
      const { container } = renderCards({ ...bothDay(), runFirst: true });
      expect(
        screen.getByRole("heading", { name: "Free run" })
      ).toBeInTheDocument();
      expect(alsoToday()).toHaveTextContent("Push Day");
      const allText = container.textContent || "";
      expect(allText.indexOf("Free run")).toBeLessThan(
        allText.indexOf("Push Day")
      );
    });

    it("the screen's one full-width filled button is the hero's", function () {
      /* DS4 (§14i, §14m rule 21): the hero's Start is the one filled
         button and is neutral; the compact card's Start keeps its sport's
         colour as a tint. */
      renderCards();
      const [hero, compact] = screen.getAllByRole("button", {
        name: /^Start (workout|run)$/,
      });
      expect(hero).toHaveTextContent("Start workout");
      expect(hero.className).toContain("bg-foreground");
      expect(hero.className).toContain("w-full");
      expect(compact).toHaveTextContent("Start run");
      expect(compact.className).toContain("bg-running/10");
      expect(compact.className).not.toContain("bg-running-fill");
      expect(compact.className).not.toContain("w-full");
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
      expect(
        screen.getByRole("heading", { name: "Free run" })
      ).toBeInTheDocument();
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
      expect(
        screen.getByRole("heading", { name: "Free run" })
      ).toBeInTheDocument();
    });

    it("shows no run on a rest day", function () {
      renderCards(restDay());
      expect(screen.queryByText("Free run")).not.toBeInTheDocument();
    });

    it("shows both CTAs on a lift and run day", function () {
      renderCards(bothDay());
      expect(screen.getByText("Push Day")).toBeInTheDocument();
      expect(screen.getByText("Free run")).toBeInTheDocument();
    });
  });

  describe("#972 cold-start framing", function () {
    /* DS4: the cards carry no eyebrow. A first session is named in the
       kicker beside the date (`heroKicker`, pinned in homeHero.test.ts),
       so the hero says it once. */
    it("frames a new person's first run in the kicker, not on the card", function () {
      const session = runDay({ isFirst: true });
      renderCards(session);
      expect(heroKicker(session, null)).toBe("Your first run");
      expect(screen.queryByText("Your first run")).toBeNull();
    });

    it("never calls a lifting day's workout the first", function () {
      /* ADR-0002 makes a run's identity its date and a lift's the
         cursor's call, so a lifting day's hero names the session and
         claims neither "today" nor "first". The register split is pinned
         in liftCardRegister.test.tsx. */
      const session = liftDay({ index: 2 });
      renderCards(session);
      expect(heroKicker(session, null)).toBeNull();
      expect(screen.queryByText("Your first workout")).not.toBeInTheDocument();
      expect(screen.queryByText("Planned for today")).not.toBeInTheDocument();
    });

    it("shows the FirstMealCard on a new person's rest day", function () {
      renderCards(restDay({ kind: "first-meal" }));
      expect(screen.getByText("Log your first meal")).toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "Rest day" })
      ).not.toBeInTheDocument();
    });

    it("shows the normal RestDayCard on any other rest day", function () {
      renderCards(restDay());
      expect(
        screen.getByRole("heading", { name: "Rest day" })
      ).toBeInTheDocument();
      expect(screen.queryByText("Log your first meal")).not.toBeInTheDocument();
    });

    it("pictures a rest day with the walker, Tropos's own art", function () {
      // DS4 §14m rules 24 and 26: Home's hero carries one picture of at
      // least a tenth of the screen, from our own art; the leaf icon the
      // rest day drew was neither.
      const { container } = renderCards(restDay());
      const picture = container.querySelector("img");
      expect(picture?.getAttribute("src")).toMatch(
        /\/form-art\/rest-walk\.webp$/
      );
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

  it("a startable run launches /run with the template params, to start there and then", function () {
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
    // The E2E journeys start a planned run by this (src/test/journeyScreens.ts).
    fireEvent.click(screen.getByRole("button", { name: RUN.homeStart }));
    expect(navigate).toHaveBeenCalledExactlyOnceWith(
      "/run?template=easy_30&scheduledRunId=run-2&start=1"
    );
  });

  it("unlocks the voice cues inside the Start tap, before leaving Home", function () {
    // The Run page starts the run with no tap of its own, and iOS speaks
    // only for a page that has spoken inside one.
    const speak = vi.fn();
    vi.stubGlobal("speechSynthesis", { speak });
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        volume = 1;
        text: string;
        constructor(text: string) {
          this.text = text;
        }
      }
    );
    try {
      const navigate = vi.fn();
      renderCards(runDay(), navigate);
      fireEvent.click(screen.getByRole("button", { name: RUN.homeStart }));
      expect(speak).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ text: "", volume: 0 })
      );
      expect(speak.mock.invocationCallOrder[0]).toBeLessThan(
        navigate.mock.invocationCallOrder[0]
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /* Run21 (5): the card draws the dose `todaySession` decided, and works
     out none of its own. */
  it("states the run's dose as the session gives it", function () {
    renderCards(
      runDay({
        runDay: {
          id: "run-3",
          dayIndex: 3,
          templateId: "long_15k",
          type: "long",
          status: "planned",
        } as any,
        dose: "15 km · about 100 min",
      }),
      vi.fn()
    );
    expect(document.body.textContent).toContain("15 km · about 100 min");
    expect(document.body.textContent).not.toContain("about 80 min");
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
        tomorrow: { label: "Pull B", target: "/program?day=3" },
      }),
      navigate
    );
    expect(
      screen.getByText("Tomorrow").previousElementSibling
    ).toHaveTextContent("Pull B");
    fireEvent.click(screen.getByRole("button", { name: "See tomorrow" }));
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/program?day=3");
  });

  it("offers nothing to open when tomorrow is rest too", function () {
    renderCards(restDay({ kind: "rest", tomorrow: null }));
    expect(
      screen.getByRole("heading", { name: "Rest day" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Tomorrow")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("names a race plan's next session beyond tomorrow by its day", function () {
    renderCards(
      restDay({
        kind: "rest",
        tomorrow: {
          label: "Easy 30",
          target: "/program?tab=run&rday=2026-10-01",
          dateKey: "2026-10-01",
        },
      })
    );
    expect(
      screen.getByText(/^Next session, /).previousElementSibling
    ).toHaveTextContent("Easy 30");
    expect(
      screen.getByRole("button", { name: "See next session" })
    ).toBeInTheDocument();
  });
});

describe("rest day — what else it can offer", function () {
  it("offers someone who runs freely a run instead of a rest day", function () {
    const session = restDay({
      kind: "free-run",
      startTarget: runStartTarget(null),
    });
    renderCards(session);
    expect(heroKicker(session, null)).toBe("Run when it suits you");
    expect(
      screen.getByRole("heading", { name: "Free run" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Rest day" })).toBeNull();
  });

  it("gives a free run the week's distance as its line", function () {
    // DS4's words rules: one number and what it is compared with. A free
    // run has no plan to describe, so Home words the week instead.
    const { container } = render(
      <MemoryRouter>
        <StackedCTACards
          unit="km"
          session={restDay({
            kind: "free-run",
            startTarget: runStartTarget(null),
          })}
          navigate={vi.fn()}
          freeRunLine={{
            title: "12.4 km this week",
            detail: "18.2 km last week",
            mark: "run",
          }}
        />
      </MemoryRouter>
    );
    // The figures are set in their own spans (`InlineNumerals`).
    expect(container.textContent).toContain("12.4 km this week");
    expect(container.textContent).toContain("18.2 km last week");
  });

  it("offers a new lifter their first workout, opening at its day", function () {
    const navigate = vi.fn();
    const session = restDay({
      kind: "first-workout",
      workout: {
        dayName: "Full Body A",
        dayType: "full",
        exercises: [{ name: "Squat" }],
      } as any,
      index: 0,
      ...liftTargets(0),
    });
    renderCards(session, navigate);
    // The kicker names it the first, in place of the plan's position.
    expect(heroKicker(session, "Week 1 of 8")).toBe("Your first workout");
    expect(
      screen.getByRole("heading", { name: "Full Body A" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start workout" }));
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/program?day=0&start=1");
  });
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
      return el?.tagName === "H2" && el.textContent === name;
    });

  it("says 'with race pace' when the long run finishes at it", function () {
    renderCards(
      runDay({
        runDay: longDay,
        racePace: { kind: "finish" as const, blockKm: 5, goalPaceS: 300 },
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
    renderCards(runDay({ runDay: longDay, racePace: null }));
    expect(title("Long 15K")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open Long 15K in Train" })
    ).toBeInTheDocument();
  });
});

/* A session under way: where it goes is `todaySession`'s rule; these pin
   that the card offers Resume in Start's place, and that another session
   leads the stack on a strip of its own. */
describe("StackedCTACards — a session under way", function () {
  const pushUnderWay = {
    sport: "lift" as const,
    name: "Push",
    sets: 4,
    elapsedSeconds: 900,
    resumeTarget: "/program?day=0&resume=1",
  };
  const runUnderWay = {
    sport: "run" as const,
    name: "Free run",
    sets: null,
    elapsedSeconds: 600,
    resumeTarget: "/run?resume=1",
  };

  it("offers Resume on the workout's own card instead of Start", function () {
    const navigate = vi.fn();
    renderCards(liftDay({ index: 0, inProgress: pushUnderWay }), navigate);
    expect(
      screen.queryByRole("button", { name: "Start workout" })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resume Push" }));
    expect(navigate).toHaveBeenCalledWith("/program?day=0&resume=1");
  });

  it("offers Resume on the run card instead of Start", function () {
    const navigate = vi.fn();
    renderCards(runDay({ inProgress: runUnderWay }), navigate);
    expect(
      screen.queryByRole("button", { name: "Start run" })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resume Free run" }));
    expect(navigate).toHaveBeenCalledWith("/run?resume=1");
  });

  it("leads the stack with a routine's workout, whose Resume opens its page", function () {
    const navigate = vi.fn();
    const { container } = renderCards(
      {
        ...liftDay(),
        inProgressElsewhere: [
          routineInProgress({
            routineId: "r1",
            name: "Arms",
            sets: 1,
            elapsedSeconds: 640,
          }),
        ],
      },
      navigate
    );
    const strip = screen.getByRole("group", { name: "Arms in progress" });
    expect(container.firstElementChild?.firstElementChild).toContainElement(
      strip
    );
    // Named as the routine, with what was done.
    expect(strip).toHaveTextContent("Arms");
    expect(strip).toHaveTextContent("1 set");
    expect(strip).toHaveTextContent("10:40");
    fireEvent.click(within(strip).getByRole("button", { name: "Resume Arms" }));
    expect(navigate).toHaveBeenCalledWith("/routine/r1?resume=1");
    // Today's own card still offers its Start.
    expect(
      screen.getByRole("button", { name: "Start workout" })
    ).toBeInTheDocument();
  });

  it("leads the stack with a session that is not today's card", function () {
    const { container } = renderCards({
      ...liftDay(),
      inProgressElsewhere: [runUnderWay],
    });
    const strip = screen.getByRole("group", { name: "Free run in progress" });
    expect(container.firstElementChild?.firstElementChild).toContainElement(
      strip
    );
    // Today's own card still offers its Start.
    expect(
      screen.getByRole("button", { name: "Start workout" })
    ).toBeInTheDocument();
  });
});
