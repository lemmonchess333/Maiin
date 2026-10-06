// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useLayoutEffect, useState } from "react";
import { generateSchedule } from "@/lib/scheduleUtils";
import { homeProgramSnapshot } from "../homeProgramSnapshot";
import {
  resetFirestore,
  seedFirestore,
  flushSnapshots,
  setSnapshotMetadata,
  readLog,
} from "@/test/firestoreHarness";
import { localDateString } from "@/lib/dateHelpers";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "../programTypes";

const h = vi.hoisted(() => ({
  user: { uid: "alice" },
  profile: {} as Record<string, unknown>,
  controllerImports: 0,
  controllerMounts: 0,
  skip: vi.fn(),
  state: null as unknown,
  readiness: "ready" as "pending" | "ready" | "failed",
  publish: null as ((value: unknown) => void) | null,
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: h.user, profile: h.profile }),
}));
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: {
    get currentUser() {
      return h.user;
    },
  },
}));
vi.mock("firebase/firestore");
vi.mock("../fetchRecentLayoff", () => ({
  fetchRecentLayoff: async () => "none",
}));
vi.mock("../HomeProgramController", () => {
  h.controllerImports++;
  return {
    default: function Controller({
      publish,
    }: {
      publish: (value: unknown) => void;
    }) {
      useLayoutEffect(() => {
        h.controllerMounts++;
        h.publish = publish;
        publish({
          loading: false,
          readiness: h.readiness,
          programState: h.state,
          skipRunDay: h.skip,
        });
      }, [publish]);
      return null;
    },
  };
});
import { useHomeProgram } from "../useHomeProgram";

function Harness() {
  const model = useHomeProgram();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      {model.controller}
      <p>
        {model.programState
          ? `Week ${model.programState.weekNumber}`
          : "Loading"}
      </p>
      <p data-testid="loading">{String(model.loading)}</p>
      <button
        onClick={() =>
          void model.skipRunDay("run").catch((e: Error) => setError(e.message))
        }
      >
        Skip
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
function emit(state: ProgramState | null, fromCache = false) {
  setSnapshotMetadata("users/alice/programState/current", { fromCache });
  if (state)
    seedFirestore({
      "users/alice/programState/current": state as unknown as Record<
        string,
        unknown
      >,
    });
}
beforeEach(() => {
  resetFirestore();
  h.user = { uid: "alice" };
  h.profile = {
    runMode: "freeform",
    weekSchedule: generateSchedule(2, 0),
    weekScheduleVersion: 1,
    weeklyWorkoutsTarget: 2,
  };
  h.state = homeProgramSnapshot(
    {
      goal: "recomp",
      weekNumber: 3,
      currentPhase: "base",
      splitType: "full_body",
      workouts: [],
      fatigueScore: 0,
      updatedAt: 1,
    } as ProgramState,
    h.profile as unknown as UserProfile,
    localDateString()
  ).programState;
  h.skip.mockReset().mockResolvedValue(undefined);
  h.controllerMounts = 0;
  h.readiness = "ready";
  h.publish = null;
});
describe("Home defers the programme controller", () => {
  /* `controllerImports` counts how many times the MOCK FACTORY ran, and a
     module registry runs it once per file — so it is "has this file ever
     imported the controller", not "did this test". It was asserted as
     `0` then `1`, which only holds when this test runs first: any other
     test that reaches the editor leaves it at 1, and `--sequence.shuffle`
     failed here on 2 of 5 seeds. Resetting the counter in `beforeEach`
     does not help and fails the other way — the factory never re-runs, so
     the post-click assertion reads 0.

     `controllerMounts` is the per-test observable (it IS reset), and it
     carries the same claim: the deferred editor renders only once the
     hook has resolved the import. The import counter keeps the weaker
     half — the cached paint fetches nothing NEW — read against a
     baseline rather than against zero. */
  it("paints a current cached plan without loading the editor, then loads it for an action", async () => {
    const importsBefore = h.controllerImports;
    emit(h.state as ProgramState, true);
    render(<Harness />);
    await flushSnapshots();
    expect(screen.getByText("Week 3")).toBeInTheDocument();
    expect(h.controllerImports).toBe(importsBefore);
    expect(h.controllerMounts).toBe(0);
    fireEvent.click(screen.getByText("Skip"));
    await waitFor(() => expect(h.skip).toHaveBeenCalledWith("run"));
    expect(h.controllerMounts).toBe(1);
  });
  it("does not mistake an empty offline cache for a missing programme", async () => {
    emit(null, true);
    render(<Harness />);
    await flushSnapshots();
    expect(h.controllerMounts).toBe(0);
  });
  /* The cache already knows the document is missing (an earlier session
     read it from the server, then closed before the programme was built),
     so the first snapshot is the cached one and the hook rightly waits.
     The server's answer changes nothing but `fromCache`, and Firestore
     delivers a change to metadata alone only to a listener that asked
     for it: without `includeMetadataChanges`, Home's session card stayed
     a grey placeholder on every launch until Train built the programme. */
  it("builds the programme when the server confirms one the cache already knew was missing", async () => {
    emit(null, true);
    render(<Harness />);
    await flushSnapshots();
    expect(screen.getByTestId("loading")).toHaveTextContent("true");
    expect(h.controllerMounts).toBe(0);

    setSnapshotMetadata("users/alice/programState/current", {
      fromCache: false,
    });
    await waitFor(() => expect(h.controllerMounts).toBe(1));
  });
  /* Drawn from no programme, a lifting day read "Today is a lifting day,
     but no workout is linked" for the second the build took. */
  it("stays loading until the built programme arrives", async () => {
    h.readiness = "pending";
    emit(null, true);
    render(<Harness />);
    await flushSnapshots();
    setSnapshotMetadata("users/alice/programState/current", {
      fromCache: false,
    });
    await waitFor(() => expect(h.controllerMounts).toBe(1));
    expect(screen.getByTestId("loading")).toHaveTextContent("true");

    act(() =>
      h.publish!({
        loading: false,
        readiness: "ready",
        programState: h.state,
        skipRunDay: h.skip,
      })
    );
    await flushSnapshots();
    expect(screen.getByTestId("loading")).toHaveTextContent("true");

    emit(h.state as ProgramState);
    await waitFor(() => expect(screen.getByText("Week 3")).toBeInTheDocument());
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
  });
  it("stops loading when the programme cannot be built", async () => {
    h.readiness = "pending";
    emit(null, true);
    render(<Harness />);
    await flushSnapshots();
    setSnapshotMetadata("users/alice/programState/current", {
      fromCache: false,
    });
    await waitFor(() => expect(h.controllerMounts).toBe(1));

    act(() =>
      h.publish!({
        loading: false,
        readiness: "failed",
        programState: null,
        skipRunDay: h.skip,
      })
    );
    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("false")
    );
  });
  it("loads maintenance when a real stored week is stale", async () => {
    emit({ ...(h.state as ProgramState), liftWeekKey: "2020-01-06" });
    render(<Harness />);
    await waitFor(() => expect(h.controllerMounts).toBe(1));
  });
  it("drops account A's cached state immediately on an account change", async () => {
    emit(h.state as ProgramState);
    seedFirestore({
      "users/bob/programState/current": {
        ...(h.state as Record<string, unknown>),
        weekNumber: 9,
      },
    });
    const view = render(<Harness />);
    await flushSnapshots();
    fireEvent.click(screen.getByText("Skip"));
    await waitFor(() => expect(h.skip).toHaveBeenCalled());
    const mountsBeforeSwitch = h.controllerMounts;
    h.user = { uid: "bob" };
    view.rerender(<Harness />);
    expect(screen.queryByText("Week 3")).not.toBeInTheDocument();
    await flushSnapshots();
    expect(screen.getByText("Week 9")).toBeInTheDocument();
    expect(h.controllerMounts).toBe(mountsBeforeSwitch);
    expect(
      readLog().some(
        (read) =>
          read.op === "onSnapshot" &&
          read.path === "users/bob/programState/current"
      )
    ).toBe(true);
  });
});

