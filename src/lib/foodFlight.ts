/**
 * The food's flight to the calorie wheel (Food11 call 6): when a meal is
 * logged today, its picture rises from the composer's field to the end
 * of the wheel's arc and fades into it, and then the arc grows. It ties
 * the thing just logged to the wheel changing.
 *
 * This file is the part with no screen in it: when a flight is owed, and
 * where on the wheel it lands. `FoodLogFlight` draws it; the page's
 * `useFoodLogFlight` holds the state.
 *
 * The limits are the lock's. One flight a log, however many foods it
 * holds. None on an edit or a delete, or for a meal that comes back when
 * a delete is undone. None on a day that is not today. None for what was
 * already there when the day came on screen. Nothing under Reduce
 * Motion.
 */
import { loggedFill, WHEEL_SIZE, WHEEL_STROKE } from "@/lib/calorieRingFill";

/** How long the picture is in the air. */
export const FLIGHT_MS = 400;
/** How long the wheel waits for it: the arc starts to grow while the
 *  picture is still fading into it. With the wheel's 350 ms, a log is
 *  shown in 600 ms (`LOG_MOMENT_MS`). */
export const FLIGHT_WHEEL_HOLD_MS = 250;

/** What the page has seen of one day's diary. */
export interface FlightSeen {
  /** Local "YYYY-MM-DD". */
  day: string;
  /** Every meal seen on that day since it came on screen. It only
   *  grows, so a meal that leaves and comes back is not new. */
  ids: ReadonlySet<string>;
  /** The day's calories as last seen. */
  calories: number;
}

export interface FlightInput {
  day: string;
  isToday: boolean;
  /** The day's meals have loaded. */
  ready: boolean;
  /** The day's meals on screen, in any order. */
  ids: readonly string[];
  calories: number;
  reducedMotion: boolean;
}

export interface FlightRequest {
  /** The meal that flies: the first of the new ones. */
  mealId: string;
  /** The day's calories before the log, which is where the arc ends and
   *  the picture lands. */
  fromCalories: number;
}

/**
 * What a render makes of the diary: the record to keep, and a flight if
 * one is owed. `seen` comes back unchanged (the same object) when nothing
 * moved, so a caller can set state only when it differs.
 */
export function nextFlight(
  seen: FlightSeen | null,
  input: FlightInput
): { seen: FlightSeen | null; flight: FlightRequest | null } {
  if (!input.ready) return { seen, flight: null };
  // The day coming on screen: what is there was not just logged.
  if (!seen || seen.day !== input.day) {
    return {
      seen: {
        day: input.day,
        ids: new Set(input.ids),
        calories: input.calories,
      },
      flight: null,
    };
  }
  const fresh = input.ids.filter((id) => !seen.ids.has(id));
  if (fresh.length === 0 && input.calories === seen.calories) {
    return { seen, flight: null };
  }
  return {
    seen: {
      day: seen.day,
      ids: fresh.length ? new Set([...seen.ids, ...fresh]) : seen.ids,
      calories: input.calories,
    },
    flight:
      fresh.length > 0 && input.isToday && !input.reducedMotion
        ? { mealId: fresh[0], fromCalories: seen.calories }
        : null,
  };
}

/** A box on screen: a `DOMRect`, or anything shaped like one. */
export interface ScreenBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where the wheel's arc ends, on screen, with `calories` of `target`
 * logged: the middle of the arc's line, starting at twelve o'clock and
 * running clockwise, as `CalorieRing` draws it.
 */
export function arcEndPoint(
  wheel: ScreenBox,
  calories: number,
  target: number
): { x: number; y: number } {
  const radius =
    (wheel.width / 2) *
    ((WHEEL_SIZE / 2 - WHEEL_STROKE / 2) / (WHEEL_SIZE / 2));
  const angle = 2 * Math.PI * loggedFill(calories, target);
  return {
    x: wheel.left + wheel.width / 2 + radius * Math.sin(angle),
    y: wheel.top + wheel.height / 2 - radius * Math.cos(angle),
  };
}

/** Whether any of the wheel is on screen. No flight to a wheel that has
 *  been scrolled away. */
export function wheelOnScreen(wheel: ScreenBox, viewportHeight: number) {
  return (
    wheel.width > 0 &&
    wheel.top + wheel.height > 0 &&
    wheel.top < viewportHeight
  );
}
