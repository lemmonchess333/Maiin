import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const BUBBLE_COUNT = 3;

interface Bubble {
  id: number;
  x: number;      // percent from left
  size: number;    // px
  duration: number; // seconds
  delay: number;   // seconds
}

function makeBubbles(seed: number): Bubble[] {
  const bubbles: Bubble[] = [];
  for (let i = 0; i < BUBBLE_COUNT; i++) {
    bubbles.push({
      id: seed * 10 + i,
      x: 20 + ((i * 37 + seed * 13) % 60),
      size: 3 + (i % 2),
      duration: 3 + (i * 0.8),
      delay: i * 1.2,
    });
  }
  return bubbles;
}

export default function WaterBubbles() {
  const [cycle, setCycle] = useState(0);

  useEffect(function () {
    const interval = setInterval(function () {
      setCycle(function (c) { return c + 1; });
    }, 4000);
    return function () { clearInterval(interval); };
  }, []);

  const bubbles = makeBubbles(cycle);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
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
