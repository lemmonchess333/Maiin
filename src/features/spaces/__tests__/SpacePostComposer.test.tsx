/**
 * SpacePostComposer — starting a draft with the latest session attached.
 *
 * An empty space's "Share your last session" and the post-race hand-off
 * open the composer with `attachLatest`. The newest session is attached
 * as soon as the list arrives; removing it or picking another sticks for
 * the draft; and the post carries the attached session's snapshot.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
} from "vitest";
import { loadWordFilter } from "@/lib/wordFilter";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";

const h = vi.hoisted(() => ({
  profile: { displayName: "Sam", uid: "viewer" } as Record<string, unknown>,
}));

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
const restriction = vi.hoisted(() => ({ isRestricted: false, loading: false }));
vi.mock("@/hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => restriction,
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "viewer", emailVerified: true },
    profile: h.profile,
  }),
  useUid: () => "viewer",
}));
const photo = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("@/lib/spacePhotoUpload", () => ({
  uploadSpacePostPhoto: photo.upload,
}));
vi.mock("@/hooks/useEmailVerificationGate", () => ({
  useEmailVerificationGate: () => ({
    needsVerification: false,
    recheck: vi.fn(),
  }),
}));

import SpacePostComposer from "../SpacePostComposer";
import { toast } from "@/lib/toast";
import { PhotoRefusedError, PHOTO_REFUSED_MESSAGE } from "@/lib/photoScreen";
import type { RecentSession } from "../useRecentSessions";
import {
  allPaths,
  failNextFirestore,
  readDoc,
  resetFirestore,
  seedFirestore,
  setSnapshotMetadata,
  unfiredFailures,
} from "@/test/firestoreHarness";
import { haversine } from "@/lib/gps";
import { ROUTE_WITHHELD_NOTE } from "@/lib/privacyZones";

const RUN: RecentSession = {
  kind: "run",
  run: {
    id: "r1",
    distance: 10000,
    duration: 3521,
    avgPace: 352,
    elevationGain: 40,
    calories: 640,
    activityType: "run",
    completedAt: new Date(2026, 8, 23, 8),
    relativeEffort: null,
  },
};
const WORKOUT = {
  kind: "workout",
  workout: {
    id: "w1",
    date: "2026-09-22",
    durationMinutes: 50,
    exercises: [
      {
        exerciseId: "bench-press",
        exerciseName: "Bench Press",
        sets: [{ setNumber: 1, reps: 5, weightKg: 80 }],
      },
    ],
  },
} as unknown as RecentSession;

function renderComposer(props: {
  sessions: RecentSession[];
  attachLatest?: boolean;
}) {
  return render(
    <SpacePostComposer
      spaceId="womens-running"
      open
      onOpenChange={() => {}}
      onPosted={() => {}}
      {...props}
    />
  );
}

beforeEach(() => {
  resetFirestore();
  h.profile = { displayName: "Sam", uid: "viewer" };
});
afterEach(() => cleanup());

/** Types a body, posts, and returns the post document. */
async function postAndRead(): Promise<Record<string, unknown>> {
  fireEvent.change(screen.getByLabelText("Post body"), {
    target: { value: "Morning loop." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Post to space" }));
  await waitFor(() =>
    expect(
      allPaths().some((p) => p.startsWith("spaces/womens-running/posts/"))
    ).toBe(true)
  );
  return readDoc(
    allPaths().find((p) => p.startsWith("spaces/womens-running/posts/"))!
  )!;
}

describe("SpacePostComposer — a run's route", () => {
  /* Twenty points due north, about 280 m apart: the shape the run
     history's sampled preview has. The first and last are where the run
     started and finished, which for most runs is the runner's door. */
  const ROUTE = Array.from({ length: 20 }, (_, i) => ({
    lat: 51.5 + i * 0.0025,
    lon: -0.12,
  }));
  const ROUTED_RUN: RecentSession = {
    kind: "run",
    run: { ...(RUN as { run: object }).run, routePreview: ROUTE },
  } as RecentSession;

  function routeOf(post: Record<string, unknown>) {
    return (post.activity as { routePreview?: { lat: number }[] })
      .routePreview!;
  }

  it("leaves out the start and the finish, as a shared run in the feed does", async () => {
    // Space posts can be read by any signed-in account, so the privacy
    // setting's default (ends hidden) applies here too.
    renderComposer({ sessions: [ROUTED_RUN], attachLatest: true });
    const route = routeOf(await postAndRead());

    expect(route.length).toBeGreaterThan(1);
    expect(route[0].lat).toBeGreaterThan(ROUTE[0].lat);
    expect(route.at(-1)!.lat).toBeLessThan(ROUTE.at(-1)!.lat);
  });

  it("hides the ends when the setting is on", async () => {
    h.profile = { ...h.profile, hideSharedRouteEnds: true };
    renderComposer({ sessions: [ROUTED_RUN], attachLatest: true });
    const route = routeOf(await postAndRead());

    expect(route[0].lat).toBeGreaterThan(ROUTE[0].lat);
    expect(route.at(-1)!.lat).toBeLessThan(ROUTE.at(-1)!.lat);
  });

  it("keeps the whole route when the runner has turned the setting off", async () => {
    h.profile = { ...h.profile, hideSharedRouteEnds: false };
    renderComposer({ sessions: [ROUTED_RUN], attachLatest: true });
    const route = routeOf(await postAndRead());

    expect(route[0]).toEqual(ROUTE[0]);
    expect(route.at(-1)).toEqual(ROUTE.at(-1));
  });

  /* A zone the runner added after saving the run: the stored route was cut
     without it, so only the post can cut it. Mid-route, 300 m across, which
     takes in three of the route's points. */
  const LATER_ZONE = {
    name: "Work",
    lat: ROUTE[10].lat,
    lon: ROUTE[10].lon,
    radiusMeters: 300,
  };

  it.each([
    ["with the ends hidden", undefined],
    ["with the ends shown", false],
  ])(
    "cuts a privacy zone added after the run was saved, %s",
    async (_, hideSharedRouteEnds) => {
      h.profile = { ...h.profile, hideSharedRouteEnds };
      seedFirestore({ "users/viewer/privacyZones/work": LATER_ZONE });
      renderComposer({ sessions: [ROUTED_RUN], attachLatest: true });
      const route = routeOf(await postAndRead()) as {
        lat: number;
        lon: number;
        breakBefore?: boolean;
      }[];

      expect(route.length).toBeGreaterThan(1);
      for (const p of route) {
        expect(
          haversine(p.lat, p.lon, LATER_ZONE.lat, LATER_ZONE.lon)
        ).toBeGreaterThan(LATER_ZONE.radiusMeters);
      }
      // The two sides of the zone are drawn apart, not joined across it.
      expect(route.some((p) => p.breakBefore)).toBe(true);
      expect(screen.queryByText(ROUTE_WITHHELD_NOTE)).toBeNull();
    }
  );

  it("posts no route while the privacy zones are still loading, and says so", async () => {
    // Only the cache has answered: an empty cache is not evidence that no
    // zone is set.
    setSnapshotMetadata("users/viewer/privacyZones", { fromCache: true });
    renderComposer({ sessions: [ROUTED_RUN], attachLatest: true });
    expect(screen.getByText(ROUTE_WITHHELD_NOTE)).toBeInTheDocument();

    const post = await postAndRead();
    expect(post.activity).toMatchObject({ type: "run", distance: 10000 });
    expect(post.activity).not.toHaveProperty("routePreview");
  });

  it("posts no route when the privacy zones cannot be read, and says so", async () => {
    failNextFirestore("onSnapshot", { path: "users/viewer/privacyZones" });
    renderComposer({ sessions: [ROUTED_RUN], attachLatest: true });
    expect(unfiredFailures()).toEqual([]);
    expect(screen.getByText(ROUTE_WITHHELD_NOTE)).toBeInTheDocument();

    const post = await postAndRead();
    expect(post.activity).toMatchObject({ type: "run", distance: 10000 });
    expect(post.activity).not.toHaveProperty("routePreview");
  });
});

describe("SpacePostComposer — attachLatest", () => {
  it("attaches the newest session, and the post carries it", async () => {
    renderComposer({ sessions: [RUN, WORKOUT], attachLatest: true });

    expect(
      screen.getByRole("button", { name: "Remove attached session" })
    ).toBeInTheDocument();
    expect(screen.getByText("10.0 km run")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Post body"), {
      target: { value: "First 10K done." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post to space" }));

    await waitFor(() =>
      expect(
        allPaths().some((p) => p.startsWith("spaces/womens-running/posts/"))
      ).toBe(true)
    );
    const path = allPaths().find((p) =>
      p.startsWith("spaces/womens-running/posts/")
    )!;
    expect(readDoc(path)).toMatchObject({
      body: "First 10K done.",
      activity: { type: "run", distance: 10000, duration: 3521 },
    });
  });

  it("stays removed once the user removes it", () => {
    renderComposer({ sessions: [RUN, WORKOUT], attachLatest: true });
    fireEvent.click(
      screen.getByRole("button", { name: "Remove attached session" })
    );
    expect(
      screen.queryByRole("button", { name: "Remove attached session" })
    ).toBeNull();
    // The picker lists both sessions to choose from instead.
    expect(screen.getByText("10.0 km run")).toBeInTheDocument();
    expect(screen.getByText("Workout · Bench Press")).toBeInTheDocument();
  });

  it("a session the user picks replaces the latest", () => {
    renderComposer({ sessions: [RUN, WORKOUT], attachLatest: true });
    fireEvent.click(
      screen.getByRole("button", { name: "Remove attached session" })
    );
    fireEvent.click(screen.getByText("Workout · Bench Press"));
    expect(screen.getByText("Workout · Bench Press")).toBeInTheDocument();
    expect(screen.queryByText("10.0 km run")).toBeNull();
  });

  it("includes the lead drawing when the workout's artwork is released", async () => {
    renderComposer({ sessions: [WORKOUT], attachLatest: true });
    fireEvent.change(screen.getByLabelText("Post body"), {
      target: { value: "Bench day." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post to space" }));
    await waitFor(() =>
      expect(
        allPaths().some((p) => p.startsWith("spaces/womens-running/posts/"))
      ).toBe(true)
    );
    const path = allPaths().find((p) =>
      p.startsWith("spaces/womens-running/posts/")
    )!;
    const activity = (readDoc(path) as { activity: Record<string, unknown> })
      .activity;
    expect(activity.type).toBe("workout");
    expect(activity.leadExerciseId).toBe("bench-press");
  });

  it("attaches nothing when opened as a plain post", () => {
    renderComposer({ sessions: [RUN, WORKOUT] });
    expect(
      screen.queryByRole("button", { name: "Remove attached session" })
    ).toBeNull();
  });

  it("attaches the latest when the sessions arrive after the sheet opens", () => {
    const { rerender } = renderComposer({ sessions: [], attachLatest: true });
    expect(screen.queryByText("Attach a session")).toBeNull();
    rerender(
      <SpacePostComposer
        spaceId="womens-running"
        open
        onOpenChange={() => {}}
        onPosted={() => {}}
        sessions={[RUN]}
        attachLatest
      />
    );
    expect(
      screen.getByRole("button", { name: "Remove attached session" })
    ).toBeInTheDocument();
  });
});

describe("SpacePostComposer — a restricted account (S4e)", () => {
  afterEach(() => {
    restriction.isRestricted = false;
  });

  it("holds Post and says why", () => {
    restriction.isRestricted = true;
    renderComposer({ sessions: [] });
    fireEvent.change(screen.getByLabelText("Post body"), {
      target: { value: "Long run done." },
    });
    expect(screen.getByText("Your account is restricted")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Post to space" })
    ).toBeDisabled();
  });
});

describe("SpacePostComposer — a photo the screening refuses (Ship1)", () => {
  it("says why and posts nothing", async () => {
    photo.upload.mockRejectedValueOnce(new PhotoRefusedError());
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:photo" });
    renderComposer({ sessions: [] });
    // The sheet renders in a portal, outside the render container.
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: {
        files: [new File(["jpeg"], "gym.jpg", { type: "image/jpeg" })],
      },
    });
    fireEvent.change(screen.getByLabelText("Post body"), {
      target: { value: "Leg day." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post to space" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(PHOTO_REFUSED_MESSAGE)
    );
    expect(
      allPaths().some((p) => p.startsWith("spaces/womens-running/posts/"))
    ).toBe(false);
    vi.unstubAllGlobals();
  });
});

/* The word filter as a session that has used it holds it: loaded, so the
   sheet draws on its first render (useWordFilter covers the wait). */
beforeAll(async () => {
  await loadWordFilter();
});
