import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  buttonClasses,
  type ButtonVariant,
} from "@/components/ui/buttonClasses";

/**
 * The Analytics tab's inline first-run row: "you haven't logged X yet"
 * + one sport-coded CTA. History previously carried three near-identical
 * copies (first run / first workout / first meal) whose shared skeleton
 * was held together by copy-paste; this is the single home. It's an
 * INLINE row shape, distinct from the centered EmptyState primitive —
 * these sit inside a populated page section, not an empty screen.
 *
 * Markup is byte-identical to the rows it replaced (zero visual delta).
 */
interface Props {
  /** Sport-coded icon, sized by the caller (`size-5 shrink-0` + tint). */
  icon: ReactNode;
  text: string;
  to: string;
  ctaLabel: string;
  variant: ButtonVariant;
}

export default function SectionEmptyCTA({
  icon,
  text,
  to,
  ctaLabel,
  variant,
}: Props) {
  return (
    <div className="p-4 rounded-2xl bg-card flex items-center gap-3 card-shadow">
      {icon}
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">{text}</p>
      </div>
      <Link
        to={to}
        className={buttonClasses({ variant, className: "shrink-0" })}
      >
        {ctaLabel}
      </Link>
    </div>
  );
}
