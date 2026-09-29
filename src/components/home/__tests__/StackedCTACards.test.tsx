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

function renderCards(
  overrides: Partial<Parameters<typeof StackedCTACards>[0]> = {}
) {
  const defaults = {
    nextWorkout: {
      dayName: "Push Day",
      dayType: "push",
      exercises: [{ name: "Bench Press" }, { name: "OHP" }],
    },
    todayType: "both" as const,
    navigate: vi.fn(),
    todayRun: null,
  };
  const props = { ...defaults, ...overrides };
  return render(
    <MemoryRouter>
      <StackedCTACards {...props} />
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
    it("shows LiftCTA when todayType is lift and nextWorkout exists", function () {
      renderCards({ todayType: "lift" });
      expect(screen.getByText("Push Day")).toBeInTheDocument();
    });

    it("hides LiftCTA when todayType is rest", function () {
      renderCards({ todayType: "rest" });
      expect(screen.queryByText("Push Day")).not.toBeInTheDocument();
    });

    it("opens Programme without selecting an overflow day when today's lift is missing", function () {
      const navigate = vi.fn();
      renderCards({
        todayType: "lift",
        nextWorkout: null,
        liftDayIndex: 6,
        navigate,
      });
      expect(screen.queryByText("Push Day")).not.toBeInTheDocument();
      expect(screen.queryByText("Today · Rest day")).not.toBeInTheDocument();
      expect(screen.getByText("Check your lifting plan")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Open programme" }));
      expect(navigate).toHaveBeenCalledExactlyOnceWith("/program");
    });

    it("keeps the run available alongside recovery for a missing lift on a both day", function () {
      renderCards({ todayType: "both", nextWorkout: null });
      expect(screen.getByText("Today · Run day")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Open programme" })
      ).toBeInTheDocument();
    });

    it.each(["rest", "run"] as const)(
      "does not show lift recovery on a %s day",
      function (todayType) {
        renderCards({ todayType, nextWorkout: null });
        expect(
          screen.queryByRole("button", { name: "Open programme" })
        ).not.toBeInTheDocument();
      }
    );

    it("does not show lift recovery when the planned workout is available", function () {
      renderCards({ todayType: "lift" });
      expect(
        screen.queryByRole("button", { name: "Open programme" })
      ).not.toBeInTheDocument();
    });

    it("shows RunCTA when todayType is run", function () {
      renderCards({ todayType: "run" });
      expect(screen.getByText(/Run day/)).toBeInTheDocument();
    });

    it("hides RunCTA when todayType is rest", function () {
      renderCards({ todayType: "rest" });
      expect(screen.queryByText("Today · Run day")).not.toBeInTheDocument();
    });

    it("shows both CTAs when todayType is both", function () {
      renderCards({ todayType: "both" });
      expect(screen.getByText("Push Day")).toBeInTheDocument();
      expect(screen.getByText(/Run day/)).toBeInTheDocument();
    });
  });

  describe("#972 cold-start framing", function () {
    it("keeps calendar wording when a fresh account is shown a later lift", function () {
      renderCards({ todayType: "lift", firstWorkout: true, liftDayIndex: 2 });
      expect(screen.getByText("Planned for today")).toBeInTheDocument();
      expect(screen.queryByText("Your first workout")).not.toBeInTheDocument();
    });

    it("frames the run card as 'Your first run' when firstRun is set", function () {
      renderCards({ todayType: "run", firstRun: true });
      expect(screen.getByText("Your first run")).toBeInTheDocument();
    });

    it("default (no flags) keeps the standard lift eyebrow", function () {
      /* "Planned for today", not the run card's "Today · Run day": ADR-0002
         makes a run's identity its date and a lift's the cursor's call, so
         the lift card describes the plan rather than naming the session as
         today's. The register split is pinned in liftCardRegister.test.tsx. */
      renderCards({ todayType: "lift" });
      expect(screen.getByText("Planned for today")).toBeInTheDocument();
      expect(screen.queryByText("Your first workout")).not.toBeInTheDocument();
    });

    it("shows the FirstMealCard instead of RestDayCard on a rest day when firstMeal is set", function () {
      renderCards({ todayType: "rest", firstMeal: true });
      expect(screen.getByText("Log your first meal")).toBeInTheDocument();
      expect(screen.queryByText("Recover today")).not.toBeInTheDocument();
    });

    it("shows the normal RestDayCard on a rest day when firstMeal is not set", function () {
      renderCards({ todayType: "rest", firstMeal: false });
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
    renderCards({ todayType: "lift", liftDayIndex: 2, navigate });
    fireEvent.click(
      screen.getByRole("button", { name: "Open Push Day in Train" })
    );
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/program?day=2");
  });

  it("Start workout opens the same day and starts it (&start=1)", function () {
    const navigate = vi.fn();
    renderCards({ todayType: "lift", liftDayIndex: 2, navigate });
    fireEvent.click(screen.getByRole("button", { name: "Start workout" }));
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/program?day=2&start=1");
  });

  it("the lift card carries no chevron: Start is the action, the card the preview", function () {
    /* A right-pointing arrow before a pill's word read as a stray
       character, owner-reported from a device as "it's >". The DS3 card
       has no pill to hold one: the only icon on it is Start's play mark,
       which sits inside a full-width labelled button. Whichever card grows
       a chevron again, this fails. */
    const { container } = renderCards({
      todayType: "both",
      liftDayIndex: 2,
      navigate: vi.fn(),
    });
    expect(container.querySelector(".lucide-chevron-right")).toBeNull();
    expect(screen.queryByText("View")).toBeNull();
    expect(screen.queryByText("View run")).toBeNull();
  });

  it("a completed lift is labelled Completed, offers no Start and still opens the day", function () {
    const navigate = vi.fn();
    renderCards({
      todayType: "lift",
      liftDayIndex: 1,
      liftStartable: false,
      liftStatus: "completed",
      navigate,
    });
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start workout" })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Open Push Day in Train" })
    );
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/program?day=1");
  });

  it("a skipped run is labelled Skipped and does not relaunch /run", function () {
    const navigate = vi.fn();
    renderCards({
      todayType: "run",
      navigate,
      todayRun: {
        id: "run-1",
        dayIndex: 3,
        templateId: "easy_30",
        type: "easy",
        status: "skipped",
      } as any,
    });
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
    renderCards({
      todayType: "run",
      navigate,
      todayRun: {
        id: "run-2",
        dayIndex: 3,
        templateId: "easy_30",
        type: "easy",
        status: "planned",
      } as any,
    });
    fireEvent.click(screen.getByRole("button", { name: "Start run" }));
    expect(navigate).toHaveBeenCalledExactlyOnceWith(
      "/run?template=easy_30&scheduledRunId=run-2"
    );
  });

  it("tapping a startable run's card previews it in Train instead of starting it", function () {
    const navigate = vi.fn();
    renderCards({
      todayType: "run",
      navigate,
      todayRun: {
        id: "run-2",
        dayIndex: 3,
        templateId: "easy_30",
        type: "easy",
        status: "planned",
      } as any,
    });
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
    renderCards({
      todayType: "lift",
      liftDayIndex: 1,
      liftStartable: false,
      liftStatus: "completed",
      navigate,
    });
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
    renderCards({ todayType: "run", navigate, todayRun: skippedRun });
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
    renderCards({ todayType: "both", liftDayIndex: 2, todayRun: plannedRun });
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
    // The label as Home builds it (Home.dayAndWeek.test.tsx pins that).
    renderCards({
      todayType: "rest",
      navigate,
      tomorrow: { label: "Pull · Lat focus", target: "/program?day=3" },
    });
    expect(screen.getByText(/Tomorrow:/)).toHaveTextContent(
      "Tomorrow: Pull · Lat focus."
    );
    fireEvent.click(screen.getByRole("button", { name: "See tomorrow" }));
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/program?day=3");
  });

  it("offers nothing to open when tomorrow is rest too", function () {
    renderCards({ todayType: "rest", tomorrow: null });
    expect(screen.getByText("Recover today")).toBeInTheDocument();
    expect(screen.queryByText(/Tomorrow:/)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
