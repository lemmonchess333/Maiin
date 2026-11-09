import type { ReactNode } from "react";
import { MotionConfig } from "framer-motion";

/**
 * The motion settings for every signed-in surface: Reduce Motion is
 * honoured by each framer animation below this.
 *
 * App.tsx loads this lazily, around the signed-in branches only. framer
 * is about a fifth of a new visitor's bytes before the login form
 * paints, and nothing signed out animates with it: Login, the legal
 * pages and the root-level overlays draw without framer. A static import
 * anywhere on App.tsx's eager graph puts the whole library back ahead of
 * that paint, which `eagerGraph.test.ts` fails on.
 */
export default function MotionRoot({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
