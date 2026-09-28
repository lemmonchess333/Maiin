import { cn } from "@/lib/utils";
import { AnimatedNumber } from "./AnimatedNumber";

/**
 * A headline number over the word that says what it counts — "52" over
 * "minutes", "11.0" over "km" (DS3: big plain numbers, no tiles, no
 * icons). Lay several in a row with `grid grid-cols-3 divide-x
 * divide-border`; the rules between them are the only chrome.
 *
 * `lg` is the finish screen's size, the moment's headline. `md` sits
 * inside a card, where the card's own title outranks it.
 *
 * `count` makes the figure count up to its number as it appears, for a
 * moment such as the finish screen; `format` writes each step as the
 * static figure would be written. Without it the figure is plain text.
 */
export default function StatFigure({
  value,
  count,
  unit,
  size = "md",
}: {
  unit: string;
  size?: "md" | "lg";
} & (
  | { value: string; count?: never }
  | { value?: never; count: { to: number; format: (n: number) => string } }
)) {
  return (
    <div className="px-2 text-center">
      <p
        className={cn(
          "font-extrabold font-mono tabular-nums leading-tight text-foreground",
          size === "lg" ? "text-h2" : "text-h3"
        )}
      >
        {count ? (
          <AnimatedNumber
            value={count.to}
            format={count.format}
            duration={0.6}
          />
        ) : (
          value
        )}
      </p>
      <p className="mt-0.5 text-sm text-muted-foreground">{unit}</p>
    </div>
  );
}
