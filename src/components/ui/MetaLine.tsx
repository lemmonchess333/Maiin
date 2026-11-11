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
 * cannot tap should not borrow it. Numerals take the inline number tier
 * (`font-mono`: the text face with tabular digits, at the line's own
 * weight), never the figure face, so "~43 min" reads as one run of text
 * whose digits hold still. Wraps as text between items, each
 * item stays whole, and the separators are decorative and hidden from
 * readers.
 *
 * A separator never ends or starts a line. Each one sits in a 0.6em box
 * held to the item after it, so a line can only break before a dot.
 * The whole line is drawn 0.6em to the left inside a clipped box, and
 * every item has that box ahead of it (the first an empty one), so
 * the box that opens a line, dot or not, falls in the clipped strip.
 * The text still reads "3 exercises · about 30 min".
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
        "overflow-hidden text-muted-foreground leading-snug",
        className
      )}
    >
      <span className="-ml-[0.6em] block">
        {items.map((item, i) => (
          <Fragment key={item}>
            {i > 0 && " "}
            <span className="whitespace-nowrap">
              <span
                aria-hidden="true"
                data-meta-separator=""
                className="inline-block w-[0.6em] whitespace-pre text-center"
              >
                {i > 0 ? "· " : ""}
              </span>
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
      </span>
    </p>
  );
}
