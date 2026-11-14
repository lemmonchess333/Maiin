import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { motion, type Easing, type Transition } from "framer-motion";
import {
  Beef,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  Minus,
  PenLine,
  Plus,
  RefreshCw,
  Settings as SettingsIcon,
  Wheat,
  X,
} from "lucide-react";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { buttonClasses } from "@/components/ui/buttonClasses";
import MealMacroBar from "@/components/food/MealMacroBar";
import CalorieRing from "@/components/food/CalorieRing";
import FoodWeekStrip from "@/components/food/FoodWeekStrip";
import MacroColumn from "@/components/food/MacroColumn";
import { Avocado } from "@/components/icons/Avocado";
import { MEAL_SLOT_ICONS, type MealKey } from "@/components/food/mealConstants";
import {
  AnalyticsTabIcon,
  FoodTabIcon,
  HomeTabIcon,
  SocialTabIcon,
  TrainTabIcon,
} from "@/components/icons/TabIcons";
import { foodArtKindFor, foodArtUrl } from "@/lib/foodArt";
import { arcEndPoint, FLIGHT_MS, FLIGHT_WHEEL_HOLD_MS } from "@/lib/foodFlight";
import type { FoodWeekDay } from "@/lib/foodWeek";
import { CALORIE_UNIT } from "@/utils/formatNutrition";
import {
  formatShortWeekdayDayMonth,
  formatTimeOfDay,
} from "@/utils/formatters";
import rigatoniUrl from "@/assets/pro-demo/rigatoni.webp";

/**
 * A meal logged from a photo, start to finish, on a phone: it slides in
 * with the scanner open, the camera moves from the edge of the table to
 * the whole plate, the shutter takes it, the scanner reads it, the
 * result sheet rises over the Food page, Log is tapped, the food flies
 * to the day's wheel, the wheel takes the meal and the page scrolls to
 * the new diary row. Then the phone slides out and it starts again.
 *
 * Every screen is drawn as the app draws it: the camera chrome and the
 * reading overlay as `FoodCameraModal` does, the sheet as `FoodAnalyzer`
 * does, and the Food page as it has been since Food11, with its own
 * `CalorieRing`, `FoodWeekStrip` and `MacroColumn`, so the demo is the
 * product at a smaller size rather than a picture of a feature. A
 * change to the Food page's first screen is a change to make here too.
 *
 * The phone is laid out at its real size (a 390 × 844 screen) on a stage
 * of fixed proportions, and the stage scales that drawing to whatever
 * width it is given. One clock: every layer runs on `LOOP`, and only
 * opacity and transform animate (the WKWebView-safe recipe). Reduced
 * motion gets the result sheet, settled and close enough to read, which
 * is also what the screen reader's label describes.
 */

/** What the scanner said about this photo. Where the photo came from and
 *  where these numbers must come from: src/assets/pro-demo/README.md. */
const SCAN_DEMO_RESULT = {
  title: "Rigatoni with prawns",
  calories: 720,
  protein: 32,
  carbs: 95,
  fat: 24,
  meal: "Dinner",
  items: [
    { name: "Rigatoni", portion: "220 g", calories: 400 },
    { name: "Tomato cream sauce", portion: "120 g", calories: 210 },
    { name: "Prawns", portion: "100 g", calories: 110 },
  ],
} as const;

/** The day the meal lands in: the target and what was logged before it. */
const DAY = {
  target: 2336,
  before: { calories: 1412, protein: 96, carbs: 138, fat: 47 },
  targets: { protein: 160, carbs: 262, fat: 78 },
};
const AFTER = {
  calories: DAY.before.calories + SCAN_DEMO_RESULT.calories,
  protein: DAY.before.protein + SCAN_DEMO_RESULT.protein,
  carbs: DAY.before.carbs + SCAN_DEMO_RESULT.carbs,
  fat: DAY.before.fat + SCAN_DEMO_RESULT.fat,
};

/** A time on that day, printed as the diary prints one ("19:42"). */
function dayTime(hours: number, minutes: number): string {
  return formatTimeOfDay(new Date(2026, 0, 15, hours, minutes));
}
/** The moment the demo shows: the phone's clock, and when the scanned
 *  meal is logged. */
const NOW = dayTime(19, 42);
/** The day, as the Food page's header row prints it ("Thu 15 Jan"). */
const TODAY = formatShortWeekdayDayMonth(new Date(2026, 0, 15));

/* ── Geometry, in the phone's own pixels ─────────────────────────────── */

const SCREEN_W = 390;
const SCREEN_H = 844;
const BEZEL = 12;
const PHONE_W = SCREEN_W + 2 * BEZEL;
const PHONE_H = SCREEN_H + 2 * BEZEL;
/** The side buttons as they sit on a current iPhone Pro, in the phone's
 *  pixels: the Action button over volume up and down on the left; the
 *  side button on the right, and below it the Camera Control, near
 *  flush with the frame. */
const SIDE_BUTTONS = [
  { side: "left", top: 170, height: 44, flush: false },
  { side: "left", top: 252, height: 60, flush: false },
  { side: "left", top: 330, height: 60, flush: false },
  { side: "right", top: 262, height: 100, flush: false },
  { side: "right", top: 522, height: 92, flush: true },
] as const;
/** The stage: the phone is 58% of its width, and it is 5:6. */
const STAGE_W = 714;
const STAGE_H = 857;
const PHONE_LEFT = (STAGE_W - PHONE_W) / 2;
const PHONE_TOP = 22;
/** Where a phone point lands when the phone is moved by (y, zoom): the
 *  phone scales about its own centre. */
const PHONE_CY = PHONE_TOP + PHONE_H / 2;
function centreOn(phoneY: number, zoom: number) {
  return STAGE_H / 2 - PHONE_CY - zoom * (phoneY - PHONE_H / 2);
}

/* The camera. The photo is drawn so the bowl fills the screen's width,
   centred in the scanner's square frame (86% of the width, centred in
   the viewfinder above the controls, as the real frame is). */
