import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { MEAL_ORDER, MEAL_LABELS, type MealKey } from "./mealConstants";

interface FoodMealChipProps {
  /** The meal a log goes to. Null when none is chosen (the page clears
   *  it on a change of day): the chip then reads "Meal", and a log takes
   *  its meal from the time it is made, as it always has. */
  meal: MealKey | null;
  /** A different meal was picked. Never called with the meal already
   *  chosen: picking that one only closes the menu. */
  onChange: (meal: MealKey) => void;
  /** The menu is opening; the composer puts its suggestions away. */
  onOpen?: () => void;
}

/**
 * The composer's meal: one chip inside the field, saying where a log
 * goes, which opens the four meals (Food11 call 3).
 *
 * It replaces a row of four meal buttons above the field. The meal is
 * already chosen by the time of day, so three of those four were on
 * screen to be right about once a day each, at 62px of the first screen.
 * A row of meals was in none of the ten logging flows looked at; where a
 * meal can be changed it is through a menu. The cost, accepted in the
 * lock: changing the meal is two taps where it was one.
 *
 * A menu of exclusive choices: the chip is its button, the items are
 * `menuitemradio`. Arrows move through them, Escape or a tap outside
 * closes it and gives the chip back the focus, and leaving it with Tab
 * closes it.
 */
export default function FoodMealChip({
  meal,
  onChange,
  onOpen,
}: FoodMealChipProps) {
  const [open, setOpen] = useState(false);
  const chipRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const items = () =>
    Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitemradio"]'
      ) ?? []
    );

  /* Opening puts the focus on the meal already chosen, or on the first. */
  useEffect(() => {
    if (!open) return;
    const all = items();
    (
      all.find((el) => el.getAttribute("aria-checked") === "true") ?? all[0]
    )?.focus();
  }, [open]);

  const dismiss = () => {
    setOpen(false);
    chipRef.current?.focus();
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      dismiss();
      return;
    }
    const all = items();
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    const to =
      event.key === "ArrowDown"
        ? (at + 1) % all.length
        : event.key === "ArrowUp"
          ? (at - 1 + all.length) % all.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? all.length - 1
              : -1;
    if (to < 0) return;
    event.preventDefault();
    all[to]?.focus();
  };

  return (
    <div
      /* Above the field's other controls (the text box is 1, send 2).
         The menu and the layer that catches a tap outside it are drawn
         inside this box, so its level is theirs: at 1, the text box,
         which comes later, lay over the open menu wherever the two met
         (the narrow layout, where the text is the row under the chip)
         and took the taps meant for the first meals. */
      className="relative z-[3] ml-[4px] flex shrink-0 self-center"
      onBlur={(event) => {
        // Tab out of the menu closes it; a move inside it does not.
        if (event.currentTarget.contains(event.relatedTarget as Node | null))
          return;
        setOpen(false);
      }}
    >
      <button
        ref={chipRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={
          meal ? `Add to ${MEAL_LABELS[meal]}. Change meal` : "Choose a meal"
        }
        onClick={() => {
          haptic();
          if (!open) onOpen?.();
          setOpen(!open);
        }}
        /* 44px tall in px, as the field's other controls are: a control
           keeps its size when the text grows. A step lighter than the
           field in dark and a step darker in light, from one token. */
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[11px] bg-foreground/[0.07] px-[10px] text-sm font-semibold text-foreground chip-edge transition-transform active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {/* The food orange, as a dot: the chip is a neutral control, and
            the dot says the meal is set. */}
        {meal && (
          <span
            aria-hidden="true"
            className="size-[6px] shrink-0 rounded-full bg-nutrition-strong"
          />
        )}
        <span className="whitespace-nowrap">
          {meal ? MEAL_LABELS[meal] : "Meal"}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground"
        />
      </button>
      {open && (
        <>
          {/* A tap anywhere else closes the menu and does nothing more. */}
          <div
            className="fixed inset-0 z-10"
            role="presentation"
            aria-hidden="true"
            onClick={dismiss}
          />
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label="Add to meal"
            tabIndex={-1}
            onKeyDown={onMenuKeyDown}
            /* At least 190px, and as wide as its longest meal: at
               double text "Breakfast" is wider than 190px. */
            className="absolute left-[-4px] top-[calc(100%+8px)] z-20 w-max min-w-[190px] max-w-[calc(100vw-32px)] rounded-2xl bg-card py-1 card-shadow"
          >
            {MEAL_ORDER.map((key) => {
              const chosen = key === meal;
              return (
                <button
                  key={key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={chosen}
                  tabIndex={-1}
                  onClick={() => {
                    setOpen(false);
                    if (chosen) chipRef.current?.focus();
                    else onChange(key);
                  }}
                  className={cn(
                    "flex min-h-[44px] w-full items-center gap-2 px-3.5 text-left text-base font-semibold transition-colors hover:bg-muted focus:outline-none focus-visible:bg-muted",
                    chosen ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-[6px] shrink-0 rounded-full bg-nutrition-strong",
                      !chosen && "invisible"
                    )}
                  />
                  {MEAL_LABELS[key]}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
