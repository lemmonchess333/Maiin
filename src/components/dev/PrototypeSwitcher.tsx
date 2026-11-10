/**
 * PROTOTYPE, throwaway (claude/prototype-three-features, 2026-11-10).
 *
 * A floating bar that flips a screen between prototype variants through
 * `?variant=`. Shown only in a dev build or a build made with
 * VITE_PROTOTYPES=true, so it cannot reach a person. This branch never
 * merges; the spec is docs/prototypes/2026-11-three-features.md.
 */
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { PROTOTYPES_ON } from "./prototypeVariant";

export default function PrototypeSwitcher({
  variants,
}: {
  /** Key and name, e.g. ["A", "Only with a reason"]. */
  variants: readonly (readonly [string, string])[];
}) {
  const [params, setParams] = useSearchParams();
  const keys = variants.map(([key]) => key);
  const current = params.get("variant") ?? keys[0];
  const index = Math.max(0, keys.indexOf(current));

  const go = (step: number) => {
    const next = keys[(index + step + keys.length) % keys.length];
    const copy = new URLSearchParams(params);
    copy.set("variant", next);
    setParams(copy, { replace: true });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        target.closest("input, textarea, [contenteditable]") !== null
      )
        return;
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!PROTOTYPES_ON) return null;
  const [key, name] = variants[index];
  return (
    <div
      data-prototype-switcher=""
      className="fixed left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full bg-black px-1.5 py-1 text-white shadow-lg ring-2 ring-yellow-300"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 92px)" }}
    >
      <button
        type="button"
        aria-label="Previous variant"
        onClick={() => go(-1)}
        className="size-9 rounded-full text-lg"
      >
        ‹
      </button>
      <span className="whitespace-nowrap px-1 text-xs font-semibold">
        Prototype {key} · {name}
      </span>
      <button
        type="button"
        aria-label="Next variant"
        onClick={() => go(1)}
        className="size-9 rounded-full text-lg"
      >
        ›
      </button>
    </div>
  );
}
