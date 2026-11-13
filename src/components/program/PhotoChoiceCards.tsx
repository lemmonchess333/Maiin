import { useRef } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A choice drawn as photograph cards, two to a row (owner, 2026-11-13: Run
 * plan's running goal and distance, as Runna draws them). Each card is a
 * photograph under a scrim, its name and one fact at its foot in white, and
 * the chosen one has the running colour's outline and a tick.
 *
 * The same radiogroup as `SegmentedControl` (role, roving tabindex, arrows,
 * Home and End): a card's name is its label alone, and its fact is its
 * description, so "Marathon" is still the radio's name. An odd last card
 * takes the whole row. With larger text the cards go one to a row, and a
 * card grows taller rather than cutting its words.
 */
export interface PhotoChoice<T extends string> {
  value: T;
  label: string;
  /** One line under the name, e.g. "42.2 km · 12+ weeks". */
  fact: string;
  photo: string;
  /** Where the photograph's subject sits, as CSS object-position. */
  focus?: string;
}

export default function PhotoChoiceCards<T extends string>({
  ariaLabel,
  options,
  value,
  onChange,
  tall = false,
}: {
  ariaLabel: string;
  options: PhotoChoice<T>[];
  value: T | null | undefined;
  onChange: (next: T) => void;
  /** The taller card (the running goal), for a two-line name. */
  tall?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = options.findIndex((o) => o.value === value);
  const tabbable = selectedIndex >= 0 ? selectedIndex : 0;

  function select(index: number) {
    const option = options[index];
    if (!option) return;
    refs.current[index]?.focus();
    if (option.value !== value) onChange(option.value);
  }

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const last = options.length - 1;
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? index === last
          ? 0
          : index + 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? index === 0
            ? last
            : index - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : e.key === " " || e.key === "Enter"
                ? index
                : null;
    if (next === null) return;
    e.preventDefault();
    select(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      /* Two to a row, or one once larger text makes a card narrower than
         8.5rem (the minimum is in rem, so it grows with the text): a
         name like "Marathon" then has the row to itself. */
      className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,8.5rem),1fr))] gap-2"
    >
      {options.map((option, index) => {
        const selected = index === selectedIndex;
        const id = `${ariaLabel}-${option.value}`.replace(/\s+/g, "-");
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-labelledby={`${id}-label`}
            aria-describedby={`${id}-fact`}
            tabIndex={index === tabbable ? 0 : -1}
            onClick={() => select(index)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              "photo-choice relative isolate flex overflow-hidden rounded-xl text-left",
              "motion-safe:transition-transform active:scale-[0.98]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              tall ? "min-h-[104px]" : "min-h-[88px]",
              // An odd last card takes the whole row.
              options.length % 2 === 1 && index === options.length - 1
                ? "col-span-full"
                : undefined,
              /* An outline, so the photograph keeps its edge. */
              selected && "outline outline-2 outline-offset-2 outline-running"
            )}
          >
            <img
              src={option.photo}
              alt=""
              aria-hidden="true"
              decoding="async"
              draggable={false}
              className="absolute inset-0 -z-10 size-full object-cover"
              style={{ objectPosition: option.focus ?? "center" }}
            />
            <span aria-hidden="true" className="photo-choice-scrim -z-10" />
            <span className="mt-auto flex flex-col gap-0.5 p-3 text-stage-foreground">
              <span
                id={`${id}-label`}
                className="text-lg font-bold leading-tight tracking-tight"
              >
                {option.label}
              </span>
              <span
                id={`${id}-fact`}
                className="text-xs font-medium text-stage-foreground/85"
              >
                {option.fact}
              </span>
            </span>
            {selected && (
              <span
                aria-hidden="true"
                className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-running text-white"
              >
                <Check className="size-3.5" strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
