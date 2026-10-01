/**
 * People's "Suggested people", wired as PeopleView wires it: the joined
 * space ids come from the Spaces directory and feed the suggestions hook.
 *
 * From 14 September until this test the pair never settled. The directory
 * returned a new list every render, the ids derived from it were a new
 * array every render, and the suggestions hook compared them by
 * reference, so each answer looked stale and started another fetch. The
 * spinner never stopped and the app re-read the database in a loop while
 * People was open. Each hook's own suite passed: both pinned a stable
 * input, which is the one thing the real caller never gave them.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { useMemo } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({
  useUid: () => "a",
  useAuth: () => ({ user: { uid: "a" } }),
}));
const NO_OVERRIDES = vi.hoisted(() => ({}));
vi.mock("@/features/spaces/raceEventOverrides", async (original) => ({
  ...(await original<typeof import("@/features/spaces/raceEventOverrides")>()),
  useRaceEventOverrides: () => NO_OVERRIDES,
}));
const fetches = vi.hoisted(() => [] as string[][]);
vi.mock("@/lib/socialApi", () => ({
  getSuggestedPeople: vi.fn(
    async (_uid: string, opts: { joinedSpaceIds?: string[] }) => {
      fetches.push(opts.joinedSpaceIds ?? []);
      return [];
    }
  ),
}));

import { useSpacesDirectory } from "@/features/spaces/useSpacesDirectory";
import { useSuggestedPeople } from "../useSuggestedPeople";

const BLOCKED = new Set<string>();

beforeEach(() => {
  resetFirestore();
  fetches.length = 0;
});

it("asks once before the directory answers and once after, then stops", async () => {
  seedFirestore({ "spaces/runners/members/a": { uid: "a" } });
  const { result } = renderHook(() => {
    const { entries } = useSpacesDirectory(true);
    const joined = useMemo(
      () => entries.filter((e) => e.joined).map((e) => e.def.id),
      [entries]
    );
    return useSuggestedPeople(true, BLOCKED, joined);
  });

  await waitFor(() => {
    expect(fetches.at(-1)).toEqual(["runners"]);
    expect(result.current.loading).toBe(false);
  });
  await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
  expect(fetches).toEqual([[], ["runners"]]);
  expect(result.current.loading).toBe(false);
});
