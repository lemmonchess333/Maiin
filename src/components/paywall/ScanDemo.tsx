import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { buttonClasses } from "@/components/ui/buttonClasses";
import MealMacroBar from "@/components/food/MealMacroBar";
import { CALORIE_UNIT } from "@/utils/formatNutrition";
import rigatoniUrl from "@/assets/pro-demo/rigatoni.webp";

/**
 * The scan, happening, on a real plate: the owner's photo of a
 * restaurant rigatoni moves like a live camera, the shutter takes it,
 * the scanner reads it, and the result sheet rises with what Pro found.
 * The chrome is drawn to match `FoodCameraModal` and the result sheet in
 * `FoodAnalyzer` (orange reticle and laser, the stage lines, calories
 * first, the P/C/F bar, an orange Log), so the demo is the product in
 * miniature rather than a picture of a feature.
 *
 * One clock: every layer runs on `LOOP`, so the surface has a single
 * ambient loop, and only opacity and transform ever animate (the
 * WKWebView-safe recipe). Reduced motion gets the settled result, which
 * is also what the screen reader's label describes.
 */

/** What the scanner said about this photo. The photo, its crop and where
 *  these numbers come from are recorded in src/assets/pro-demo/README.md. */
export const SCAN_DEMO_RESULT = {
  title: "Rigatoni with prawns",
  calories: 720,
  protein: 32,
  carbs: 95,
  fat: 24,
  meal: "Dinner",
} as const;

const LOOP_S = 8;
const LOOP = { duration: LOOP_S, repeat: Infinity } as const;
/** Seconds into the loop → keyframe time. */
const at = (s: number) => Math.min(1, Math.max(0, s / LOOP_S));
const times = (...s: number[]) => s.map(at);

/* The beats, in seconds. Aim with the camera, take it, read it, show it. */
const SHUTTER = 2;
const READ_FROM = 2.3;
const READ_SWITCH = 3.25;
const READ_TO = 4.15;
const DONE_TO = 4.75;
const SHEET_UP = 4.5;
const SHEET_DOWN = 7.4;

const laserTimes = times(
  0,
  READ_FROM - 0.05,
  READ_FROM,
  READ_SWITCH,
  READ_TO,
  LOOP_S
);

/** On between `from` and `to`, with a short fade either side. Opacity
 *  tracks stay linear: the browser runs opacity natively, and there a
 *  single ease bends the whole loop's timeline, not each step (an
 *  ease-out flash fired most of a second early). */
function shown(from: number, to: number, fade = 0.15) {
  return {
    opacity: [0, 0, 1, 1, 0, 0],
    times: times(0, from, from + fade, to, to + fade, LOOP_S),
  };
}

const CORNERS = [
  "top-3 left-3 border-t-[3px] border-l-[3px] rounded-tl-[14px]",
  "top-3 right-3 border-t-[3px] border-r-[3px] rounded-tr-[14px]",
  "bottom-3 left-3 border-b-[3px] border-l-[3px] rounded-bl-[14px]",
  "bottom-3 right-3 border-b-[3px] border-r-[3px] rounded-br-[14px]",
];

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white">
      {children}
    </span>
  );
}

