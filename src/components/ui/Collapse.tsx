import { useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMotionSafe } from "@/hooks/useMotionSafe";
import { cn } from "@/lib/utils";

/* Entering and leaving, so the strong ease-out; a section is small, so
   200ms. */
const OPEN_CLOSE = { duration: 0.2, ease: [0.23, 1, 0.32, 1] } as const;

const CLOSED = { height: 0, opacity: 0 };
const OPEN = { height: "auto", opacity: 1, pointerEvents: "auto" } as const;
const CLOSING = { height: 0, opacity: 0, pointerEvents: "none" } as const;

/**
 * A section that opens in place under the control that shows it: "Other
 * amount" on the water sheet, a card's details, a day picker.
 *
 * Shown with a bare conditional, a section snapped open: everything below
 * it jumped by its height in one frame, and inside a bottom sheet the
 * sheet's top edge leapt up. Here its height and opacity open together,
 * and it closes the way it opened.
 *
 * Clipped only while it moves, so a still, open section draws its
 * children's focus rings past its edge. The clip is set from the
 * animation's own start and end: framer's `transitionEnd`, the usual way,
 * never runs in this version. Closing, it takes no taps: a list shrinking
 * under the finger would take the second tap of a double tap. Its content
 * sits in a flow root, so a child's margin stays inside the height being
 * measured. A section already open when it mounts just shows (Pol1).
 * Under Reduce Motion, `MotionConfig` settles the height and
 * `useMotionSafe` takes the fade out, so the section is simply there.
 *
 * Closed, the children are not mounted, as with the conditional it
 * replaces; `id` goes on the section, for the control's `aria-controls`.
 * Children that cost something to build, or that need what `open` checked,
 * come as a function: it runs only while the section is open, and the
 * section closes on what it last drew.
 */
export function Collapse({
  open,
  id,
  className,
  children,
}: {
  open: boolean;
  id?: string;
  /** On the content: its spacing and layout. */
  className?: string;
  children: ReactNode | (() => ReactNode);
}) {
  const section = useRef<HTMLDivElement>(null);
  const motionSafe = useMotionSafe();
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="collapse"
          ref={section}
          id={id}
          initial={motionSafe(CLOSED)}
          animate={OPEN}
          exit={motionSafe(CLOSING)}
          transition={OPEN_CLOSE}
          onAnimationStart={() => {
            if (section.current) section.current.style.overflow = "hidden";
          }}
          onAnimationComplete={(definition) => {
            if (definition === OPEN && section.current)
              section.current.style.overflow = "";
          }}
        >
          <div className={cn("flow-root", className)}>
            {typeof children === "function" ? children() : children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default Collapse;
