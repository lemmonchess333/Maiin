import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

const BUBBLE_COUNT = 3;

interface Bubble {
  x: number; // percent from left
  size: number; // px
  duration: number; // ms
  delay: number; // ms before it rises
}

/**
 * The `index`th bubble of its `round`: a new place along the glass each
 * round, the three staggered so they never rise together.
 */
function bubbleFor(round: number, index: number): Bubble {
  return {
    x: 20 + ((index * 37 + round * 13) % 60),
    size: 3 + (index % 2),
    duration: 3000 + index * 800,
    delay: round === 0 ? index * 1200 : 400 + index * 300,
  };
}

/* Rises 60px with a little sway, fading in as it leaves and out at the
   top. It starts INVISIBLE: a bubble waiting out its delay at full
   opacity is a pale dot parked at the bottom of the card, which reads as
   a smudge or a dead pixel rather than as a bubble. The steps ease out,
   fast at the bottom and slow at the top, as the spring did. */
const RISE: Keyframe[] = [
  { transform: "translate(0px, 0px)", opacity: 0 },
  { offset: 0.25, transform: "translate(3px, -27px)", opacity: 0.3 },
  { offset: 0.5, transform: "translate(-2px, -45px)", opacity: 0.3 },
  { offset: 0.75, transform: "translate(1px, -55px)", opacity: 0.15 },
  { transform: "translate(0px, -60px)", opacity: 0 },
];

/**
 * Three bubbles rising in the water hero card, past two glasses.
 *
 * Each is a Web Animations API animation of transform and opacity, which
 * the compositor runs: no React render and no main-thread work per frame.
 * When one reaches the top it starts again from a new place. Paused while
 * the card is off-screen or the app is in the background; nothing at all
 * under Reduce Motion, since the bubbles are decoration.
 */
export default function WaterBubbles() {
  const reducedMotion = useReducedMotion();
  const [active, setActive] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const bubbleRefs = useRef<(HTMLDivElement | null)[]>([]);
  const running = useRef<(Animation | null)[]>([]);
  const paused = useRef(false);

  // Whether anyone can see them: on-screen and the app in the foreground.
  useEffect(() => {
    if (reducedMotion) return;
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    let onScreen = true;
    const sync = () =>
      setActive(onScreen && document.visibilityState === "visible");
    const io = new IntersectionObserver((entries) => {
      onScreen = entries[0]?.isIntersecting ?? true;
      sync();
    });
    io.observe(el);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return;
    let stopped = false;
    const rise = (index: number, round: number) => {
      const el = bubbleRefs.current[index];
      if (stopped || !el || typeof el.animate !== "function") return;
      const bubble = bubbleFor(round, index);
      el.style.left = `${bubble.x}%`;
      el.style.width = `${bubble.size}px`;
      el.style.height = `${bubble.size}px`;
      const animation = el.animate(RISE, {
        duration: bubble.duration,
        delay: bubble.delay,
        easing: "linear",
        fill: "both",
      });
      if (paused.current) animation.pause();
      animation.onfinish = () => rise(index, round + 1);
      running.current[index] = animation;
    };
    for (let index = 0; index < BUBBLE_COUNT; index += 1) rise(index, 0);
    return () => {
      stopped = true;
      for (const animation of running.current) {
        if (!animation) continue;
        animation.onfinish = null;
        animation.cancel();
      }
      running.current = [];
    };
  }, [reducedMotion]);

  useEffect(() => {
    paused.current = !active;
    for (const animation of running.current) {
      if (!animation) continue;
      if (active) animation.play();
      else animation.pause();
    }
  }, [active]);

  if (reducedMotion) return null;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      {Array.from({ length: BUBBLE_COUNT }, (_, index) => (
        <div
          key={index}
          ref={(el) => {
            bubbleRefs.current[index] = el;
          }}
          data-water-bubble
          className="absolute rounded-full opacity-0"
          style={{
            bottom: 4,
            backgroundColor: "rgba(255, 255, 255, 0.20)",
          }}
        />
      ))}
    </div>
  );
}
