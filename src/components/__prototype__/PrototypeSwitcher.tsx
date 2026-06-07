import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * __PROTOTYPE__ floating variant switcher (Home2-hierarchy prototype).
 *
 * Dev-only bottom-centre pill: ← / current label / → cycles the
 * `?variant=` search param (wraps), arrow keys too (ignored while an
 * input/textarea/contenteditable is focused). Shareable + reload-stable
 * via the URL. Hidden in production builds.
 *
 * THROWAWAY — delete together with the prototype route once a Home
 * arrangement is chosen and folded into the real page.
 */
export function PrototypeSwitcher({
  variants,
  labels,
}: {
  variants: string[];
  labels?: Record<string, string>;
}) {
  const [params, setParams] = useSearchParams();
  const current = params.get("variant") ?? variants[0];
  const idx = Math.max(0, variants.indexOf(current));

  const go = (delta: number) => {
    const next = variants[(idx + delta + variants.length) % variants.length];
    const p = new URLSearchParams(params);
    p.set("variant", next);
    setParams(p, { replace: true });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      )
        return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!import.meta.env.DEV) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-1 rounded-full bg-zinc-900 text-white shadow-xl ring-1 ring-white/10 px-1.5 py-1.5">
      <button
        type="button"
        onClick={() => go(-1)}
        aria-label="Previous variant"
        className="size-9 rounded-full grid place-items-center hover:bg-white/10 active:scale-95"
      >
        ←
      </button>
      <span className="px-3 text-xs font-mono tabular-nums whitespace-nowrap">
        {current}
        {labels?.[current] ? ` — ${labels[current]}` : ""}
      </span>
      <button
        type="button"
        onClick={() => go(1)}
        aria-label="Next variant"
        className="size-9 rounded-full grid place-items-center hover:bg-white/10 active:scale-95"
      >
        →
      </button>
    </div>
  );
}