export default function ScanDemo() {
  const live = !useReducedMotion();
  const r = SCAN_DEMO_RESULT;
  const aimCorners = {
    opacity: [1, 1, 0, 0, 1],
    times: times(0, SHUTTER, SHUTTER + 0.1, LOOP_S - 0.1, LOOP_S),
  };
  const readCorners = {
    opacity: [0, 0, 1, 1, 0],
    times: times(0, SHUTTER, SHUTTER + 0.1, LOOP_S - 0.1, LOOP_S),
  };

  return (
    <div
      className="relative aspect-square w-full overflow-hidden rounded-2xl bg-black"
      role="img"
      aria-label={`Sample: a meal photo of ${r.title.toLowerCase()}, read by Pro as ${r.calories} ${CALORIE_UNIT}, ${r.protein}g protein, ${r.carbs}g carbs and ${r.fat}g fat`}
    >
      <div aria-hidden="true" className="absolute inset-0">
        {/* The camera. Slightly oversized so the handheld drift never
            shows an edge; the drift stops when the shutter takes it. */}
        <div className="absolute inset-0 scale-[1.08]">
          <motion.img
            src={rigatoniUrl}
            alt=""
            draggable={false}
            className="size-full object-cover"
            animate={
              live
                ? { x: [0, -5, 3, -2, 0, 0], y: [0, 3, -2, 2, 0, 0] }
                : undefined
            }
            transition={
              live
                ? {
                    ...LOOP,
                    ease: "easeInOut",
                    times: times(0, 0.5, 1, 1.5, SHUTTER, LOOP_S),
                  }
                : undefined
            }
          />
        </div>

        {/* Reticle: white while aiming, the scanner's orange once the
            photo is taken. Reduced motion shows the orange, settled. */}
        {live &&
          CORNERS.map((corner) => (
            <motion.span
              key={`aim-${corner}`}
              data-beat="aim"
              className={cn("absolute size-7 border-white", corner)}
              animate={{ opacity: aimCorners.opacity }}
              transition={{ ...LOOP, ease: "linear", times: aimCorners.times }}
            />
          ))}
        {CORNERS.map((corner) => (
          <motion.span
            key={`read-${corner}`}
            className={cn("absolute size-7", corner)}
            style={{
              borderColor: THEME.semantic.nutrition,
              opacity: live ? 0 : 1,
            }}
            animate={live ? { opacity: readCorners.opacity } : undefined}
            transition={
              live
                ? { ...LOOP, ease: "linear", times: readCorners.times }
                : undefined
            }
          />
        ))}

        {live && (
          <>
            {/* Aim: the scanner's one instruction, and the shutter. */}
            <motion.div
              data-beat="aim"
              className="absolute inset-x-0 top-5 flex justify-center"
              animate={{ opacity: shown(0.3, SHUTTER - 0.1).opacity }}
              transition={{
                ...LOOP,
                ease: "linear",
                times: shown(0.3, SHUTTER - 0.1).times,
              }}
            >
              <Pill>Fit the whole plate in the frame</Pill>
            </motion.div>
            <motion.div
              data-beat="aim"
              className="absolute inset-x-0 bottom-5 flex justify-center"
              animate={{ opacity: [1, 1, 0, 0, 1] }}
              transition={{
                ...LOOP,
                ease: "linear",
                times: times(
                  0,
                  SHUTTER + 0.1,
                  SHUTTER + 0.3,
                  LOOP_S - 0.2,
                  LOOP_S
                ),
              }}
            >
              <span className="flex size-12 items-center justify-center rounded-full border-[3px] border-white/90">
                <motion.span
                  // eslint-disable-next-line no-restricted-syntax -- a camera shutter is white in both themes
                  className="size-9 rounded-full bg-white"
                  animate={{ scale: [1, 1, 0.8, 1, 1] }}
                  transition={{
                    ...LOOP,
                    ease: "easeInOut",
                    times: times(
                      0,
                      SHUTTER - 0.2,
                      SHUTTER,
                      SHUTTER + 0.2,
                      LOOP_S
                    ),
                  }}
                />
              </span>
            </motion.div>

            {/* The shutter's flash. */}
            <motion.div
              // eslint-disable-next-line no-restricted-syntax -- a camera flash is white in both themes
              className="absolute inset-0 bg-white"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0, 0.85, 0, 0] }}
              transition={{
                ...LOOP,
                ease: "linear",
                times: times(0, SHUTTER, SHUTTER + 0.05, SHUTTER + 0.4, LOOP_S),
              }}
            />

            {/* Reading: the photo dims so the laser reads on any plate
                (an orange line on orange pasta is invisible otherwise),
                and brightens again for the result. */}
            <motion.div
              data-beat="reading"
              className="absolute inset-0 bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: shown(SHUTTER + 0.2, SHEET_UP, 0.3).opacity }}
              transition={{
                ...LOOP,
                ease: "linear",
                times: shown(SHUTTER + 0.2, SHEET_UP, 0.3).times,
              }}
            />
            {/* The laser sweeps down and back, drawn as the scanner draws
                it: a grid mesh riding above the line, a soft band, the
                line and its glow. */}
            <motion.div
              data-beat="reading"
              className="absolute inset-0"
              initial={{ opacity: 0, y: "-100%" }}
              animate={{
                opacity: [0, 0, 1, 1, 0, 0],
                y: ["-100%", "-100%", "-100%", "0%", "-100%", "-100%"],
              }}
              transition={{
                y: { ...LOOP, ease: "easeInOut", times: laserTimes },
                opacity: { ...LOOP, ease: "linear", times: laserTimes },
              }}
            >
              <div
                className="absolute inset-x-0 -bottom-11 h-[88px] opacity-20"
                style={{
                  background: `repeating-linear-gradient(0deg, ${THEME.semantic.nutrition} 0 1px, transparent 1px 12px), repeating-linear-gradient(90deg, ${THEME.semantic.nutrition} 0 1px, transparent 1px 12px)`,
                  maskImage:
                    "linear-gradient(to bottom, transparent, black 35%, black 65%, transparent)",
                  WebkitMaskImage:
                    "linear-gradient(to bottom, transparent, black 35%, black 65%, transparent)",
                }}
              />
              <div
                className="absolute inset-x-0 -bottom-8 h-16 opacity-40"
                style={{
                  background: `linear-gradient(to bottom, transparent, ${THEME.semantic.nutrition}, transparent)`,
                }}
              />
              <div
                className="absolute inset-x-0 bottom-0 h-[3px]"
                style={{
                  background: THEME.semantic.nutrition,
                  boxShadow: `0 0 16px 3px ${THEME.semantic.nutrition}`,
                }}
              />
            </motion.div>
            <div className="absolute inset-x-0 bottom-6 flex justify-center">
              <motion.div
                data-beat="reading"
                className="absolute"
                initial={{ opacity: 0 }}
                animate={{
                  opacity: shown(READ_FROM, READ_SWITCH - 0.15).opacity,
                }}
                transition={{
                  ...LOOP,
                  ease: "linear",
                  times: shown(READ_FROM, READ_SWITCH - 0.15).times,
                }}
              >
                <Pill>Reading your plate…</Pill>
              </motion.div>
              <motion.div
                data-beat="reading"
                className="absolute"
                initial={{ opacity: 0 }}
                animate={{
                  opacity: shown(READ_SWITCH, READ_TO - 0.15).opacity,
                }}
                transition={{
                  ...LOOP,
                  ease: "linear",
                  times: shown(READ_SWITCH, READ_TO - 0.15).times,
                }}
              >
                <Pill>Counting the macros…</Pill>
              </motion.div>
              <motion.div
                data-beat="reading"
                className="absolute"
                initial={{ opacity: 0 }}
                animate={{ opacity: shown(READ_TO, DONE_TO - 0.15).opacity }}
                transition={{
                  ...LOOP,
                  ease: "linear",
                  times: shown(READ_TO, DONE_TO - 0.15).times,
                }}
              >
                <Pill>
                  <Check
                    className="size-3.5"
                    strokeWidth={3}
                    style={{ color: THEME.semantic.nutrition }}
                  />
                  Done
                </Pill>
              </motion.div>
            </div>
          </>
        )}

        {/* The result sheet, as FoodAnalyzer draws it: the dish, its
            calories first, the macro line and bar, and Log in food
            orange. A picture of a button, not a control. */}
        <motion.div
          data-beat={live ? "result" : undefined}
          className="absolute inset-x-0 bottom-0 space-y-2 rounded-t-2xl bg-card px-3 pt-2 pb-3"
          initial={live ? { y: "100%" } : false}
          animate={
            live
              ? { y: ["100%", "100%", "0%", "0%", "100%", "100%"] }
              : undefined
          }
          transition={
            live
              ? {
                  ...LOOP,
                  ease: ["linear", "easeOut", "linear", "easeIn", "linear"],
                  times: times(
                    0,
                    SHEET_UP,
                    SHEET_UP + 0.4,
                    SHEET_DOWN,
                    SHEET_DOWN + 0.4,
                    LOOP_S
                  ),
                }
              : undefined
          }
        >
          <div className="mx-auto h-1 w-8 rounded-full bg-border" />
          <div className="flex items-baseline justify-between gap-2">
            <p className="min-w-0 truncate text-sm font-bold text-foreground">
              {r.title}
            </p>
            <p className="shrink-0 text-foreground">
              <span className="text-xl font-extrabold font-mono tabular-nums">
                {r.calories}
              </span>
              <span className="text-xs text-muted-foreground">
                {" "}
                {CALORIE_UNIT}
              </span>
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            <span className="font-mono tabular-nums text-foreground">
              {r.protein}
            </span>
            g protein ·{" "}
            <span className="font-mono tabular-nums text-foreground">
              {r.carbs}
            </span>
            g carbs ·{" "}
            <span className="font-mono tabular-nums text-foreground">
              {r.fat}
            </span>
            g fat
          </p>
          <MealMacroBar
            totalProtein={r.protein}
            totalCarbs={r.carbs}
            totalFat={r.fat}
          />
          <span
            className={buttonClasses({
              variant: "nutrition",
              size: "sm",
              fullWidth: true,
              className: "pointer-events-none",
            })}
          >
            Log to {r.meal}
          </span>
        </motion.div>
      </div>
    </div>
  );
}