const FRAME = SCREEN_W * 0.86;
const FRAME_TOP = (SCREEN_H - 196 - (32 + 12 + FRAME)) / 2 + 32 + 12;
const FRAME_CY = FRAME_TOP + FRAME / 2;
const PHOTO_K = 0.355; // screen px per photo px (the photo is 1200 × 1600)
const PHOTO_W = 1200 * PHOTO_K;
const PHOTO_H = 1600 * PHOTO_K;
const PHOTO_LEFT = SCREEN_W / 2 - 550 * PHOTO_K; // the bowl's centre, x
const PHOTO_TOP = FRAME_CY - 1085 * PHOTO_K; // and y
/** The camera looking at photo point (px, py) at `zoom`, placed at the
 *  frame's centre. The photo layer scales from its top-left corner. */
function lookAt(px: number, py: number, zoom: number) {
  return {
    x: SCREEN_W / 2 - PHOTO_LEFT - zoom * px * PHOTO_K,
    y: FRAME_CY - PHOTO_TOP - zoom * py * PHOTO_K,
  };
}
/* Start in the table's corner (the candle, the menus), come in close on
   the pasta, then pull back to the whole plate. */
const PAN_START = { x: -PHOTO_LEFT, y: -PHOTO_TOP, zoom: 2.6 };
const PAN_CLOSE = { ...lookAt(560, 1000, 1.6), zoom: 1.6 };

/* The Food page: how far it scrolls to show the diary, and where the
   phone comes in close. The scroll sets the diary's card down just above
   the tab bar, and the close-up frames the card with its new row in the
   upper half; both were measured with the rows as FoodRow draws them on a
   day with a photo (Pol1), under the page's first screen as it has been
   since Food11. */
const SCROLL_Y = -186;
/* Where the wheel and the composer's field stand on that page, in the
   screen's pixels, for the food's flight from one to the other. Measured
   on the page as it is drawn here: a unit test lays nothing out. */
const WHEEL_BOX = {
  left: (SCREEN_W - 264) / 2,
  top: 146,
  width: 264,
  height: 264,
};
const FIELD_BOX = { left: 16, top: 590, width: SCREEN_W - 32, height: 48 };
/** The flight, as `FoodLogFlight` flies it: a 44px picture from a third
 *  of the way along the field to where the wheel's arc ends before the
 *  meal. */
const FLIGHT_SIZE = 44;
const FLIGHT_START = {
  x: FIELD_BOX.left + FIELD_BOX.width / 3,
  y: FIELD_BOX.top + FIELD_BOX.height / 2,
};
const FLIGHT_END = arcEndPoint(WHEEL_BOX, DAY.before.calories, DAY.target);
const FLIGHT_EASE = [0.4, 0, 0.2, 1] as const;
/** What flies: our drawing of the dish, as the page reads it from the
 *  meal's names. */
const FLIGHT_ART = foodArtUrl(
  foodArtKindFor([
    SCAN_DEMO_RESULT.title,
    ...SCAN_DEMO_RESULT.items.map((item) => item.name),
  ])
);
const Z_SHEET = 1.4;
const Y_SHEET = centreOn(BEZEL + 612, Z_SHEET);
const Z_ROW = 1.35;
const Y_ROW = centreOn(BEZEL + 540, Z_ROW);
/** Off the stage, below and to one side, with no corner left showing:
 *  in from the bottom right, out to the bottom left. */
const OFF_X = 560;
const OFF_Y = STAGE_H - PHONE_TOP + 40;

/* ── Time ────────────────────────────────────────────────────────────── */

const LOOP_S = 12;
const LOOP = { duration: LOOP_S, repeat: Infinity } as const;
/** Seconds into the loop → keyframe time. */
const at = (s: number) => Math.min(1, Math.max(0, s / LOOP_S));
const times = (...s: number[]) => s.map(at);

const PHONE_IN = 0.8;
const PAN_FROM = 0.9;
const PAN_MID = 1.9;
const PAN_TO = 2.8;
const SHUTTER = 3.2;
const READ = 3.35;
const STAGE_2 = 3.95;
const STAGE_3 = 4.45;
const DONE = 4.95;
const CAMERA_CLOSE = 5.35;
const SHEET_UP = 5.45;
const ZOOM_IN = 5.95;
const TAP = 7.15;
const SAVED = 7.35;
const SHEET_DOWN = 7.75;
/* The food leaves the field once the phone has drawn back from the
   sheet, and the wheel waits for it as the page's does: it takes the
   meal while the picture is still fading into it. */
const FLY = 8.15;
const FLIGHT_S = FLIGHT_MS / 1000;
const COUNT = FLY + FLIGHT_WHEEL_HOLD_MS / 1000;
const SCROLL_FROM = 8.9;
const SCROLL_TO = 9.6;
const ROW_IN = 9.65;
const PHONE_OUT = 11;
const PHONE_GONE = 11.6;

type Track = { animate: { opacity: number[] }; transition: Transition };

/** On between `from` and `to`, with a short fade either side. Opacity
 *  tracks stay linear: the browser runs opacity natively, and there a
 *  single ease bends the whole loop's timeline, not each step (an
 *  ease-out flash fired most of a second early). */
function shown(from: number, to: number, fade = 0.15): Track {
  return {
    animate: { opacity: [0, 0, 1, 1, 0, 0] },
    transition: {
      ...LOOP,
      ease: "linear",
      times: times(0, from, from + fade, to, to + fade, LOOP_S),
    },
  };
}
/** Off until `from`, then on for the rest of the loop. */
function from(s: number, fade = 0.2): Track {
  return {
    animate: { opacity: [0, 0, 1, 1] },
    transition: {
      ...LOOP,
      ease: "linear",
      times: times(0, s, s + fade, LOOP_S),
    },
  };
}
/** On until `to`, then off for the rest of the loop. */
function until(s: number, fade = 0.2): Track {
  return {
    animate: { opacity: [1, 1, 0, 0] },
    transition: {
      ...LOOP,
      ease: "linear",
      times: times(0, s, s + fade, LOOP_S),
    },
  };
}

