// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useLayoutEffect } from "react";
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
        publish({ loading: false, programState: h.state, skipRunDay: h.skip });
      }, [publish]);
      return null;
    },
  };
});
import { useHomeProgram } from "../useHomeProgram";

function Harness() {
  const model = useHomeProgram();
  return (
    <>
      {model.controller}
      <p>
        {model.programState
          ? `Week ${model.programState.weekNumber}`
          : "Loading"}
      </p>
      <button onClick={() => void model.skipRunDay("run")}>Skip</button>
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
});
describe("Home defers the programme controller", () => {
  it("paints a current cached plan without loading the editor, then loads it for an action", async () => {
    emit(h.state as ProgramState, true);
    render(<Harness />);
    await flushSnapshots();
    expect(screen.getByText("Week 3")).toBeInTheDocument();
    expect(h.controllerImports).toBe(0);
    fireEvent.click(screen.getByText("Skip"));
    await waitFor(() => expect(h.skip).toHaveBeenCalledWith("run"));
    expect(h.controllerImports).toBe(1);
  });
  it("does not mistake an empty offline cache for a missing programme", async () => {
    emit(null, true);
    render(<Harness />);
    await flushSnapshots();
    expect(h.controllerMounts).toBe(0);
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
