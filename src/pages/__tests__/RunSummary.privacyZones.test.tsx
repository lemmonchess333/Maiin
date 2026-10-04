/**
 * A run is never written with a privacy zone still in its trace.
 *
 * The Privacy Policy says GPS points inside a zone are removed before a
 * route is saved. The finish screen cut the trace with whatever the zone
 * listener had delivered, and that is nothing before its first answer or
 * after it fails, so a run saved in that window kept its whole trace. The
 * save now waits for zones the server has confirmed: the listener's last
 * server answer, else a server read, held here with deferReads to prove
 * the wait. When neither can be had, nothing is written.
 *
 * The real `usePrivacyZones` on the one Firestore fake (ADR-0009). The
 * page is offline (navigator.onLine false) so the saved run waits in the
 * durable queue, where the test reads exactly what would be written.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "runner" } },
}));

const h = vi.hoisted(() => ({
  auth: { user: { uid: "runner" }, profile: { displayName: "Runner" } },
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => h.auth,
  useUid: () => h.auth.user.uid,
  useUidForStorageKey: () => h.auth.user.uid,
}));
vi.mock("@/features/program/useProgram", () => ({
  useProgram: () => ({
    markManualComplete: vi.fn(),
    skipRunDay: vi.fn(),
    programState: { runDays: [] },
  }),
}));
vi.mock("@/hooks/usePaceInsight", () => ({
  usePaceInsightFromRuns: () => ({
    insight: null,
    accept: vi.fn(),
    dismiss: vi.fn(),
  }),
}));
vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km" as const,
}));
vi.mock("@/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => ({ isOnline: false }),
}));
vi.mock("@/hooks/useShoes", () => ({
  useShoes: () => ({ updateMileage: vi.fn(), defaultShoe: null }),
}));
vi.mock("@/hooks/useWeekPulse", () => ({ useWeekPulse: () => null }));
vi.mock("@/lib/lifecycleAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/components/run/RunMapLazy", () => ({ default: () => null }));
vi.mock("@/components/analytics/ElevationProfile", () => ({
  default: () => null,
}));
vi.mock("@/components/share/ShareCardSheet", () => ({
  default: () => null,
  ShareCardSheet: () => null,
}));
vi.mock("@/components/social/CircleShareSheet", () => ({
  default: () => null,
}));
vi.mock("@/components/workout/CompletionExtras", () => ({
  default: () => null,
}));
vi.mock("@/components/run/PaceInsightCard", () => ({ default: () => null }));
vi.mock("@/components/WeekPulseView", () => ({ default: () => null }));
vi.mock("@/components/social/SavedRunKudos", () => ({ default: () => null }));

import RunSummary from "../RunSummary";
import { haversine } from "@/lib/gps";
import { pendingDocumentWrites } from "@/lib/offlineQueue";
import {
  deferReads,
  failNextFirestore,
  pendingReads,
  rejectRead,
  releaseAllReads,
  releaseRead,
  resetFirestore,
  resumeReads,
  seedFirestore,
  setSnapshotMetadata,
  unfiredFailures,
} from "@/test/firestoreHarness";

const ZONES = "users/runner/privacyZones";
/** Home: a 200 m zone around where the run starts. */
const HOME = { lat: 51.5, lon: 0, radiusMeters: 200 };

/** 13 fixes stepping ~111 m north from home, 30 s apart. The first two
 *  sit inside the zone. */
function trace() {
  return Array.from({ length: 13 }, (_, i) => ({
    lat: HOME.lat + i * 0.001,
    lon: HOME.lon,
    rawLat: HOME.lat + i * 0.001,
    rawLon: HOME.lon,
    altitude: null,
    accuracy: 5,
    speed: null,
    timestamp: 1_700_000_000_000 + i * 30_000,
  }));
}

