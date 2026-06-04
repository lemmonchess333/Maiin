/**
 * Lazy feature bundle for framer-motion's `LazyMotion` (perf, P1).
 *
 * `domMax` is the FULL feature set — animations + gestures + drag + layout —
 * so aliasing `m as motion` app-wide (see the framer-motion imports across
 * src/) is behaviour-IDENTICAL to the old eager `motion`: nothing is dropped
 * (the `domAnimation` subset that omits drag/layout is deliberately NOT used).
 *
 * The win is purely about WHEN it loads. Imported only here, behind the
 * `LazyMotion features={() => import(...)}` loader in main.tsx, so Vite splits
 * the heavy DOM-feature implementations into their own async chunk fetched
 * AFTER first paint — instead of bundling them into every route's chunk via
 * the eager `motion` proxy. The lightweight `m` component ships in the route
 * chunks; the features stream in behind it.
 */
import { domMax } from "framer-motion";

export default domMax;
