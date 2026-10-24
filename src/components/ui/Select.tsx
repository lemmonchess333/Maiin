/**
 * Tropos design-system Select primitive.
 *
 * A native `<select>` on the `.ds-input` field, with the house chevron.
 * Native underneath on purpose: on iOS a select opens the system picker
 * wheel, the control a phone user already knows, and VoiceOver and the
 * keyboard get the platform's own handling. A custom listbox would trade
 * all of that for looks.
 *
 * The field is the text field's: `.ds-input` (components.css) gives the
 * radius, the 3:1 edge, the card fill, the inset, the 3rem floor (above
 * the 44px target) and the focus glow, so a select beside a text input
 * reads as the same kind of box. `appearance-none` drops the engine's own
 * arrow, which WebKit and Chromium draw differently, and the chevron here
 * replaces it with room cleared on the right.
 *
 * Focus: WebKit matches `:focus-visible` on a TAPPED select, so the global
 * keyboard outline would frame every tap on a phone. Focus that starts
 * with a pointer carries `.ds-input-pointer-focus` (components.css) until
 * blur; a keyboard focus never does and keeps the outline.
 *
 * Layout: `className` sizes the box (width, margin, flex) and the field
 * fills it, full width unless told otherwise. `fieldClassName` reaches the
 * select itself, for the rare one that must read as part of a figure (the
 * weight sheet's unit). `icon` puts a decorative glyph inside the field on
 * the left.
 *
 * Single choice only: `multiple` and `size` render a list box, which has
 * no chevron and is not this control.
 */
import { useState } from "react";
import type { ReactNode, Ref, SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "className" | "multiple" | "size"
> {
  children: ReactNode;
  /** Layout on the box: width, margin, flex. Full width by default. */
  className?: string;
  /** Type and inset on the select itself. */
  fieldClassName?: string;
  /** A decorative glyph inside the field, before the value. */
  icon?: ReactNode;
  ref?: Ref<HTMLSelectElement>;
}

export function Select({
  children,
  className,
  fieldClassName,
  icon,
  onPointerDown,
  onBlur,
  ref,
  ...rest
}: SelectProps) {
  const [pointerFocus, setPointerFocus] = useState(false);
  return (
    // A span, so the box can sit inside a <label> (phrasing content only).
    <span className={cn("relative block w-full", className)}>
      {icon ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 inline-flex -translate-y-1/2 text-muted-foreground"
        >
          {icon}
        </span>
      ) : null}
      <select
        ref={ref}
        {...rest}
        onPointerDown={(event) => {
          setPointerFocus(true);
          onPointerDown?.(event);
        }}
        onBlur={(event) => {
          setPointerFocus(false);
          onBlur?.(event);
        }}
        className={cn(
          "peer ds-input appearance-none cursor-pointer pr-10 text-sm disabled:cursor-not-allowed",
          icon && "pl-10",
          pointerFocus && "ds-input-pointer-focus",
          fieldClassName
        )}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground peer-disabled:opacity-50"
      />
    </span>
  );
}

export default Select;
