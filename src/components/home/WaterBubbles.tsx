import { useState, useEffect, useRef } from "react";
import { m as motion, AnimatePresence } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";

const BUBBLE_COUNT = 3;

interface Bubble {
  id: number;
  x: number; // percent from left
  size: number; // px
  duration: number; // seconds
  delay: number; // seconds
}

function makeBubbles(seed: number): Bubble[] {
  const bubbles: Bubble[] = [];
  for (let i = 0; i < BUBBLE_COUNT; i++) {
    bubbles.push({
      id: seed * 10 + i,
      x: 20 + ((i * 37 + seed * 13) % 60),
      size: 3 + (i % 2),
      duration: 3 + i * 0.8,
      delay: i * 1.2,
    });
  }
  return bubbles;
}

export default function WaterBubbles() {
  const reducedMotion = useReducedMotion();
  const [cycle, setCycle] = useState(0);
  // Whether the bubble layer is actually visible to the user (on-screen AND
  // the tab/app foregrounded). Starts true so it animates immediately; the
  // observer corrects it on the next frame.
  const [active, setActive] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Pause the cycle when the card is scrolled off-screen or the tab is
  // backgrounded. The bubble layer is purely decorative, so driving a 4s
  // Framer-Motion re-render of the Home tree while nobody can see it is
  // wasted work for every steady-state (3+ glasses) user.
  useEffect(
    function () {
      if (reducedMotion) return;
      const el = containerRef.current;
      if (!el || typeof IntersectionObserver === "undefined") return;

      let onScreen = true;
      const sync = function () {
        setActive(onScreen && document.visibilityState === "visible");
      };
      const io = new IntersectionObserver(function (entries) {
        onScreen = entries[0]?.isIntersecting ?? true;
        sync();
      });
      io.observe(el);
      document.addEventListener("visibilitychange", sync);
      sync();
      return function () {
        io.disconnect();
        document.removeEventListener("visibilitychange", sync);
      };
    },
    [reducedMotion]
  );

  useEffect(
    function () {
      // Sprint 6: skip the 4-second cycle interval entirely when the
      // user opts out of motion. Bubble animation is decorative —
      // omitting it is a strict improvement for vestibular safety,
      // not a degraded experience. Also paused when off-screen/hidden.
      if (reducedMotion || !active) return;
      const interval = setInterval(function () {
        setCycle(function (c) {
          return c + 1;
        });
      }, 4000);
      return function () {
        clearInterval(interval);
      };
    },
    [reducedMotion, active]
  );

  // Sprint 6: render nothing when reduced motion is set. The Water
  // hero card's bubble layer is decorative — the card still works
  // visually without it.
  if (reducedMotion) return null;

  const bubbles = makeBubbles(cycle);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      <AnimatePresence mode="popLayout">
        {bubbles.map(function (b) {
          return (
            <motion.div
              key={b.id}
              className="absolute rounded-full"
              style={{
                width: b.size,
                height: b.size,
                left: b.x + "%",
                bottom: 4,
                backgroundColor: "rgba(255, 255, 255, 0.20)",
              }}
              initial={{ y: 0, opacity: 0.3 }}
              animate={{
                y: -60,
                x: [0, 3, -2, 1, 0],
                opacity: 0,
              }}
              exit={{ opacity: 0 }}
              transition={{
                duration: b.duration,
                delay: b.delay,
                ease: "easeOut",
                x: { duration: b.duration, repeat: 0, ease: "easeInOut" },
              }}
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
}
