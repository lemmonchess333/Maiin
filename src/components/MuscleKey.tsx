import { memo } from "react";
import { titleCaseMuscle } from "@/lib/muscleNames";
import { THEME } from "@/lib/theme";

/**
 * The muscles a demo works, as a KEY rather than a list.
 *
 * It used to be two rows of chips prefixed "Primary:" / "Secondary:".
 * Owner, 2026-09-03, comparing it against a printed form card: "the
 * pills we have aren't that good, I think these look better." The card
 * was right, and for one reason that is not styling — its swatches tie
 * each tier to a colour on the figure, so it explains the picture. A
 * chip row only names muscles; the reader is left to guess which purple
 * shape is which.
 *
 * So: a swatch per tier in its own paint, the names in plain text, and
 * no chips. The chips carried no information the text did not, and two
 * of them at different weights read as two kinds of thing.
 *
 * The card's third tier ("Core (Stabilizers)", greyed) is deliberately
 * NOT copied. Nothing in the catalogue records stabilisers and no demo
 * paints them, and a key entry for something the picture does not show
 * is a key to nothing.
 */
export interface MuscleKeyProps {
  primary: string[];
  secondary: string[];
  /** How the figure paints the secondary tier. The rig pales the
   *  purple; supplied card art hatches it. */
  secondaryFill?: "solid" | "hatch";
}

const HATCH = `repeating-linear-gradient(45deg, ${THEME.lifting} 0 1.6px, transparent 1.6px 3.4px)`;

function Row({
  label,
  names,
  swatch,
}: {
  label: string;
  names: string[];
  swatch: React.CSSProperties;
}) {
  if (names.length === 0) return null;
  return (
    <div className="flex items-baseline gap-2">
      <span className="flex shrink-0 items-center gap-1.5">
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0 rounded-full"
          style={swatch}
        />
        <span className="text-caption uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </span>
      <span className="text-small text-foreground/85">
        {names.map(titleCaseMuscle).join(", ")}
      </span>
    </div>
  );
}

function MuscleKey({
  primary,
  secondary,
  secondaryFill = "solid",
}: MuscleKeyProps) {
  return (
    <div className="mt-4 flex flex-col gap-1.5">
      <Row
        label="Primary"
        names={primary}
        swatch={{ background: THEME.lifting }}
      />
      <Row
        label="Secondary"
        names={secondary}
        swatch={
          secondaryFill === "hatch"
            ? { background: HATCH }
            : { background: THEME.liftingLight }
        }
      />
    </div>
  );
}

export default memo(MuscleKey);
