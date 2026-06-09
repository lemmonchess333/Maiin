import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge extended with the Tropos type-scale utilities.
 *
 * Out of the box twMerge only recognises the standard font-size names
 * (text-xs … text-9xl) and arbitrary lengths (text-[11px]); any other
 * `text-*` class is classified as a text COLOUR. That silently DROPPED our
 * custom scale steps whenever a colour followed in the same merge —
 * cn("text-caption", …, "text-muted-foreground") returned only the colour,
 * and the element fell back to the inherited font size. Registering the
 * scale in the font-size class group fixes the conflict resolution both
 * ways (size vs size dedupes; size vs colour coexist).
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        "text-display",
        "text-h1",
        "text-h2",
        "text-h3",
        "text-body",
        "text-small",
        "text-micro",
        "text-caption",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
