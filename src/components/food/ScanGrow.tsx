import { useEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { Camera } from "lucide-react";

/** The Scan button's corner radius (IconButton's rounded-xl). */
const BUTTON_RADIUS_PX = 12;
const GROW_MS = 320;
const FADE_MS = 180;
/** Never hold the screen dark longer than this waiting for the scanner. */
const MAX_HOLD_MS = 2500;

interface Props {
  /** The Scan button's box when it was tapped, in viewport pixels. */
  from: DOMRect;
  /** The scanner is on screen underneath: the layer may fade. */
  scannerShown: boolean;
  /** The layer has faded out; the page can drop it. */
  onDone: () => void;
  /** Test seam for the give-up timer. */
  maxHoldMs?: number;
}

/**
 * The scanner opening: the orange camera button grows until it fills the
 * screen, turning to the scanner's black on the way, then fades to show
 * the scanner underneath.
 *
 * It starts at the tap, before the scanner's code has loaded and before
 * its opening delay has passed. The layer holds full-screen black until
 * the page says the scanner is showing (or MAX_HOLD_MS passes), so the
 * page never shows through between the two.
 *
 * Transforms only, per the WKWebView motion rule: the layer is the whole
 * screen scaled down to the button's box. A scaled rectangle would scale
 * its corners too, so the radius is set per frame to the value that
 * LOOKS like the button's 12px corner at that scale, shrinking to square
 * as it fills the screen. The camera glyph is scaled back the other way
 * so it keeps its shape while it fades.
 *
 * Reduced motion never mounts it: the page opens the scanner with a cut.
 */
export default function ScanGrow({
  from,
  scannerShown,
  onDone,
  maxHoldMs = MAX_HOLD_MS,
}: Props) {
  const [start] = useState(() => {
    const width = document.documentElement.clientWidth || window.innerWidth;
    const height = window.innerHeight;
    return {
      x: from.left,
      y: from.top,
      scaleX: Math.max(from.width / width, 0.01),
      scaleY: Math.max(from.height / height, 0.01),
    };
  });
  const progress = useMotionValue(0);
  const x = useTransform(progress, [0, 1], [start.x, 0]);
  const y = useTransform(progress, [0, 1], [start.y, 0]);
  const scaleX = useTransform(progress, [0, 1], [start.scaleX, 1]);
  const scaleY = useTransform(progress, [0, 1], [start.scaleY, 1]);
  const borderRadius = useTransform(progress, (p) => {
    const visible = BUTTON_RADIUS_PX * (1 - p);
    const sx = start.scaleX + (1 - start.scaleX) * p;
    const sy = start.scaleY + (1 - start.scaleY) * p;
    return `${visible / sx}px / ${visible / sy}px`;
  });
  // The button's orange gives way to the scanner's black.
  const orange = useTransform(progress, [0, 0.55], [1, 0]);
  const glyphScaleX = useTransform(scaleX, (s) => 1 / s);
  const glyphScaleY = useTransform(scaleY, (s) => 1 / s);
  const opacity = useMotionValue(1);

  const [grown, setGrown] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const controls = animate(progress, 1, {
      duration: GROW_MS / 1000,
      ease: [0.2, 0.8, 0.2, 1],
      onComplete: () => setGrown(true),
    });
    return () => controls.stop();
  }, [progress]);

  useEffect(() => {
    const timer = setTimeout(() => setGaveUp(true), maxHoldMs);
    return () => clearTimeout(timer);
  }, [maxHoldMs]);

  const release = (grown && scannerShown) || gaveUp;
  useEffect(() => {
    if (!release) return;
    const controls = animate(opacity, 0, {
      duration: FADE_MS / 1000,
      ease: "easeOut",
      onComplete: () => onDoneRef.current(),
    });
    return () => controls.stop();
  }, [release, opacity]);

  return (
    <motion.div
      aria-hidden
      data-testid="scan-grow"
      className="pointer-events-none fixed inset-0 z-[61]"
      style={{ opacity }}
    >
      <motion.div
        className="absolute inset-0 origin-top-left overflow-hidden bg-black"
        style={{ x, y, scaleX, scaleY, borderRadius }}
      >
        <motion.div
          className="absolute inset-0 bg-nutrition-fill"
          style={{ opacity: orange }}
        />
        <motion.div
          className="absolute left-1/2 top-1/2 text-white"
          style={{
            x: "-50%",
            y: "-50%",
            scaleX: glyphScaleX,
            scaleY: glyphScaleY,
            opacity: orange,
          }}
        >
          <Camera className="size-6" />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
