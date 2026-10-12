/**
 * RunSummary's Export GPX hands the run to the share sheet (a download on
 * the web) and says how it went in the words RunDetail's Export GPX uses.
 * It was a blob `<a download>`, which the iPhone app drops without a word.
 *
 * The page's heavy children are stubbed, as in
 * RunSummary.savedRunState.test.tsx; Firestore runs on the one fake.
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
import type { ReactNode } from "react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "runner" } },
}));

const h = vi.hoisted(() => ({
  auth: { user: { uid: "runner" }, profile: { displayName: "Runner" } },
  shareFile: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/shareFile", () => ({
  shareFile: (...a: unknown[]) => h.shareFile(...a),
}));
vi.mock("@/lib/toast", () => ({ toast: h.toast }));
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
vi.mock("@/hooks/usePrivacyZones", () => ({
  usePrivacyZones: () => ({ zones: [], loading: false, error: null }),
}));
vi.mock("@/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => ({ isOnline: true }),
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
/* The sheet's own card is not under test: only the other ways out it
   carries under it, where Export GPX lives. */
vi.mock("@/components/share/ShareCardSheet", () => {
  const Sheet = ({ open, extras }: { open: boolean; extras?: ReactNode }) =>
    open ? <div role="dialog">{extras}</div> : null;
  return { default: Sheet, ShareCardSheet: Sheet };
});
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
import { resetFirestore } from "@/test/firestoreHarness";

/** An outdoor run already saved (its receipt), about 300 m long. */
function savedOutdoorRun() {
  const start = 1_790_000_000_000;
  return {
    savedRun: {
      uid: "runner",
      id: "run-gpx",
      notes: "",
      relativeEffort: null,
    },
    points: [0, 1, 2, 3].map((i) => ({
      lat: 51.5,
      lon: -0.1 + i * 0.0014,
      rawLat: 51.5,
      rawLon: -0.1 + i * 0.0014,
      timestamp: start + i * 30_000,
      altitude: 12,
      accuracy: 5,
      speed: 3,
    })),
    distance: 5000,
    elapsed: 1500,
    splits: [],
    elevationGain: 0,
    runConfig: { activityType: "freerun" },
  };
}

function renderSummary() {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: "/run-summary", state: savedOutdoorRun() }]}
    >
      <Routes>
        <Route path="/run-summary" element={<RunSummary />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  resetFirestore();
  localStorage.clear();
  h.shareFile.mockReset();
  h.toast.success.mockReset();
  h.toast.error.mockReset();
});
afterEach(cleanup);

/** Export GPX, as a runner reaches it: under the summary's one Share. */
async function exportGpx() {
  fireEvent.click(await screen.findByRole("button", { name: "Share" }));
  fireEvent.click(screen.getByRole("button", { name: "Export GPX" }));
}

describe("RunSummary — Export GPX", () => {
  it("hands the run over as a .gpx file", async () => {
    h.shareFile.mockResolvedValue("shared");
    renderSummary();
    await exportGpx();
    await waitFor(() => expect(h.shareFile).toHaveBeenCalledOnce());
    const file = h.shareFile.mock.calls[0][0] as File;
    expect(file.name).toMatch(/^tropos-run-\d+\.gpx$/);
    expect(file.type).toBe("application/gpx+xml");
    const gpx = await file.text();
    expect(gpx).toContain("<name>Tropos Run ");
    expect(gpx.match(/<trkpt /g)).toHaveLength(4);
  });

  it("confirms a download, as RunDetail does", async () => {
    h.shareFile.mockResolvedValue("downloaded");
    renderSummary();
    await exportGpx();
    await waitFor(() =>
      expect(h.toast.success).toHaveBeenCalledWith("Route downloaded")
    );
  });

  it("says so when the run could not be handed over", async () => {
    h.shareFile.mockResolvedValue("failed");
    renderSummary();
    await exportGpx();
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith("Couldn't share route")
    );
    expect(h.toast.success).not.toHaveBeenCalled();
  });

  it("says nothing after a share or a dismissed sheet", async () => {
    h.shareFile.mockResolvedValue("cancelled");
    renderSummary();
    await exportGpx();
    await waitFor(() => expect(h.shareFile).toHaveBeenCalledOnce());
    // Let the handover's continuation run before reading the toasts.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.toast.success).not.toHaveBeenCalled();
    expect(h.toast.error).not.toHaveBeenCalled();
  });
});

describe("RunSummary — saved, Done comes last", () => {
  it("pins Done after every other action, in thumb reach, with focus", async () => {
    renderSummary();
    const done = await screen.findByRole("button", { name: "Done" });
    expect(screen.getAllByRole("button").at(-1)).toBe(done);
    expect(done.closest(".sticky")).not.toBeNull();
    expect(document.activeElement).toBe(done);
  });

  it("offers one Share, with the run's GPX under its card", async () => {
    renderSummary();
    await screen.findByRole("button", { name: "Done" });
    expect(screen.getAllByRole("button", { name: "Share" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Export GPX" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(
      screen.getByRole("button", { name: "Export GPX" })
    ).toBeInTheDocument();
  });
});
