import { useNavigate, useSearchParams } from "react-router-dom";
import SessionCompleteScreen from "@/components/workout/SessionCompleteScreen";
import ShareCardRenderer, {
  type ShareCardRenderData,
} from "@/components/share/ShareCardRenderer";
import { formArtCutoutUrl, getFormArtCutout } from "@/lib/formArtCutouts";
import type { ProgramExercise } from "@/features/program/programTypes";
import type { SetPR } from "@/lib/prTracking";
import type { PostMoment } from "@/lib/postMoments";
import { rewardLine } from "@/lib/finishMoment";

/*
 * DEV/TEST-ONLY finish lab (DS4). Not in production builds; see the route
 * gating in App.tsx (same pattern as BrandBakeoff).
 *
 * A lift's reward needs a best to beat, so the finish screen's two
 * registers could otherwise be captured only by training for them. This
 * renders the real SessionCompleteScreen, saved, for one pull day: as the
 * reward for a new best on the row (`?state=lift-best`), and as the calm
 * summary of a routine session (`?state=lift-routine`). `?state=share-…`
 * renders the share card itself at half size. The run's registers are
 * captured from real saves (finish-screens.capture.spec.ts).
 */

function lift(
  name: string,
  exerciseId: string,
  movementCategory: string,
  sets: number
): ProgramExercise {
  return {
    name,
    exerciseId,
    instanceId: `lab-${exerciseId}`,
    movementCategory,
    sets,
    reps: 8,
    baseReps: 8,
    weight: 0,
    progressionType: "double",
    performanceHistory: [],
    lastPerformance: null,
  } as unknown as ProgramExercise;
}

const PULL_A = [
  lift("Barbell Row", "barbell-row", "horizontal_pull", 4),
  lift("Lat Pulldown", "lat-pulldown", "vertical_pull", 3),
  lift("Face Pull", "face-pulls", "vertical_push", 3),
  lift("Dumbbell Curl", "db-curl", "arms_biceps", 1),
];

const set = (weight: number, reps: number) => ({
  weight,
  reps,
  completed: true,
  type: "working" as const,
});

/* 2,295 kg in all: the mockup's session. */
const PULL_A_SETS = [
  [set(35, 8), set(32.5, 8), set(32.5, 8), set(32.5, 8)],
  [set(30, 10), set(30, 10), set(30, 10)],
  [set(7.5, 12), set(7.5, 12), set(7.5, 12)],
  [set(6.5, 10)],
];

const ROW_BEST = {
  kind: "best",
  bucket: "8rm",
  weight: 35,
  reps: 8,
  previousBest: { weight: 32.5, reps: 8, date: "2026-10-31" },
  bestBeforeSession: { weight: 32.5, reps: 8, date: "2026-10-31" },
} as unknown as SetPR;

const BEST: PostMoment[] = [
  { kind: "pr", exercise: "Barbell Row", weightKg: 35, reps: 8 },
];

/* This morning at 07:42, 41 minutes. */
function startedThisMorning(): number {
  const start = new Date();
  start.setHours(7, 42, 0, 0);
  return start.getTime();
}

const sentence = (line: { before: string; figure: string; after: string }) =>
  `${line.before}${line.figure}${line.after}`;

const ROUTE =
  "M500,120 C760,120 900,300 900,500 C900,700 760,880 500,880 C240,880 100,700 100,500 C100,300 240,120 500,120";

function shareData(state: string): ShareCardRenderData {
  const row = getFormArtCutout("barbell-row");
  const common = {
    unit: "km" as const,
    liftUnit: "kg" as const,
    format: "story" as const,
    background: "brand" as const,
    handle: "Sam",
    date: "Sat 7 Nov",
  };
  if (state === "share-run-best")
    return {
      ...common,
      template: "run",
      headline: "Tempo done",
      line: sentence(
        rewardLine(
          { kind: "fastestEffort", meters: 5000, seconds: 1450 },
          {
            sport: "run",
            distanceUnit: "km",
            loadIn: (kg) => kg,
            loadUnit: "kg",
            fastestBefore: 1482,
          }
        )
      ),
      tone: "achievement",
      routePath: ROUTE,
      distanceKm: 5.02,
      durationSec: 1458,
      paceSecPerKm: 290,
      elevationM: 30,
    };
  return {
    ...common,
    template: "lift",
    headline: "Pull A done",
    ...(state === "share-lift-best"
      ? {
          line: sentence(
            rewardLine(BEST[0], {
              sport: "lift",
              distanceUnit: "km",
              loadIn: (kg) => kg,
              loadUnit: "kg",
              prBefore: { weightKg: 32.5, reps: 8 },
            })
          ),
          tone: "achievement" as const,
          prCount: 1,
          prExercise: "Barbell Row",
        }
      : {}),
    artSrc: row ? formArtCutoutUrl(row) : undefined,
    totalVolumeKg: 2295,
    exerciseCount: 4,
    durationSec: 41 * 60,
  };
}

export default function FinishLab() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const state = params.get("state") ?? "lift-best";

  if (state.startsWith("share-")) {
    // Half the card's 1080 px, drawn at that size for the shutter.
    return (
      <main aria-label="Share card lab" className="bg-background p-0">
        <div data-share-card style={{ width: 540, height: 960 }}>
          <div
            style={{
              transform: "scale(0.5)",
              transformOrigin: "top left",
              width: 1080,
              height: 1920,
            }}
          >
            <ShareCardRenderer data={shareData(state)} offscreen={false} />
          </div>
        </div>
      </main>
    );
  }

  const best = state === "lift-best";
  return (
    <SessionCompleteScreen
      dayName="Pull A"
      exercises={PULL_A}
      setLogs={PULL_A_SETS}
      firedPRs={new Map()}
      prResults={best ? new Map([["Barbell Row:8rm", ROW_BEST]]) : new Map()}
      moments={best ? BEST : []}
      sessionDurationMinutes={41}
      startedAt={startedThisMorning()}
      completing={false}
      saved
      saveStatus="synced"
      planContext={{ next: "Next: Push A on Monday" }}
      onFinish={() => {}}
      onClose={() => navigate("/")}
    />
  );
}
