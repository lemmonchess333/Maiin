/**
 * AmbientGlow — the shipped single-hue brand ambient layer.
 *
 * A subtle top glow behind the whole authenticated app: brand purple,
 * one hue everywhere (Trading-212-style). It is the deliberate,
 * post-#511 reintroduction of ambience — the failure modes that got the
 * old global gradient reverted are designed out here and the visuals
 * live entirely in CSS (`.ambient-glow` in src/index.css): single hue
 * (never the #511 two-hue mud), eased falloff complete high up so the
 * lower half of every page stays clean neutral canvas, a faint noise
 * overlay against banding, dark-primary (light merely brightens), and
 * `prefers-reduced-transparency` opt-out. Intensity is tuned via the
 * `--ambient-glow-*` tokens, not here.
 *
 * This component only owns the two things CSS can't: portalling the
 * fixed layer behind the (transparent) Layout so it shows through the
 * gaps between cards, and excluding the run / map surfaces.
 */
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";

export default function AmbientGlow() {
  const { pathname } = useLocation();

  // Never over the live-run / setup / RunDetail / run-summary surfaces:
  // they are full-screen map/tracking views where an ambient wash would
  // sit behind the map. `/run*` covers all of them in one check.
  if (pathname.startsWith("/run")) return null;

  return createPortal(
    <div className="ambient-glow" aria-hidden="true">
      <div className="ambient-glow__noise" />
    </div>,
    document.body
  );
}
