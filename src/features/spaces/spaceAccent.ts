import { THEME } from "@/lib/theme";
import type { SpaceDef } from "./spaceDefs";

/** A Space's accent as its identity colour: the tint washes on its hero and
 *  directory card, and the fallback avatar on its posts. */
export const SPACE_ACCENT_HEX: Record<SpaceDef["accent"], string> = {
  running: THEME.running,
  lifting: THEME.lifting,
  brand: THEME.brand,
};
