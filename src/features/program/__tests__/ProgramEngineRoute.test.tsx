// @vitest-environment jsdom
/**
 * Train and a session's own page read one programme engine (TrainWk1 call
 * 2): the `/program` route holds it, and moving between Train and the
 * pages under it keeps it, so a session opens with the plan on screen and
 * a change made there is the one Train shows.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";

const h = vi.hoisted(() => ({ mounts: 0, engines: new Set<object>() }));
vi.mock("../useProgram", () => ({
  useProgram: () => {
    // One object per engine mounted, as each `useProgram()` is its own.
    useEffect(() => {
      h.mounts++;
    }, []);
    return engineFor();
  },
}));
let current: object | null = null;
function engineFor() {
  current ??= { programState: { weekNumber: 3 } };
  return current;
}

import ProgramEngineRoute from "../ProgramEngineRoute";
import { useProgramEngine } from "../useProgramEngine";

function Screen({ name, to }: { name: string; to: string }) {
  const engine = useProgramEngine();
  h.engines.add(engine);
  return (
    <>
      <h1>{name}</h1>
      <p>Week {(engine.programState as { weekNumber: number }).weekNumber}</p>
      <Link to={to}>Go</Link>
    </>
  );
}

function open(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/program" element={<ProgramEngineRoute />}>
          <Route index element={<Screen name="Train" to="/program/lift/2" />} />
          <Route
            path="/program/lift/:day"
            element={<Screen name="Lift page" to="/program/run/2026-11-16" />}
          />
          <Route
            path="/program/run/:date"
            element={<Screen name="Run page" to="/program" />}
          />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  h.mounts = 0;
  h.engines.clear();
  current = null;
});

describe("the /program route's engine", () => {
  it("hands Train and each session page the one engine, mounted once", () => {
    open("/program");
    expect(screen.getByRole("heading", { name: "Train" })).toBeInTheDocument();
    expect(screen.getByText("Week 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Go" }));
    expect(
      screen.getByRole("heading", { name: "Lift page" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Go" }));
    expect(
      screen.getByRole("heading", { name: "Run page" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Go" }));
    expect(screen.getByRole("heading", { name: "Train" })).toBeInTheDocument();

    // Three screens, four visits, one engine.
    expect(h.mounts).toBe(1);
    expect(h.engines.size).toBe(1);
  });

  it("is refused outside the route, so a page never runs without it", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(
        <MemoryRouter>
          <Screen name="Stray" to="/" />
        </MemoryRouter>
      )
    ).toThrow(/under the \/program route/);
    quiet.mockRestore();
  });
});
