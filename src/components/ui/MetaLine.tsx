import { Fragment } from "react";
import { cn } from "@/lib/utils";

interface MetaLineProps {
  items: string[];
  /** "sm" is the command-card line; "xs" sits inside dense list cards and
   *  sheets, matching their own meta size. */
  size?: "sm" | "xs";
  className?: string;
}

/**
 * One quiet line of static facts — "5 exercises · ~43 min" — never a row
 * of pills. A pill is the shape of a selection or a state; a fact the user
 * cannot tap should not borrow it. Numerals take the numeral font (Archivo,
 * tabular) and words stay in the text font, so a mixed token like "~43 min"
 * keeps both fonts where they belong. Wraps as text between items, each
 * item stays whole, and the separators are decorative and hidden from
 * readers.
 */
export default function MetaLine({
  items,
  size = "sm",
  className,
}: MetaLineProps) {
  if (items.length === 0) return null;
  return (
    <p
      className={cn(
        size === "sm" ? "text-sm" : "text-xs",
        "text-muted-foreground leading-snug",
        className
      )}
    >
      {items.map((item, i) => (
        <Fragment key={item}>
          {i > 0 && (
            <>
              {" "}
              <span aria-hidden="true">·</span>{" "}
            </>
          )}
          <span className="whitespace-nowrap">
            {item.split(" ").map((token, j) => (
              <Fragment key={j}>
                {j > 0 && " "}
                <span
                  className={cn(/\d/.test(token) && "font-mono tabular-nums")}
                >
                  {token}
                </span>
              </Fragment>
            ))}
          </span>
        </Fragment>
      ))}
    </p>
  );
}
