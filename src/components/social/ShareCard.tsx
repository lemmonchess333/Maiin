import { Footprints, Dumbbell, Trophy, Flame } from "lucide-react";
import type { Ref } from "react";
import {
  getDistanceComparison,
  getVolumeComparison,
} from "@/lib/funComparisons";
import { THEME } from "@/lib/theme";

export type ShareCardTheme = "dark" | "light" | "transparent";

export interface ShareCardData {
  type: "run" | "workout" | "badge" | "pr" | "weekly_summary" | "streak";
  userName: string;
  date: string;
  theme?: ShareCardTheme;
  // Run
  distance?: number;
  duration?: number;
  pace?: string;
  elevationGain?: number;
  // Workout
  exerciseCount?: number;
  totalVolume?: number;
  prsHit?: number;
  muscleGroups?: string[];
  // Badge
  badgeIcon?: string;
  badgeName?: string;
  badgeDescription?: string;
  // PR
  exerciseName?: string;
  oldWeight?: number;
  newWeight?: number;
  // Weekly Summary
  weekSessions?: number;
  weekKm?: number;
  weekTonnage?: number;
  weekStreak?: number;
  // Streak
  streakCount?: number;
  // Stat visibility
  hiddenStats?: Set<string>;
}

const THEME_STYLES: Record<
  ShareCardTheme,
  { bg: string; text: string; muted: string; accent: string }
> = {
  dark: {
    bg: "#0a0a0f",
    text: "#ffffff",
    muted: "rgba(255,255,255,0.4)",
    accent: "#a78bfa",
  },
  light: {
    bg: "#ffffff",
    text: "#1a1a2e",
    muted: "rgba(0,0,0,0.4)",
    accent: THEME.brand, // #7B72E9
  },
  transparent: {
    bg: "transparent",
    text: "#ffffff",
    muted: "rgba(255,255,255,0.4)",
    accent: "#a78bfa",
  },
};