/* ── Pieces ──────────────────────────────────────────────────────────── */

/** The status bar's type: the system face, as iOS draws it (San
 *  Francisco on an Apple device), falling back to the app's own. */
const SYSTEM_FONT = "-apple-system, BlinkMacSystemFont, var(--font-display)";

/** iOS's status bar on a Dynamic Island iPhone: the time centred in the
 *  space left of the island, the signal, Wi-Fi and battery glyphs
 *  centred in the space right of it, both level with the island's
 *  middle. */
function StatusBar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "absolute inset-x-0 top-[11px] flex h-9 items-center justify-between",
        className
      )}
      style={{ fontFamily: SYSTEM_FONT }}
    >
      <span className="flex w-[130px] justify-center text-base font-semibold tracking-tight">
        {NOW}
      </span>
      <span className="flex w-[130px] items-center justify-center gap-[5px]">
        <SignalGlyph />
        <WifiGlyph />
        <BatteryGlyph />
      </span>
    </div>
  );
}

/** Four solid bars, rising left to right: full signal. */
function SignalGlyph() {
  return (
    <svg viewBox="0 0 17 11" className="h-[11px] w-[17px]" fill="currentColor">
      <rect x="0" y="7" width="3" height="4" rx="1" />
      <rect x="4.67" y="4.67" width="3" height="6.33" rx="1" />
      <rect x="9.33" y="2.33" width="3" height="8.67" rx="1" />
      <rect x="14" y="0" width="3" height="11" rx="1" />
    </svg>
  );
}

/** The Wi-Fi fan: a quarter circle opening upwards, cut into a point
 *  and two bands. */
function WifiGlyph() {
  return (
    <svg
      viewBox="0 0 16 12"
      className="h-3 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth={2.2}
    >
      <path d="M1.5 4.7A9.2 9.2 0 0 1 14.5 4.7" />
      <path d="M3.83 7.03A5.9 5.9 0 0 1 12.17 7.03" />
      <path
        d="M8 11.2 5.67 8.87A3.3 3.3 0 0 1 10.33 8.87Z"
        fill="currentColor"
        strokeLinejoin="round"
        strokeWidth={0.8}
      />
    </svg>
  );
}

/** The battery with its percentage inside, as iOS shows it when the
 *  percentage is on: the charge solid, the rest of the body faint, the
 *  number cut out of both, and the terminal on the right. */
const BATTERY_PERCENT = 80;
function BatteryGlyph() {
  const cutout = `battery-${useId().replace(/[^\w-]/g, "")}`;
  return (
    <svg viewBox="0 0 27 13" className="h-[13px] w-[27px]" fill="currentColor">
      <mask id={cutout}>
        <rect width="24" height="13" fill="white" />
        <text
          x="12"
          y="10.1"
          fill="black"
          fontSize="10.5"
          fontWeight={700}
          letterSpacing="-0.3"
          textAnchor="middle"
          style={{ fontFamily: SYSTEM_FONT }}
        >
          {BATTERY_PERCENT}
        </text>
      </mask>
      <g mask={`url(#${cutout})`}>
        <rect width="24" height="13" rx="4" fillOpacity={0.35} />
        <path
          d={`M4 0h${(24 * BATTERY_PERCENT) / 100 - 4}v13H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4Z`}
        />
      </g>
      <path
        d="M25 4.25h.5A1.5 1.5 0 0 1 27 5.75v1.5a1.5 1.5 0 0 1-1.5 1.5H25Z"
        fillOpacity={0.4}
      />
    </svg>
  );
}

/** The home indicator iOS draws at the foot of the screen. */
function HomeIndicator({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "absolute bottom-2 left-1/2 h-[5px] w-[134px] -translate-x-1/2 rounded-full",
        className
      )}
    />
  );
}

const CAMERA_CORNERS = [
  "top-0 left-0 border-l-[3px] border-t-[3px] rounded-tl-2xl",
  "top-0 right-0 border-r-[3px] border-t-[3px] rounded-tr-2xl",
  "bottom-0 left-0 border-l-[3px] border-b-[3px] rounded-bl-2xl",
  "bottom-0 right-0 border-r-[3px] border-b-[3px] rounded-br-2xl",
];
const READ_CORNERS = [
  "-top-1 -left-1 border-t-[3px] border-l-[3px] rounded-tl-[20px]",
  "-top-1 -right-1 border-t-[3px] border-r-[3px] rounded-tr-[20px]",
  "-bottom-1 -left-1 border-b-[3px] border-l-[3px] rounded-bl-[20px]",
  "-bottom-1 -right-1 border-b-[3px] border-r-[3px] rounded-br-[20px]",
];
const STAGE_LINES = [
  { text: "Reading your plate…", from: READ + 0.1, to: STAGE_2 },
  { text: "Spotting ingredients…", from: STAGE_2, to: STAGE_3 },
  { text: "Counting the macros…", from: STAGE_3, to: DONE },
];

/** The scanner, open on Meal: the camera finds the plate, the shutter
 *  takes it, and the reading overlay reads it. */
