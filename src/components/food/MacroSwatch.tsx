import { cn } from "@/lib/utils";

/**
 * A macro's colour beside its words (DS10 call 3): the words are the text
 * colour, so they clear 4.5:1 on every surface, and the colour that tells
 * protein, carbs and fat apart is this dot, a fill held to 3:1.
 */
export default function MacroSwatch({
  color,
  className,
}: {
  color: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ background: color }}
    />
  );
}