function ShareCard({
  data,
  ref,
}: {
  data: ShareCardData;
  ref?: Ref<HTMLDivElement>;
}) {
  const theme = data.theme || "dark";
  const s = THEME_STYLES[theme];
  const hidden = data.hiddenStats || new Set();

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const ss = sec % 60;
    return `${m}:${ss.toString().padStart(2, "0")}`;
  };

  const distKm = data.distance ? data.distance / 1000 : 0;
  const comparison =
    data.type === "run" && distKm > 0
      ? getDistanceComparison(distKm)
      : data.type === "workout" && (data.totalVolume || 0) > 0
        ? getVolumeComparison(data.totalVolume || 0)
        : null;

  return (
    <div
      ref={ref}
      style={{
        width: 1080,
        height: 1920,
        position: "absolute",
        left: -9999,
        top: -9999,
        backgroundColor: s.bg,
        color: s.text,
      }}
      className="flex flex-col items-center justify-center p-16"
    >
      {/* Brand header */}
      <p
        className="text-4xl font-bold tracking-tight mb-1"
        style={{ color: s.accent }}
      >
        TROPOS
      </p>
      <p className="text-lg mb-16" style={{ color: s.muted }}>
        Tracked with Tropos
      </p>

      {/* Run card */}
      {data.type === "run" && (
        <>
          <Footprints size={80} className="mb-10" />
          <div className="text-center space-y-8">
            {!hidden.has("distance") && (
              <div>
                <p className="text-9xl font-bold font-mono">
                  {distKm.toFixed(2)}
                </p>
                <p className="text-2xl" style={{ color: s.muted }}>
                  kilometres
                </p>
              </div>
            )}
            <div className="flex gap-20 justify-center">
              {!hidden.has("pace") && (
                <div className="text-center">
                  <p className="text-5xl font-bold font-mono">
                    {data.pace || "--:--"}
                  </p>
                  <p className="text-lg" style={{ color: s.muted }}>
                    /km pace
                  </p>
                </div>
              )}
              {!hidden.has("duration") && (
                <div className="text-center">
                  <p className="text-5xl font-bold font-mono">
                    {data.duration ? formatDuration(data.duration) : "--"}
                  </p>
                  <p className="text-lg" style={{ color: s.muted }}>
                    time
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Workout card */}
      {data.type === "workout" && (
        <>
          <Dumbbell size={80} className="mb-10" />
          <div className="text-center space-y-8">
            {!hidden.has("volume") && (
              <div>
                <p className="text-9xl font-bold font-mono">
                  {data.totalVolume
                    ? `${(data.totalVolume / 1000).toFixed(1)}t`
                    : "0"}
                </p>
                <p className="text-2xl" style={{ color: s.muted }}>
                  total volume
                </p>
              </div>
            )}
            <div className="flex gap-20 justify-center">
              {!hidden.has("exercises") && (
                <div className="text-center">
                  <p className="text-5xl font-bold font-mono tabular-nums">
                    {data.exerciseCount || 0}
                  </p>
                  <p className="text-lg" style={{ color: s.muted }}>
                    exercises
                  </p>
                </div>
              )}
              {!hidden.has("prs") && (data.prsHit || 0) > 0 && (
                <div className="text-center">
                  <p
                    className="text-5xl font-bold font-mono tabular-nums flex items-center gap-2"
                    style={{ color: THEME.warning }}
                  >
                    <Trophy size={40} /> {data.prsHit}
                  </p>
                  <p className="text-lg" style={{ color: s.muted }}>
                    PRs
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Badge card */}
      {data.type === "badge" && (
        <div className="text-center space-y-6">
          {/* REVIEW: intentional off-scale hero — 120px badge emoji on the
              fixed-size export share image, not a UI text surface. Left as
              an arbitrary value; the modular scale tops out at 48px. */}
          <p className="text-[120px]">{data.badgeIcon || "trophy"}</p>
          <div>
            <p className="text-5xl font-bold">{data.badgeName}</p>
            <p className="text-2xl mt-2" style={{ color: s.muted }}>
              {data.badgeDescription}
            </p>
          </div>
          <p className="text-3xl font-bold" style={{ color: THEME.warning }}>
            Badge Earned!
          </p>
        </div>
      )}

      {/* PR card */}
      {data.type === "pr" && (
        <div className="text-center space-y-6">
          <Trophy size={80} className="mb-4" style={{ color: THEME.warning }} />
          <p className="text-4xl font-bold">{data.exerciseName}</p>
          <div className="flex items-center justify-center gap-8">
            <div className="text-center">
              <p className="text-4xl font-mono" style={{ color: s.muted }}>
                {data.oldWeight}kg
              </p>
              <p className="text-lg" style={{ color: s.muted }}>
                before
              </p>
            </div>
            <p className="text-4xl" style={{ color: s.muted }}>
              →
            </p>
            <div className="text-center">
              <p
                className="text-6xl font-bold font-mono"
                style={{ color: THEME.warning }}
              >
                {data.newWeight}kg
              </p>
              <p className="text-lg" style={{ color: s.muted }}>
                NEW PR
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Weekly Summary */}
      {data.type === "weekly_summary" && (
        <div className="text-center space-y-8">
          <p className="text-4xl font-bold">Weekly Wrap-Up</p>
          <div className="grid grid-cols-2 gap-12">
            {!hidden.has("sessions") && (
              <div className="text-center">
                <p
                  className="text-6xl font-bold font-mono"
                  style={{ color: THEME.brand }}
                >
                  {data.weekSessions || 0}
                </p>
                <p className="text-xl" style={{ color: s.muted }}>
                  sessions
                </p>
              </div>
            )}
            {!hidden.has("distance") && (
              <div className="text-center">
                {/* DS1b: ShareCard stays on inline THEME hex — it's captured
                    by html-to-image, whose CSS-variable resolution during the
                    DOM-clone is unreliable; a token swap could silently break
                    the rendered share image. Inline rgb is capture-safe. */}
                <p
                  className="text-6xl font-bold font-mono"
                  style={{ color: THEME.running }}
                >
                  {data.weekKm?.toFixed(1) || "0"}km
                </p>
                <p className="text-xl" style={{ color: s.muted }}>
                  distance
                </p>
              </div>
            )}
            {!hidden.has("tonnage") && (
              <div className="text-center">
                <p
                  className="text-6xl font-bold font-mono"
                  style={{ color: THEME.success }}
                >
                  {data.weekTonnage
                    ? (data.weekTonnage / 1000).toFixed(1) + "t"
                    : "0"}
                </p>
                <p className="text-xl" style={{ color: s.muted }}>
                  tonnage
                </p>
              </div>
            )}
            {!hidden.has("streak") && (
              <div className="text-center">
                <p
                  className="text-6xl font-bold font-mono flex items-center gap-2"
                  style={{ color: THEME.semantic.nutrition }}
                >
                  <Flame size={48} /> {data.weekStreak || 0}
                </p>
                <p className="text-xl" style={{ color: s.muted }}>
                  streak
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Streak card */}
      {data.type === "streak" && (
        <div className="text-center space-y-6">
          {/* streak flame = generic warm orange (NOT the nutrition orange) */}
          <Flame size={120} style={{ color: "var(--ds-orange-500)" }} />
          <p
            className="text-8xl font-bold font-mono"
            style={{ color: THEME.semantic.nutrition }}
          >
            {data.streakCount}
          </p>
          <p className="text-3xl" style={{ color: s.muted }}>
            day streak
          </p>
        </div>
      )}

      {/* Fun comparison */}
      {comparison && (
        <p
          className="text-2xl mt-12 text-center italic"
          style={{ color: s.muted }}
        >
          {comparison}
        </p>
      )}

      {/* Footer */}
      <div className="mt-auto w-full space-y-6">
        <div
          className="h-1 w-full rounded-full"
          style={{
            background: `linear-gradient(to right, ${s.accent}, #6366f1)`,
          }}
        />
        <p className="text-xl text-center" style={{ color: s.muted }}>
          {data.userName} · {data.date}
        </p>
      </div>
    </div>
  );
}

export default ShareCard;