function CameraScreen() {
  const laserTimes = times(0, READ + 0.1, 4.2, DONE - 0.05, LOOP_S);
  const laserFade = times(
    0,
    READ + 0.05,
    READ + 0.15,
    DONE - 0.1,
    DONE,
    LOOP_S
  );
  const pan = times(0, PAN_FROM, PAN_MID, PAN_TO, 3.0, 3.1, SHUTTER, LOOP_S);
  return (
    <motion.div
      className="absolute inset-0 z-30 overflow-hidden bg-black text-white"
      animate={{ opacity: [1, 1, 0, 0, 1] }}
      transition={{
        ...LOOP,
        ease: "linear",
        times: times(
          0,
          CAMERA_CLOSE,
          CAMERA_CLOSE + 0.15,
          LOOP_S - 0.05,
          LOOP_S
        ),
      }}
    >
      {/* The live camera: a handheld pan from the corner of the table to
          the whole plate, a little drift, then still for the shutter. */}
      <motion.img
        src={rigatoniUrl}
        alt=""
        draggable={false}
        className="absolute max-w-none origin-top-left object-cover"
        style={{
          left: PHOTO_LEFT,
          top: PHOTO_TOP,
          width: PHOTO_W,
          height: PHOTO_H,
          maskImage: "linear-gradient(to bottom, black 88%, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, black 88%, transparent)",
        }}
        animate={{
          x: [PAN_START.x, PAN_START.x, PAN_CLOSE.x, 0, 1.5, -1, 0, 0],
          y: [PAN_START.y, PAN_START.y, PAN_CLOSE.y, 0, -1, 0.5, 0, 0],
          scale: [
            PAN_START.zoom,
            PAN_START.zoom,
            PAN_CLOSE.zoom,
            1,
            1,
            1,
            1,
            1,
          ],
        }}
        transition={{ ...LOOP, ease: "easeInOut", times: pan }}
      />

      <StatusBar className="z-10 text-white" />
      <HomeIndicator className="z-10 bg-stage-foreground" />
      <span className="absolute left-4 top-[58px] flex size-11 items-center justify-center rounded-full bg-black/50">
        <X className="size-5" />
      </span>

      {/* The mode's one instruction, above the square Meal frame. */}
      <div
        data-beat="aim"
        className="absolute inset-x-0 top-0 flex flex-col items-center justify-center gap-3"
        style={{ height: SCREEN_H - 196 }}
      >
        <span className="relative z-10 flex h-8 items-center">
          <span className="whitespace-nowrap rounded-full bg-black/60 px-3.5 py-1.5 text-sm font-medium">
            Fit the whole plate in the frame
          </span>
        </span>
        <span
          className="relative aspect-square rounded-3xl shadow-[0_0_0_9999px_rgba(0,0,0,0.18)]"
          style={{ width: FRAME }}
        >
          {CAMERA_CORNERS.map((corner) => (
            <span
              key={corner}
              className={cn("absolute size-8 border-white/90", corner)}
            />
          ))}
        </span>
      </div>

      {/* The controls, on the dark band the real scanner puts behind
          them: Meal, Barcode, Label, then library · shutter · flip. */}
      <div className="absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/85 via-black/60 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 space-y-4 p-4 pb-8">
        <div className="mx-auto flex w-fit gap-1 rounded-full bg-white/10 p-1">
          {["Meal", "Barcode", "Label"].map((label) => (
            <span
              key={label}
              className={cn(
                "inline-flex min-h-11 min-w-[84px] items-center justify-center rounded-full px-4 text-sm",
                label === "Meal"
                  ? "bg-stage-foreground font-semibold text-stage"
                  : "font-medium text-white/85"
              )}
            >
              {label}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <span className="flex size-12 items-center justify-center rounded-full bg-black/50">
            <ImageIcon className="size-5" />
          </span>
          <span
            className="flex size-[72px] items-center justify-center rounded-full border-[5px]"
            style={{ borderColor: THEME.food.scan }}
          >
            <motion.span
              // eslint-disable-next-line no-restricted-syntax -- a camera shutter is white in both themes
              className="size-[60px] rounded-full bg-white"
              animate={{ scale: [1, 1, 0.86, 1, 1] }}
              transition={{
                ...LOOP,
                ease: "easeInOut",
                times: times(
                  0,
                  SHUTTER - 0.15,
                  SHUTTER,
                  SHUTTER + 0.15,
                  LOOP_S
                ),
              }}
            />
          </span>
          <span className="flex size-12 items-center justify-center rounded-full bg-black/50">
            <RefreshCw className="size-5" />
          </span>
        </div>
      </div>

      {/* The shutter's flash. */}
      <motion.div
        // eslint-disable-next-line no-restricted-syntax -- a camera flash is white in both themes
        className="absolute inset-0 bg-white"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 0.85, 0, 0] }}
        transition={{
          ...LOOP,
          ease: "linear",
          times: times(0, SHUTTER, SHUTTER + 0.05, SHUTTER + 0.35, LOOP_S),
        }}
      />

      {/* Reading, as the scanner draws it: the still over its own
          blurred colours, orange corners, the laser, the stage lines. */}
      <motion.div
        data-beat="reading"
        className="absolute inset-0 isolate flex flex-col items-center justify-center gap-6 overflow-hidden bg-black/85 px-8"
        initial={{ opacity: 0 }}
        {...from(READ, 0.12)}
      >
        <div className="absolute inset-0 -z-10">
          <img
            src={rigatoniUrl}
            alt=""
            className="size-full scale-125 object-cover"
            style={{ filter: "blur(52px) brightness(0.72) saturate(1.35)" }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/25 to-black/60" />
        </div>
        <div className="relative aspect-[4/5] w-full max-w-[340px]">
          <img
            src={rigatoniUrl}
            alt=""
            className="absolute inset-0 size-full rounded-3xl object-cover shadow-2xl shadow-black/60 ring-1 ring-white/10"
          />
          {READ_CORNERS.map((corner) => (
            <span
              key={corner}
              className={cn("absolute size-8", corner)}
              style={{ borderColor: THEME.semantic.nutrition }}
            />
          ))}
          <div className="absolute inset-0 overflow-hidden rounded-3xl">
            <motion.div
              className="absolute inset-0"
              initial={{ opacity: 0, y: "-100%" }}
              animate={{
                opacity: [0, 0, 1, 1, 0, 0],
                y: ["-100%", "-100%", "0%", "-100%", "-100%"],
              }}
              transition={{
                y: { ...LOOP, ease: "easeInOut", times: laserTimes },
                opacity: { ...LOOP, ease: "linear", times: laserFade },
              }}
            >
              <div
                className="absolute inset-x-0 -bottom-11 h-[88px] opacity-15"
                style={{
                  background: `repeating-linear-gradient(0deg, ${THEME.semantic.nutrition} 0 1px, transparent 1px 12px), repeating-linear-gradient(90deg, ${THEME.semantic.nutrition} 0 1px, transparent 1px 12px)`,
                  maskImage:
                    "linear-gradient(to bottom, transparent, black 35%, black 65%, transparent)",
                  WebkitMaskImage:
                    "linear-gradient(to bottom, transparent, black 35%, black 65%, transparent)",
                }}
              />
              <div
                className="absolute inset-x-0 -bottom-8 h-16 opacity-35"
                style={{
                  background: `linear-gradient(to bottom, transparent, ${THEME.semantic.nutrition}, transparent)`,
                }}
              />
              <div
                className="absolute inset-x-0 bottom-0 h-[2.5px] opacity-90"
                style={{
                  background: THEME.semantic.nutrition,
                  boxShadow: `0 0 12px 2px ${THEME.semantic.nutrition}`,
                }}
              />
            </motion.div>
          </div>
        </div>
        <div className="relative flex h-5 w-full items-center justify-center">
          {STAGE_LINES.map((line) => (
            <motion.p
              key={line.text}
              className="absolute text-base font-semibold"
              initial={{ opacity: 0 }}
              {...shown(line.from, line.to - 0.12, 0.12)}
            >
              {line.text}
            </motion.p>
          ))}
          <motion.p
            className="absolute inline-flex items-center gap-1.5 text-base font-semibold"
            style={{ color: THEME.semantic.nutrition }}
            initial={{ opacity: 0 }}
            {...from(DONE, 0.12)}
          >
            <Check className="size-4" strokeWidth={3} />
            Done
          </motion.p>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** The result sheet, as FoodAnalyzer draws it, over the dimmed page. */
function ResultSheet({ live }: { live: boolean }) {
  const r = SCAN_DEMO_RESULT;
  const sheetTimes = times(
    0,
    SHEET_UP,
    SHEET_UP + 0.4,
    SHEET_DOWN,
    SHEET_DOWN + 0.35,
    LOOP_S
  );
  return (
    <>
      <motion.div
        className="absolute inset-0 z-20 bg-black/50"
        style={live ? undefined : { opacity: 1 }}
        initial={live ? { opacity: 0 } : false}
        {...(live ? shown(CAMERA_CLOSE, SHEET_DOWN, 0.3) : {})}
      />
      <motion.div
        data-beat={live ? "result" : undefined}
        className="absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl bg-background pb-[34px]"
        initial={live ? { y: "100%" } : false}
        animate={
          live ? { y: ["100%", "100%", "0%", "0%", "100%", "100%"] } : undefined
        }
        transition={
          live
            ? {
                ...LOOP,
                ease: ["linear", "easeOut", "linear", "easeIn", "linear"],
                times: sheetTimes,
              }
            : undefined
        }
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>
        <div className="space-y-4 px-4 pt-2 pb-4">
          <div className="flex items-center gap-3">
            <img
              src={rigatoniUrl}
              alt=""
              className="size-16 shrink-0 rounded-xl bg-muted object-cover"
            />
            <div className="min-w-0">
              <p className="text-lg font-bold text-foreground">{r.title}</p>
              <p className="truncate text-sm text-muted-foreground">
                AI estimate · check the portions
              </p>
            </div>
          </div>
          <div className="space-y-2 rounded-xl bg-muted/30 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="text-foreground">
                <span className="text-xl font-extrabold font-figure tabular-nums">
                  {r.calories}
                </span>
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  {CALORIE_UNIT}
                </span>
              </p>
              <p className="text-small text-muted-foreground">
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
            </div>
            <MealMacroBar
              totalProtein={r.protein}
              totalCarbs={r.carbs}
              totalFat={r.fat}
            />
          </div>
          <div className="space-y-2 border-t border-border/40 pt-3">
            {r.items.map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {item.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.portion} ·{" "}
                    <span className="font-mono tabular-nums">
                      {item.calories}
                    </span>{" "}
                    {CALORIE_UNIT}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1">
                  <span className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Minus className="size-3.5" />
                  </span>
                  <span className="w-9 text-center font-mono text-xs tabular-nums text-foreground">
                    1×
                  </span>
                  <span className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Plus className="size-3.5" />
                  </span>
                </span>
                <span className="ml-2 flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground">
                  <X className="size-3.5" />
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-border/40 px-4 pt-3 pb-4">
          <span className={buttonClasses({ variant: "secondary", size: "lg" })}>
            Retake
          </span>
          <span
            className={buttonClasses({
              variant: "nutrition",
              size: "lg",
              className: "relative flex-1 overflow-hidden",
            })}
          >
            Log to {r.meal}
            {live && (
              <>
                <motion.span
                  className="absolute inset-0 flex items-center justify-center gap-2"
                  style={{ background: THEME.success }}
                  initial={{ opacity: 0 }}
                  {...shown(SAVED, SHEET_DOWN + 0.4, 0.1)}
                >
                  <Check className="size-4" /> Saved
                </motion.span>
                {/* The tap. */}
                <motion.span
                  className="absolute left-1/2 top-1/2 -ml-8 -mt-8 size-16 rounded-full bg-stage-foreground/60"
                  initial={{ opacity: 0 }}
                  animate={{
                    opacity: [0, 0, 0.6, 0, 0],
                    scale: [0.4, 0.4, 0.8, 1.6, 1.6],
                  }}
                  transition={{
                    opacity: {
                      ...LOOP,
                      ease: "linear",
                      times: times(0, TAP - 0.1, TAP, TAP + 0.35, LOOP_S),
                    },
                    scale: {
                      ...LOOP,
                      ease: "easeOut",
                      times: times(0, TAP - 0.1, TAP, TAP + 0.35, LOOP_S),
                    },
                  }}
                />
              </>
            )}
          </span>
        </div>
      </motion.div>
    </>
  );
}

/* ── The Food page ───────────────────────────────────────────────────── */

/** The demo's day is a Thursday. Its week, Monday to Sunday as the Food
 *  page's strip is: what was eaten on the days before it, as a share of
 *  the target. */
const WEEK_BEFORE_TODAY = [0.86, 0.97, 0.9];
const TODAY_INDEX = WEEK_BEFORE_TODAY.length;

/** The week as the Food page's strip takes it, with `todayCalories`
 *  logged today. */
function weekDays(todayCalories: number): FoodWeekDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const isToday = i === TODAY_INDEX;
    const isFuture = i > TODAY_INDEX;
    const eaten = isToday
      ? todayCalories
      : isFuture
        ? 0
        : Math.round(WEEK_BEFORE_TODAY[i] * DAY.target);
    return {
      key: `2026-01-${12 + i}`,
      isToday,
      isSelected: isToday,
      isFuture,
      isSelectable: !isFuture,
      eaten,
      target: DAY.target,
      progress: eaten / DAY.target,
      over: 0,
      beforeJoined: false,
    };
  });
}

/** Before the meal, then after it: two copies of a thing, the second
 *  taking over when the meal is counted. */
function BeforeAfter({
  live,
  before,
  after,
  className,
}: {
  live: boolean;
  before: ReactNode;
  after: ReactNode;
  className?: string;
}) {
  if (!live) return <div className={className}>{before}</div>;
  return (
    <div className={cn("grid", className)}>
      <motion.div className="col-start-1 row-start-1" {...until(COUNT)}>
        {before}
      </motion.div>
      <motion.div
        className="col-start-1 row-start-1"
        initial={{ opacity: 0 }}
        {...from(COUNT)}
      >
        {after}
      </motion.div>
    </div>
  );
}

/** The calorie wheel as the Food page draws it (Food11): on the page,
 *  with the target in its label, and already drawn. */
function Wheel({ calories }: { calories: number }) {
  return (
    <CalorieRing
      consumed={calories}
      target={DAY.target}
      mode="left"
      onToggleMode={() => {}}
      trajectoryLabel={null}
      drawIn={false}
    />
  );
}

/** The macros as the Food page draws them: one row, no boxes. */
function Macros({ totals }: { totals: typeof AFTER }) {
  const macros = [
    { key: "protein", Icon: Beef, label: "Protein" },
    { key: "carbs", Icon: Wheat, label: "Carbs" },
    { key: "fat", Icon: Avocado, label: "Fat" },
  ] as const;
  return (
    <div className="grid grid-cols-3 gap-x-4">
      {macros.map(({ key, Icon, label }) => (
        <MacroColumn
          key={key}
          size="row"
          macroKey={key}
          Icon={Icon}
          consumed={totals[key]}
          target={DAY.targets[key]}
          label={label}
          color={THEME.macros[key]}
          mode="left"
          drawIn={false}
        />
      ))}
    </div>
  );
}

/** A diary row's height with its line: a 52px picture, 10px above and
 *  below it, and the 1px line under the new row. */
const LOG_ROW_H = 52 + 2 * 10 + 1;

function LogRow({
  name,
  meal,
  slot,
  time,
  calories,
  photo,
}: {
  name: string;
  meal: string;
  slot: MealKey;
  time: string;
  calories: number;
  photo?: boolean;
}) {
  /* FoodRow's row on a day with a photo (Pol1): the photo as a thumbnail
     at the start of the row, or the slot's tile where there is none, then
     the name, when and calories, the caption drawn as FoodTimeline draws
     it. */
  const SlotIcon = MEAL_SLOT_ICONS[slot];
  return (
    <div className="flex items-center gap-3 py-2.5">
      {photo ? (
        <img
          src={rigatoniUrl}
          alt=""
          className="size-[52px] shrink-0 rounded-xl object-cover"
        />
      ) : (
        <span className="flex size-[52px] shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <SlotIcon className="size-5" strokeWidth={1.75} />
        </span>
      )}
      <div className="flex min-w-0 flex-1 items-center justify-between">
        <div className="mr-2 min-w-0 flex-1">
          <p className="truncate text-sm text-foreground">{name}</p>
          <p className="mt-0.5 truncate text-caption text-muted-foreground">
            {meal}
            {" · "}
            <span className="font-mono tabular-nums">{time}</span>
          </p>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          <span className="font-mono tabular-nums">{calories}</span>{" "}
          {CALORIE_UNIT}
        </span>
      </div>
    </div>
  );
}

const TABS = [
  { label: "Home", Icon: HomeTabIcon },
  { label: "Train", Icon: TrainTabIcon },
  { label: "Food", Icon: FoodTabIcon },
  { label: "Social", Icon: SocialTabIcon },
  { label: "Analytics", Icon: AnalyticsTabIcon },
];

/** The logged food's picture on its way to the wheel, as `FoodLogFlight`
 *  draws it on the Food page: our drawing of the food, rising from the
 *  field to the end of the wheel's arc and fading into it while the
 *  wheel takes the meal. It is placed where it lands and moved back to
 *  where it starts, as the page's own is. */
function Flight() {
  const dx = FLIGHT_START.x - FLIGHT_END.x;
  const dy = FLIGHT_START.y - FLIGHT_END.y;
  const move = {
    ...LOOP,
    ease: ["linear", FLIGHT_EASE, "linear"] as Easing[],
    times: times(0, FLY, FLY + FLIGHT_S, LOOP_S),
  };
  return (
    <motion.img
      src={FLIGHT_ART}
      alt=""
      draggable={false}
      className="pointer-events-none absolute z-10 object-contain"
      style={{
        left: FLIGHT_END.x - FLIGHT_SIZE / 2,
        top: FLIGHT_END.y - FLIGHT_SIZE / 2,
        width: FLIGHT_SIZE,
        height: FLIGHT_SIZE,
      }}
      initial={{ opacity: 0 }}
      animate={{
        x: [dx, dx, 0, 0],
        y: [dy, dy, 0, 0],
        scale: [1, 1, 0.45, 0.45],
        opacity: [0, 0, 1, 1, 0, 0],
      }}
      transition={{
        x: move,
        y: move,
        scale: move,
        /* The page's own keyframes: in by 14% of the flight, out from
           76%. */
        opacity: {
          ...LOOP,
          ease: "linear",
          times: times(
            0,
            FLY,
            FLY + 0.14 * FLIGHT_S,
            FLY + 0.76 * FLIGHT_S,
            FLY + FLIGHT_S,
            LOOP_S
          ),
        },
      }}
    />
  );
}

/** The Food page the scanner closes onto, as the app draws it since
 *  Food11: no title, the day in the header row, the calorie wheel on the
 *  page with its target, the week as bars, the macros as one row, and
 *  one field holding the text and the camera. The food flies
 *  to the wheel, the wheel, the week and the macros take the meal, then
 *  the page scrolls to the new row in the food log. */
function FoodScreen({ live }: { live: boolean }) {
  const r = SCAN_DEMO_RESULT;
  return (
    <div
      data-screen="food"
      className="absolute inset-0 overflow-hidden bg-background text-foreground"
    >
      <motion.div
        className="space-y-4 px-4 pt-[78px]"
        animate={live ? { y: [0, 0, SCROLL_Y, SCROLL_Y] } : undefined}
        transition={
          live
            ? {
                ...LOOP,
                ease: "easeInOut",
                times: times(0, SCROLL_FROM, SCROLL_TO, LOOP_S),
              }
            : undefined
        }
      >
        {/* The header row, as PageShell and FoodDateBar draw it: the day
            with its arrows, and the targets gear at the other end. There
            is no day after today, so that arrow is faded. */}
        <div className="flex items-center justify-between py-1">
          <span className="-ml-[12px] inline-flex items-center">
            <span className="flex size-[44px] items-center justify-center">
              <ChevronLeft className="size-5 text-muted-foreground" />
            </span>
            <span className="flex items-baseline gap-x-1.5 px-0.5">
              <span className="text-base font-bold">Today</span>
              <span className="text-sm font-medium text-muted-foreground">
                {TODAY}
              </span>
            </span>
            <span className="flex size-[44px] items-center justify-center opacity-40">
              <ChevronRight className="size-5 text-muted-foreground" />
            </span>
          </span>
          <span className="-mr-[12px] flex size-[44px] items-center justify-center text-muted-foreground">
            <SettingsIcon className="size-5" />
          </span>
        </div>
        <div className="space-y-2">
          {/* The wheel on the page, in its one soft light, with Details
              under it (FoodHeroCard). */}
          <div className="relative flex flex-col items-center">
            <div className="food-hero-glow pointer-events-none absolute inset-x-[-16px] top-[-38px] h-[340px]" />
            <BeforeAfter
              live={live}
              className="relative w-full"
              before={<Wheel calories={DAY.before.calories} />}
              after={<Wheel calories={AFTER.calories} />}
            />
            <span className="relative flex min-h-[44px] items-center gap-1 px-3 text-sm font-medium">
              Details
              <ChevronRight className="size-4" />
            </span>
          </div>
          <BeforeAfter
            live={live}
            before={
              <FoodWeekStrip
                days={weekDays(DAY.before.calories)}
                onSelect={() => {}}
              />
            }
            after={
              <FoodWeekStrip
                days={weekDays(AFTER.calories)}
                onSelect={() => {}}
              />
            }
          />
          <BeforeAfter
            live={live}
            before={<Macros totals={DAY.before} />}
            after={<Macros totals={AFTER} />}
          />
        </div>
        {/* The composer's field at rest (FoodComposerCard): the pencil,
            the prompt, and the camera at its end. It asks for no meal. */}
        <div className="relative flex items-stretch">
          <div className="ds-input-box absolute inset-0" />
          <span className="relative flex size-[44px] shrink-0 items-center justify-center self-center text-muted-foreground">
            <PenLine className="size-4" />
          </span>
          <span className="relative flex min-h-[48px] min-w-0 flex-1 items-center pl-0.5 text-sm text-muted-foreground">
            Describe a meal
          </span>
          <span className="relative flex size-[48px] shrink-0 items-center justify-center self-center text-nutrition-strong">
            <Camera className="size-[24px]" />
          </span>
        </div>
        <div className="rounded-2xl bg-card p-4 card-shadow">
          <BeforeAfter
            live={live}
            before={
              <p className="text-sm font-medium text-muted-foreground">
                Food log · 3 items
              </p>
            }
            after={
              <p className="text-sm font-medium text-muted-foreground">
                Food log · 4 items
              </p>
            }
          />
          {/* The new row, there once the meal is counted. Reduced motion
              shows the moment before Log, so the row is not there yet. */}
          {live && (
            <motion.div
              data-beat="logged"
              className="border-b border-border/40"
              initial={{ opacity: 0 }}
              {...from(COUNT)}
            >
              <LogRow
                photo
                name={r.title}
                meal={r.meal}
                slot="dinner"
                time={NOW}
                calories={r.calories}
              />
            </motion.div>
          )}
          {/* The day's earlier rows stand under the heading until the
              meal is counted, then move down a row for it, as the diary's
              do. The new row's room is always there (a height cannot be
              animated here), so without the move the card showed a gap
              where the row was going to be: it is on the first screen
              since Food11, where it was behind the tab bar before. */}
          <motion.div
            initial={live ? { y: -LOG_ROW_H } : false}
            animate={live ? { y: [-LOG_ROW_H, -LOG_ROW_H, 0, 0] } : undefined}
            transition={
              live
                ? {
                    ...LOOP,
                    ease: "easeInOut",
                    times: times(0, COUNT, COUNT + 0.2, LOOP_S),
                  }
                : undefined
            }
          >
            <LogRow
              name="Greek yogurt"
              meal="Snacks"
              slot="snacks"
              time={dayTime(16, 24)}
              calories={180}
            />
            <div className="border-t border-border/40">
              <LogRow
                name="Chicken & rice"
                meal="Lunch"
                slot="lunch"
                time={dayTime(13, 17)}
                calories={650}
              />
            </div>
          </motion.div>
        </div>
      </motion.div>

      {live && <Flight />}

      {/* Fixed chrome: a strip of page colour under the status bar, and
          the floating tab bar. */}
      <div className="absolute inset-x-0 top-0 h-[54px] bg-background" />
      <div className="absolute inset-x-3 bottom-[34px]">
        <div
          className="flex items-stretch rounded-full border border-border/60 dark:border-0 p-1 card-shadow"
          style={{ background: "var(--surface-solid)" }}
        >
          {TABS.map(({ label, Icon }) => {
            const active = label === "Food";
            return (
              <span
                key={label}
                className={cn(
                  "relative flex min-h-[54px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-full py-1.5 text-xs font-medium",
                  active
                    ? "bottom-nav-pill bottom-nav-link--active"
                    : "text-foreground"
                )}
              >
                <Icon active={active} className="size-6" />
                {label}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Scales the phone drawing to the stage's width without a re-render. */
function useStageScale(ref: React.RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () =>
      el.style.setProperty(
        "--scan-demo-scale",
        String(el.clientWidth / STAGE_W)
      );
    apply();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
}

export default function ScanDemo() {
  const live = !useReducedMotion();
  const r = SCAN_DEMO_RESULT;
  const stageRef = useRef<HTMLDivElement>(null);
  useStageScale(stageRef);
  const phoneTimes = times(
    0,
    PHONE_IN,
    ZOOM_IN,
    ZOOM_IN + 0.5,
    SHEET_DOWN,
    SHEET_DOWN + 0.4,
    ROW_IN,
    ROW_IN + 0.45,
    PHONE_OUT,
    PHONE_GONE,
    LOOP_S
  );
  const phoneEase: Easing[] = [
    "easeOut",
    "linear",
    "easeInOut",
    "linear",
    "easeInOut",
    "linear",
    "easeInOut",
    "linear",
    "easeIn",
    "linear",
  ];

  return (
    <div
      ref={stageRef}
      className="relative aspect-[5/6] w-full overflow-hidden rounded-2xl bg-nutrition/10"
      role="img"
      aria-label={`Sample: a meal photo of ${r.title.toLowerCase()}, read by Pro as ${r.calories} ${CALORIE_UNIT}, ${r.protein}g protein, ${r.carbs}g carbs and ${r.fat}g fat, and logged to ${r.meal}`}
    >
      <div
        aria-hidden="true"
        inert
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: STAGE_W,
          height: STAGE_H,
          transform: "scale(var(--scan-demo-scale, 0.49))",
        }}
      >
        <motion.div
          className="absolute"
          style={{
            left: PHONE_LEFT,
            top: PHONE_TOP,
            width: PHONE_W,
            height: PHONE_H,
            ...(live ? {} : { y: Y_SHEET, scale: Z_SHEET }),
          }}
          initial={live ? { x: OFF_X, y: OFF_Y } : false}
          animate={
            live
              ? {
                  x: [OFF_X, 0, 0, 0, 0, 0, 0, 0, 0, -OFF_X, -OFF_X],
                  y: [
                    OFF_Y,
                    0,
                    0,
                    Y_SHEET,
                    Y_SHEET,
                    0,
                    0,
                    Y_ROW,
                    Y_ROW,
                    OFF_Y,
                    OFF_Y,
                  ],
                  scale: [1, 1, 1, Z_SHEET, Z_SHEET, 1, 1, Z_ROW, Z_ROW, 1, 1],
                }
              : undefined
          }
          transition={
            live ? { ...LOOP, ease: phoneEase, times: phoneTimes } : undefined
          }
        >
          {/* The phone, a current iPhone Pro from the front: its buttons,
              the metal band, the black border of the glass, the screen. */}
          {SIDE_BUTTONS.map(({ side, top, height, flush }) => (
            <span
              key={top}
              className={cn(
                "absolute w-[4px] overflow-hidden bg-black",
                side === "left"
                  ? "-left-[3px] rounded-l-[2px]"
                  : "-right-[3px] rounded-r-[2px]",
                flush && "-right-[2px] w-[3px]"
              )}
              style={{ top, height }}
            >
              <span
                className={cn(
                  "absolute inset-0 ring-1 ring-inset ring-white/20",
                  flush ? "bg-stage-muted/20" : "bg-stage-muted/40"
                )}
              />
            </span>
          ))}
          {/* Graphite, the same in both themes: the metal is a tint of
              the stage's grey over black, so it stays opaque. */}
          <div className="absolute inset-0 overflow-hidden rounded-[72px] bg-black shadow-2xl">
            <span className="absolute inset-0 rounded-[72px] bg-stage-muted/40 ring-1 ring-inset ring-white/20" />
          </div>
          <div className="absolute inset-[3px] rounded-[69px] bg-black" />
          <div
            className="absolute isolate overflow-hidden rounded-[60px] bg-background"
            style={{ inset: BEZEL, transform: "translateZ(0)" }}
          >
            <FoodScreen live={live} />
            <ResultSheet live={live} />
            {/* iOS draws its status bar and home indicator over the app,
                so neither dims with the page under the sheet. */}
            <StatusBar className="z-[25] text-foreground" />
            <HomeIndicator className="z-[25] bg-foreground" />
            {live && <CameraScreen />}
            <span className="absolute left-1/2 top-[11px] z-40 h-9 w-[84px] -translate-x-1/2 rounded-full bg-black" />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
