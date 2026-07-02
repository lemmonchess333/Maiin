import { motion } from "framer-motion";
import Model, { type IExerciseData } from "react-body-highlighter";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/**
 * WKWebView-safe glow layer for the body diagrams (visual audit Phase 2).
 *
 * The glow is a second, blurred `react-body-highlighter` Model rendered
 * absolutely behind the base diagram, with a transparent silhouette so only
 * the highlighted muscle polygons emit. The blur filter is STATIC — only
 * the wrapper's `opacity` ever animates (animating blur radius / filter
 * values stutters in WKWebView; opacity/transform composite on the GPU).
 *
 * `pulse` adds one slow ambient opacity breath (the single most-trained
 * muscle only — nothing else in the app loops). `prefers-reduced-motion`
 * renders the glow at its settled opacity with no entrance and no loop.
 */
export default function BodyMapGlow({
  data,
  type,
  color,
  opacity,
  delay = 0,
  pulse = false,
  blur = 9,
  width,
  height,
  svgStyle,
}: {
  /** Muscle entries to glow (same shape the base Model receives). */
  data: IExerciseData[];
  type: "anterior" | "posterior";
  /** Glow hue — a THEME token; all frequency steps map to this colour. */
  color: string;
  /** Settled glow opacity (0..1). */
  opacity: number;
  /** Entrance stagger in seconds (intensity tiers settle at different times). */
  delay?: number;
  /** Slow ambient breath — reserved for the single most-trained muscle. */
  pulse?: boolean;
  /** Static blur radius in px. Never animated. */
  blur?: number;
  width?: number | string;
  height?: number | string;
  svgStyle?: React.CSSProperties;
}) {
  const reduce = useReducedMotion();
  if (data.length === 0) return null;

  return (
    <motion.div
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none"
      style={{ filter: `blur(${blur}px)` }}
      initial={reduce ? { opacity } : { opacity: 0 }}
      animate={
        pulse && !reduce
          ? { opacity: [opacity * 0.65, opacity, opacity * 0.65] }
          : { opacity }
      }
      transition={
        pulse && !reduce
          ? { repeat: Infinity, duration: 4.5, ease: "easeInOut", delay }
          : { duration: 0.9, ease: "easeOut", delay }
      }
    >
      <Model
        data={data}
        type={type}
        bodyColor="rgba(0,0,0,0)"
        highlightedColors={[color, color, color]}
        style={{ width, height, padding: 0, margin: "0 auto" }}
        svgStyle={svgStyle}
      />
    </motion.div>
  );
}
