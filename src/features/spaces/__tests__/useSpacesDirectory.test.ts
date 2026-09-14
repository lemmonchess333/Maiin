import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deferReads,
  readLog,
  readsAt,
  releaseAllReads,
  resetFirestore,
  resumeReads,
  seedFirestore,
} from "@/test/firestoreHarness";
import { useSpacesDirectory } from "../useSpacesDirectory";
import type { RaceBrowseFilters } from "../raceBrowse";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
const session = vi.hoisted(() => ({ uid: "a", overrides: {} }));
vi.mock("@/lib/auth", () => ({ useUid: () => session.uid }));
vi.mock("@/lib/dateHelpers", () => ({ localDateString: () => "2026-09-14" }));
vi.mock("../raceEventOverrides", async (original) => ({
  ...(await original<typeof import("../raceEventOverrides")>()),
  useRaceEventOverrides: () => session.overrides,
}));

describe("directory membership reads", () => {
  beforeEach(() => {
    resetFirestore();
    session.uid = "a";
  });
  it("loads only visible races, reuses interest reads across filters, and refreshes memberships", async () => {
    seedFirestore({
      "spaces/runners/members/a": { uid: "a" },
      "spaces/chicago-marathon/members/a": { uid: "a" },
    });
    const { result, rerender } = renderHook(
      ({ filters }) => useSpacesDirectory(true, filters),
      {
        initialProps: {
          filters: { country: "GB", distance: "marathon" } as RaceBrowseFilters,
        },
      }
    );
    await waitFor(() =>
      expect(
        result.current.entries.find((e) => e.def.id === "runners")?.joined
      ).toBe(true)
    );
    expect(readsAt("spaces/chicago-marathon/members/a")).toHaveLength(0);
    const interestReads = readsAt("spaces/runners/members").length;
    expect(interestReads).toBe(1);
    rerender({ filters: { country: "US", distance: "marathon" } });
    expect(
      result.current.entries
        .filter((e) => e.def.kind === "race")
        .every((e) => e.def.event?.countryCode === "US")
    ).toBe(true);
    await waitFor(() =>
      expect(
        result.current.entries.find((e) => e.def.id === "chicago-marathon")
          ?.joined
      ).toBe(true)
    );
    expect(readsAt("spaces/runners/members")).toHaveLength(interestReads);
    expect(
      readLog().filter((r) => r.op === "getDocs" && r.path.includes("marathon"))
    ).toHaveLength(0);
    seedFirestore({ "spaces/boston-marathon/members/a": { uid: "a" } });
    act(() => result.current.refresh());
    await waitFor(() =>
      expect(
        result.current.entries.find((e) => e.def.id === "boston-marathon")
          ?.joined
      ).toBe(true)
    );
  });
  it("late account-A reads cannot mark account B as joined", async () => {
    seedFirestore({ "spaces/boston-marathon/members/a": { uid: "a" } });
    deferReads();
    const { result, rerender } = renderHook(() =>
      useSpacesDirectory(true, { country: "US", distance: "marathon" })
    );
    session.uid = "b";
    resumeReads();
    rerender();
    await waitFor(() =>
      expect(
        result.current.entries.find((e) => e.def.id === "runners")?.memberCount
      ).toBe(0)
    );
    await act(async () => {
      releaseAllReads();
    });
    expect(result.current.entries.every((e) => !e.joined)).toBe(true);
    expect(readsAt("spaces/boston-marathon/members/b")).toHaveLength(1);
  });
});
