import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  arcEndPoint,
  wheelOnScreen,
  FLIGHT_MS,
  FLIGHT_WHEEL_HOLD_MS,
} from "@/lib/foodFlight";

export interface FoodFlight {
  /** One flight a key: the logged meal's id. */
  key: string;
  /** The food's picture. */
  src: string;
  /** The day's calories before the log, and its target: where the arc
   *  ends, which is where the picture lands. */
  fromCalories: number;
  target: number;
}

interface FoodLogFlightProps {
  /** The flight to play, or null. */
  flight: FoodFlight | null;
  /** The picture has reached the wheel: let the arc grow. Called once a
   *  flight, also when there is nothing to play. */
  onArrive: () => void;
  /** The picture has gone. Called once a flight, after `onArrive`. */
  onDone: () => void;
}

/** The picture's side, in px. */
const SIZE = 44;

/**
 * A logged food's picture, rising from the composer's field to the end
 * of the calorie wheel's arc and fading into it (Food11 call 6).
 *
 * It finds the two by their marks on the page (`data-calorie-wheel`,
 * `data-guide-anchor="food-composer"`) when the flight starts, so it
 * needs nothing handed down but the calories. With no wheel on screen,
 * or where the browser cannot animate an element, there is no flight
 * and the wheel is let go at once.
 *
 * Transform and opacity through `Element.animate`, so it runs on the
 * compositor: no animation-frame loop, and nothing laid out again. It
 * takes no taps and no focus, so it never gets in the way of typing the
 * next food. It is drawn in the page's own layer of the body, since a
 * fixed box inside the page would be placed by the page's entry motion.
 */
export default function FoodLogFlight({
  flight,
  onArrive,
  onDone,
}: FoodLogFlightProps) {
  const picture = useRef<HTMLImageElement>(null);
  /* The latest handlers, for the timers of a flight already started. */
  const handlers = useRef({ onArrive, onDone });
  useLayoutEffect(() => {
    handlers.current = { onArrive, onDone };
  });

  const key = flight?.key ?? null;
  const fromCalories = flight?.fromCalories ?? 0;
  const target = flight?.target ?? 0;
  useLayoutEffect(() => {
    if (key === null) return;
    const el = picture.current;
    const wheel = document
      .querySelector<HTMLElement>("[data-calorie-wheel]")
      ?.getBoundingClientRect();
    const field = document
      .querySelector<HTMLElement>('[data-guide-anchor="food-composer"]')
      ?.getBoundingClientRect();
    if (
      !el ||
      !wheel ||
      !field ||
      typeof el.animate !== "function" ||
      !wheelOnScreen(wheel, window.innerHeight)
    ) {
      handlers.current.onArrive();
      handlers.current.onDone();
      return;
    }
    const end = arcEndPoint(wheel, fromCalories, target);
    // It rises from the field's text, a third of the way along it.
    const startX = field.left + field.width / 3;
    const startY = field.top + field.height / 2;
    el.style.left = `${end.x - SIZE / 2}px`;
    el.style.top = `${end.y - SIZE / 2}px`;
    const animation = el.animate(
      [
        {
          transform: `translate(${startX - end.x}px, ${startY - end.y}px) scale(1)`,
          opacity: 0,
        },
        { opacity: 1, offset: 0.14 },
        { opacity: 1, offset: 0.76 },
        { transform: "translate(0px, 0px) scale(0.45)", opacity: 0 },
      ],
      {
        duration: FLIGHT_MS,
        easing: "cubic-bezier(0.4, 0, 0.2, 1)",
        fill: "both",
      }
    );
    let arrived = false;
    const arrive = () => {
      if (arrived) return;
      arrived = true;
      handlers.current.onArrive();
    };
    const hold = window.setTimeout(arrive, FLIGHT_WHEEL_HOLD_MS);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      arrive();
      handlers.current.onDone();
    };
    animation.onfinish = finish;
    // Cancelled from outside (the browser dropping it): let the wheel go.
    animation.oncancel = finish;
    // Superseded by another log, or the page leaving: stop without a
    // word. The next flight holds the wheel itself, and its state must
    // not be cleared by this one ending.
    return () => {
      window.clearTimeout(hold);
      animation.onfinish = null;
      animation.oncancel = null;
      animation.cancel();
    };
  }, [key, fromCalories, target]);

  if (!flight || typeof document === "undefined") return null;
  return createPortal(
    <img
      ref={picture}
      src={flight.src}
      alt=""
      aria-hidden="true"
      data-food-flight=""
      draggable={false}
      decoding="async"
      className="pointer-events-none fixed z-30 size-[44px] select-none object-contain opacity-0"
    />,
    document.body
  );
}
