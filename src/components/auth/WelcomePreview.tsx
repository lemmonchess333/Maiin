import { cn } from "@/lib/utils";
import { CALORIE_UNIT, formatCalories } from "@/utils/formatNutrition";
import {
  WELCOME_SESSION_EXERCISE,
  authArtPath,
  publicUrl,
} from "@/lib/authArt";

type DayKind = "lift" | "run" | "rest";

/** The example week: three lifts and two runs, with a rest day between. */
const WEEK: readonly { day: string; kind: DayKind }[] = [
  { day: "M", kind: "lift" },
  { day: "T", kind: "run" },
  { day: "W", kind: "rest" },
  { day: "T", kind: "lift" },
  { day: "F", kind: "run" },
  { day: "S", kind: "lift" },
  { day: "S", kind: "rest" },
];

/** The example day and target. A 45-minute day holds four lifts (Lift21). */
const EXAMPLE = { session: "Legs", minutes: 45, lifts: 4, calories: 2450 };

/** How far round the example ring is drawn. */
const RING_SHARE = 0.4;
const RING_RADIUS = 40;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/**
 * The welcome screen's picture (DS8 call 1): what the first few questions
 * lead to, drawn as the app draws it. A week of lift and run days, today's
 * session with its drawing, and a daily calorie target.
 *
 * It is a picture, not content: one image to a screen reader, named as an
 * example, and sized from the column's width (`.welcome-art`) so it keeps
 * its proportions on a narrow phone and at any text size. Where the screen
 * is short it gives up its lower edge before the buttons leave the screen.
 */
export default function WelcomePreview({ className }: { className?: string }) {
  const target = `${formatCalories(EXAMPLE.calories)} ${CALORIE_UNIT}`;
  return (
    <div
      role="img"
      aria-label={`An example plan: three lifts and two runs in a week, today’s ${EXAMPLE.minutes}-minute leg session, and a target of ${target} a day.`}
      className={cn("welcome-preview", className)}
    >
      <div className="welcome-art">
        <div className="welcome-light hero-glow" />

        <div className="welcome-week welcome-rise bg-card card-shadow">
          <p className="welcome-title">Your week</p>
          <div className="welcome-days">
            {WEEK.map(({ day, kind }, i) => (
              <div key={i} className="welcome-day" data-day={kind}>
                <span className="welcome-caption">{day}</span>
                <span className="welcome-cell">
                  <span className="welcome-dot" />
                </span>
              </div>
            ))}
          </div>
          <div className="welcome-key welcome-caption">
            <span className="welcome-key-item" data-key="lift">
              <span className="welcome-key-dot" />
              Lift
            </span>
            <span className="welcome-key-item" data-key="run">
              <span className="welcome-key-dot" />
              Run
            </span>
          </div>
        </div>

        <div className="welcome-today welcome-rise bg-card">
          <img
            src={publicUrl(authArtPath(WELCOME_SESSION_EXERCISE))}
            alt=""
            draggable={false}
            decoding="async"
            className="welcome-today-art exercise-drawing"
          />
          <div>
            <p className="welcome-caption">Today</p>
            <p className="welcome-session">{EXAMPLE.session}</p>
            <p className="welcome-meta">
              {EXAMPLE.minutes} min · {EXAMPLE.lifts} lifts
            </p>
          </div>
        </div>

        <div className="welcome-target welcome-rise bg-card">
          <svg viewBox="0 0 100 100" className="welcome-ring">
            <circle
              cx="50"
              cy="50"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="11"
              style={{ stroke: "var(--ds-ring-track)" }}
            />
            <circle
              cx="50"
              cy="50"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="11"
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
              className="welcome-ring-arc"
              style={{
                stroke: "hsl(var(--nutrition))",
                strokeDasharray: `${RING_LENGTH * RING_SHARE} ${RING_LENGTH}`,
              }}
            />
          </svg>
          <p className="welcome-figure font-figure">
            {formatCalories(EXAMPLE.calories)}{" "}
            <span className="welcome-unit font-sans">{CALORIE_UNIT}</span>
          </p>
          <p className="welcome-note">a day, from your numbers</p>
        </div>
      </div>
    </div>
  );
}
