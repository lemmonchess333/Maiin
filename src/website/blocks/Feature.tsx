import type { ReactNode } from "react";
import { Check } from "lucide-react";

/**
 * One thing the app does: a headline a person would say out loud, two
 * sentences, a short list and one picture (an app screen or a drawing).
 * Pictures alternate sides down a wide page (`flip`) and stack under the
 * words on a phone.
 */
export default function Feature({
  title,
  children,
  points,
  picture,
  flip = false,
  checkClass = "text-lifting-strong",
}: {
  title: string;
  children: ReactNode;
  points?: readonly string[];
  /** Left out, the words take the column alone. */
  picture?: ReactNode;
  flip?: boolean;
  /** The list's ticks: the page's sport colour, strong step. */
  checkClass?: string;
}) {
  return (
    <section className="site-section">
      <div
        className={
          picture
            ? "site-container grid items-center gap-10 md:grid-cols-2 md:gap-16"
            : "site-container max-w-[48rem]"
        }
      >
        <div className={flip ? "md:order-2" : undefined}>
          <h2 className="site-h2">{title}</h2>
          <div className="site-lede mt-4 space-y-3 text-muted-foreground">
            {children}
          </div>
          {points && points.length > 0 && (
            <ul className="mt-6 space-y-3">
              {points.map((point) => (
                <li key={point} className="flex gap-3 text-base">
                  <Check
                    className={`size-5 shrink-0 mt-0.5 ${checkClass}`}
                    strokeWidth={2.5}
                    aria-hidden="true"
                  />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {picture && (
          <div className={flip ? "md:order-1" : undefined}>{picture}</div>
        )}
      </div>
    </section>
  );
}
