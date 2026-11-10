/**
 * PROTOTYPE, throwaway (claude/prototype-three-features, 2026-11-10).
 * Which prototype variant a screen shows, from `?variant=`. Only in a dev
 * build or a build made with VITE_PROTOTYPES=true.
 */
import { useSearchParams } from "react-router-dom";

export const PROTOTYPES_ON =
  import.meta.env.DEV || import.meta.env.VITE_PROTOTYPES === "true";

/** The variant asked for, or null when the screen is shown as it ships. */
export function usePrototypeVariant(keys: readonly string[]): string | null {
  const [params] = useSearchParams();
  if (!PROTOTYPES_ON) return null;
  const asked = params.get("variant");
  return asked && keys.includes(asked) ? asked : null;
}