function renderFinished() {
  return render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: "/run-summary",
          state: {
            points: trace(),
            distance: 1334,
            elapsed: 360,
            splits: [],
            elevationGain: 0,
            runConfig: { activityType: "freerun" },
          },
        },
      ]}
    >
      <Routes>
        <Route path="/run-summary" element={<RunSummary />} />
      </Routes>
    </MemoryRouter>
  );
}

const queued = () => pendingDocumentWrites("runner", "users/runner/runs");

/** The points the queued run would write, and how many fall in the zone. */
function savedTrace() {
  const points = (
    queued()[0].data as { points: { lat: number; lon: number }[] }
  ).points;
  const inZone = points.filter(
    (p) => haversine(p.lat, p.lon, HOME.lat, HOME.lon) <= HOME.radiusMeters
  );
  return { points, inZone };
}

/** Taps Save once the page has settled, holding every read from then on,
 *  and returns the held privacy-zone read's index. */
async function saveWithReadsHeld() {
  const save = await screen.findByRole("button", { name: "Save run" });
  deferReads();
  fireEvent.click(save);
  await waitFor(() => expect(pendingReads()).toContain(ZONES));
  return pendingReads().indexOf(ZONES);
}

let online: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetFirestore();
  localStorage.clear();
  seedFirestore({ [`${ZONES}/home`]: { name: "Home", ...HOME } });
  online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
});
afterEach(() => {
  resumeReads();
  releaseAllReads();
  online.mockRestore();
  cleanup();
});

describe("RunSummary — privacy zones are cut before a run is written", () => {
  it("after the zone listener failed, the save waits for a server read and writes no zone point", async () => {
    // The listener never answers, so the screen's trace is uncut.
    failNextFirestore("onSnapshot", { path: ZONES });
    renderFinished();
    const zoneRead = await saveWithReadsHeld();
    // The listener did fail: the screen had no zones to cut with.
    expect(unfiredFailures()).toEqual([]);

    // Held: nothing written while the zones are unknown.
    expect(queued()).toHaveLength(0);

    releaseRead(zoneRead);
    await screen.findByRole("button", { name: "Done" });
    const { points, inZone } = savedTrace();
    expect(points.length).toBeGreaterThan(5);
    expect(inZone).toEqual([]);
  });

  it("before the listener has the server's answer, the save waits for it too", async () => {
    // A cache answer: the zones show, but the server hasn't confirmed them.
    setSnapshotMetadata(ZONES, { fromCache: true });
    renderFinished();
    const zoneRead = await saveWithReadsHeld();
    expect(queued()).toHaveLength(0);

    releaseRead(zoneRead);
    await screen.findByRole("button", { name: "Done" });
    const { points, inZone } = savedTrace();
    expect(points.length).toBeGreaterThan(5);
    expect(inZone).toEqual([]);
  });

  it("when the zones can't be read, nothing is written and the banner says why", async () => {
    failNextFirestore("onSnapshot", { path: ZONES });
    renderFinished();
    const zoneRead = await saveWithReadsHeld();
    rejectRead(zoneRead, "unavailable");

    expect(
      await screen.findByText(
        /Privacy zones are cut from the route before it's saved, and they couldn't be checked/
      )
    ).toBeTruthy();
    expect(queued()).toHaveLength(0);

    // Retry once the read can be answered: saved, with the zone cut.
    resumeReads();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByRole("button", { name: "Done" });
    expect(savedTrace().inZone).toEqual([]);
  });

  it("with zones the listener already had from the server, the save cuts them without another read", async () => {
    renderFinished();
    const save = await screen.findByRole("button", { name: "Save run" });
    // Every read from here is held, and the save still completes: it
    // waited on none.
    deferReads();
    fireEvent.click(save);
    await screen.findByRole("button", { name: "Done" });
    expect(pendingReads()).not.toContain(ZONES);
    const { points, inZone } = savedTrace();
    expect(points.length).toBeGreaterThan(5);
    expect(inZone).toEqual([]);
  });
});
