import { cn } from "@/lib/utils";

/**
 * A headline number over the word that says what it counts — "52" over
 * "minutes", "11.0" over "km" (DS3: big plain numbers, no tiles, no
 * icons). Lay several in a row with `grid grid-cols-3 divide-x
 * divide-border`; the rules between them are the only chrome.
 *
 * `lg` is the finish screen's size, the moment's headline. `md` sits
 * inside a card, where the card's own title outranks it.
 */
export default function StatFigure({
  value,
  unit,
  size = "md",
}: {
  value: string;
  unit: string;
  size?: "md" | "lg";
}) {
  return (
    <div className="px-2 text-center">
      <p
        className={cn(
          "font-extrabold font-mono tabular-nums leading-tight text-foreground",
          size === "lg" ? "text-h2" : "text-h3"
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-sm text-muted-foreground">{unit}</p>
    </div>
  );
}