describe("Home acts on the server's copy of the plan", () => {
  /* The engine paints the cached copy first (`loading` false) and reads the
     server's after. A write built on the cache can be refused when the
     server has moved on (a rollover on another device, a run that started
     recovery), so a tap on Home waits for `readiness`, not `loading`. */
  const published = (readiness: "pending" | "ready" | "failed") => ({
    loading: false,
    readiness,
    programState: h.state,
    skipRunDay: h.skip,
  });

  it("waits until the engine has read the server's copy", async () => {
    h.readiness = "pending";
    emit(h.state as ProgramState, true);
    render(<Harness />);
    await flushSnapshots();
    fireEvent.click(screen.getByText("Skip"));
    await waitFor(() => expect(h.controllerMounts).toBe(1));
    expect(h.skip).not.toHaveBeenCalled();
    act(() => h.publish!(published("ready")));
    await waitFor(() => expect(h.skip).toHaveBeenCalledWith("run"));
  });

  it("waits again while the engine reloads", async () => {
    // The engine reads the plan afresh whenever the profile changes, and is
    // pending again until it has. A tap in that window waits too, rather
    // than taking the engine it already has.
    emit(h.state as ProgramState, true);
    render(<Harness />);
    await flushSnapshots();
    fireEvent.click(screen.getByText("Skip"));
    await waitFor(() => expect(h.skip).toHaveBeenCalledTimes(1));
    act(() => h.publish!(published("pending")));
    fireEvent.click(screen.getByText("Skip"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(h.skip).toHaveBeenCalledTimes(1);
    act(() => h.publish!(published("ready")));
    await waitFor(() => expect(h.skip).toHaveBeenCalledTimes(2));
  });

  it("says the plan could not be loaded when that read fails", async () => {
    h.readiness = "pending";
    emit(h.state as ProgramState, true);
    render(<Harness />);
    await flushSnapshots();
    fireEvent.click(screen.getByText("Skip"));
    await waitFor(() => expect(h.controllerMounts).toBe(1));
    act(() => h.publish!(published("failed")));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't load your programme. Please try again."
    );
    expect(h.skip).not.toHaveBeenCalled();
  });
});
