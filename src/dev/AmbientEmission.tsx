/**
 * AmbientEmission — DEV/TEST-ONLY ambient-glow bake-off harness.
 *
 * Renders a parameterised top-anchored "emission" layer behind the real
 * seeded app pages so a human can judge the candidates on actual
 * data-dense surfaces (the only honest test). NOTHING here ships:
 * App.tsx mounts it under `import.meta.env.MODE !== "production"`, so it
 * is dead-code-eliminated from the production bundle exactly like the
 * /dev/brand-bakeoff route + the font bake-off.
 *
 * This exists to BEAT the PR #511 post-mortem (src/index.css ~265), not
 * repeat it. #511 failed by mixing TWO hues into a muddy haze that sat
 * behind every card/chart and killed perceived sharpness. The rules here
 * are the direct answer:
 *   - SINGLE hue per page, never two mixed.
 *   - Falloff COMPLETE high up (dark ≤45vh, light ≤~22vh) so the lower
 *     half of every page is pure neutral canvas — cards/charts never sit
 *     on a tint.
 *   - Eased multi-stop falloffs + a faint noise overlay to kill OLED
 *     banding (the #1 cheap-looking failure).
 *   - Light mode does NOT use the #511 method (accent-over-grey = the
 *     documented failure). It BRIGHTENS: tinted-white → background.
 *
 * Layering: the app's Layout root is transparent (`min-h-screen`, no
 * bg), so a `position:fixed; z-index:-1` layer rendered into <body>
 * shows through every transparent gap between cards while opaque cards
 * paint over it — and being fixed, content scrolls over a STABLE glow
 * (quality bar #2). The occluder override + reduced-transparency guard
 * are injected as a harness-only <style> (production CSS untouched).
 *
 * Parameters (localStorage, set by the capture rig):
 *   ab-candidate : A | B | C | LA | LB | LC   (C/LC = control, render nothing)
 *   ab-intensity : lo | hi
 *
 *   A  = global brand (purple) · dark
 *   B  = domain hue (purple / coral run / orange food) · dark
 *   LA = global lavender-white wash · light
 *   LB = domain tinted-white (lavender / cream food / blush run) · light
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";

type Candidate = "A" | "B" | "C" | "LA" | "LB" | "LC";
type Intensity = "lo" | "hi";

// Canonical hue tokens (src/index.css) — NO new colour values.
const PURPLE = "var(--primary)"; // #7B72E9 brand
const CORAL = "var(--running)"; // #D4637A
const ORANGE = "var(--nutrition)"; // #D9884E

function readCandidate(): Candidate | null {
  try {
    const v = localStorage.getItem("ab-candidate");
    if (v === "A" || v === "B" || v === "LA" || v === "LB") return v;
    if (v === "C" || v === "LC") return v; // control → render nothing
    return null;
  } catch {
    return null;
  }
}
function readIntensity(): Intensity {
  try {
    return localStorage.getItem("ab-intensity") === "hi" ? "hi" : "lo";
  } catch {
    return "lo";
  }
}

// Map area / live-run / RunDetail map: never (exclusions). `/run` is the
// SETUP surface in the rig (the live map only mounts once GPS starts, which
// it never does here) so it is INCLUDED; the map-heavy routes are not.
function isExcluded(pathname: string): boolean {
  return pathname.startsWith("/run-summary") || /^\/run\/[^/]+$/.test(pathname);
}

// Per-page domain hue (candidate B / LB).
function domainHue(pathname: string): string {
  if (pathname.startsWith("/food")) return ORANGE;
  if (pathname.startsWith("/run")) return CORAL;
  return PURPLE; // /, /program, /social, /history(Analytics)
}

// Faint fractal-noise tile (data-URI) layered at low opacity to break up
// gradient banding on OLED. feTurbulence, stitched so it tiles seamlessly.
const NOISE_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

const STYLE_ID = "ambient-bakeoff-style";

/**
 * Harness-only CSS: lower the safe-top occluder's bg alpha (≈ /0.5) so the
 * status-bar zone blurs THROUGH to the glow without a colour seam, and kill
 * the whole layer under prefers-reduced-transparency. Injected (not edited
 * into components.css) so production stays untouched.
 */
function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
    .ds-safe-top-occluder { background: hsl(var(--background) / 0.47) !important; }
    @media (prefers-reduced-transparency: reduce) {
      #ambient-emission-layer { display: none !important; }
    }
  `;
  document.head.appendChild(el);
}

export default function AmbientEmission() {
  const { pathname } = useLocation();
  const [candidate, setCandidate] = useState<Candidate | null>(readCandidate);
  const [intensity, setIntensity] = useState<Intensity>(readIntensity);

  // Re-read params on cross-tab storage writes and the rig's custom event
  // (so toggling without a reload still updates during manual review).
  useEffect(() => {
    const sync = () => {
      setCandidate(readCandidate());
      setIntensity(readIntensity());
    };
    window.addEventListener("storage", sync);
    window.addEventListener("ambient-bakeoff-change", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("ambient-bakeoff-change", sync);
    };
  }, []);

  useEffect(() => {
    ensureStyle();
  }, []);

  // Nothing to render: no/invalid param, control candidate, or excluded route.
  if (!candidate || candidate === "C" || candidate === "LC") return null;
  if (isExcluded(pathname)) return null;

  const isLight = candidate === "LA" || candidate === "LB";
  const hue =
    candidate === "A" || candidate === "LA" ? PURPLE : domainHue(pathname);

  let background: string;
  let height: string;
  let noiseOpacity: number;

  if (isLight) {
    // BRIGHTEN: tinted-white → background. Falloff complete well above the
    // first card (≤~22vh) so the tint never sits behind a card or chart.
    // Analytics (/history) is constrained to a header-only band per spec.
    const pct = intensity === "hi" ? 8 : 6;
    const tint = `color-mix(in oklch, hsl(${hue}) ${pct}%, white)`;
    const mid = `color-mix(in oklch, hsl(${hue}) ${pct * 0.5}%, white)`;
    background =
      `radial-gradient(120% 100% at 20% -5%, ${tint} 0%, ${mid} 30%, ` +
      `hsl(var(--background)) 78%)`;
    height = pathname.startsWith("/history") ? "13vh" : "22vh";
    noiseOpacity = 0.015;
  } else {
    // DARK emission: tight bright core over a wider soft halo, single hue,
    // eased multi-stop falloff complete by ~45vh.
    const peak = intensity === "hi" ? 0.12 : 0.08;
    const a = (m: number) => `hsl(${hue} / ${(peak * m).toFixed(4)})`;
    const core = `radial-gradient(circle at 20% -5%, ${a(1)} 0%, ${a(0.55)} 12%, ${a(0.2)} 22%, transparent 30%)`;
    const halo = `radial-gradient(120% 60% at 50% 0%, ${a(0.5)} 0%, ${a(0.22)} 22%, ${a(0.08)} 34%, transparent 45%)`;
    background = `${core}, ${halo}`;
    height = "45vh";
    noiseOpacity = 0.025;
  }

  const layer = (
    <div
      id="ambient-emission-layer"
      aria-hidden="true"
      style={{
        position: "fixed",
        insetInline: 0,
        top: 0,
        height,
        zIndex: -1,
        pointerEvents: "none",
        background,
      }}
    >
      {/* Noise overlay (emission layer only) — same footprint, normal blend. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: NOISE_URI,
          backgroundRepeat: "repeat",
          opacity: noiseOpacity,
          mixBlendMode: "normal",
        }}
      />
    </div>
  );

  return createPortal(layer, document.body);
}
