import { useCallback, useState } from "react";
import {
  nextFlight,
  type FlightInput,
  type FlightRequest,
  type FlightSeen,
} from "@/lib/foodFlight";

/**
 * The page's side of the food's flight to the wheel (Food11 call 6):
 * watches the day's diary for a new meal (`nextFlight` has the rule),
 * and says when one is in the air and whether the wheel is still waiting
 * for it.
 *
 * The record of what has been seen is kept in state and set during
 * render, so a log, its flight and the wheel's hold all reach the screen
 * in one commit: the wheel never draws the new calories before the
 * flight that explains them.
 */
export function useFoodLogFlight(input: FlightInput): {
  /** The flight in the air, or null. */
  flight: FlightRequest | null;
  /** The wheel is waiting for it. */
  holdWheel: boolean;
  /** The picture has reached the wheel. */
  arrive: () => void;
  /** The picture has gone. */
  finish: () => void;
} {
  const [seen, setSeen] = useState<FlightSeen | null>(null);
  const [flight, setFlight] = useState<FlightRequest | null>(null);
  const [holdWheel, setHoldWheel] = useState(false);

  const next = nextFlight(seen, input);
  if (next.seen !== seen) {
    setSeen(next.seen);
    if (next.flight) {
      // A log while one is in the air: the new one takes over.
      setFlight(next.flight);
      setHoldWheel(true);
    }
  }

  const arrive = useCallback(() => setHoldWheel(false), []);
  const finish = useCallback(() => {
    setHoldWheel(false);
    setFlight(null);
  }, []);
  return { flight, holdWheel, arrive, finish };
}
