import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import {
  arrow,
  autoUpdate,
  flip,
  FloatingArrow,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
} from "@floating-ui/react";
import { motion, AnimatePresence } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/**
 * Reserve `Tooltip` and `Coachmark` for genuinely opaque elements:
 * computed metrics where the formula isn't visible, icon-only navigation,
 * non-obvious state changes. If a clearer visible label fixes it, use
 * the label. Tropos reads as calm; stacked explainers make it nervy.
 *
 * Tap-to-toggle on the anchor opens the body. Outside-tap, anchor
 * re-tap, and Escape all dismiss. Body renders to a `document.body`
 * portal at z-40 so it escapes parent `overflow:hidden` traps and
 * sits above the bottom nav (z-30) but below vaul drawers (z-50).
 */

export type TooltipPlacement = "top" | "bottom" | "left" | "right";

interface TooltipProps {
  content: ReactNode;
  /** Preferred placement; auto-flips when the anchor is too close to a viewport edge. */
  placement?: TooltipPlacement;
  /** Controlled mode. Coachmark uses this to drive open state from useCoachMarks. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  closeOnOutsideTap?: boolean;
  closeOnAnchorTap?: boolean;
  /** Single React element acting as the anchor. Receives a ref + interaction handlers + aria-describedby. */
  children: ReactElement;
}

export default function Tooltip({
  content,
  placement = "top",
  open: controlledOpen,
  onOpenChange,
  closeOnOutsideTap = true,
  closeOnAnchorTap = true,
  children,
}: TooltipProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  const arrowRef = useRef<SVGSVGElement>(null);
  const id = useId();
  const reduced = useReducedMotion();

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    middleware: [
      offset(8),
      flip(),
      shift({ padding: 8 }),
      /* floating-ui's `arrow` middleware reads the ref lazily during
         positioning (effect-time), not during render. The lint rule
         doesn't model third-party hook conventions, so we disable it
         here rather than dropping to a state-backed ref that re-renders
         on attach. */
      // eslint-disable-next-line react-hooks/refs
      arrow({ element: arrowRef }),
    ],
    whileElementsMounted: autoUpdate,
  });

  const click = useClick(context, { enabled: closeOnAnchorTap, toggle: true });
  const dismiss = useDismiss(context, {
    outsidePress: closeOnOutsideTap,
    escapeKey: true,
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss]);

  const child = Children.only(children);
  const anchor = isValidElement(child)
    ? cloneElement(child, {
        ref: refs.setReference as Ref<unknown>,
        "aria-describedby": open ? id : undefined,
        ...getReferenceProps(),
        /* Preserve the child's own onClick / handlers — getReferenceProps
           already merges floating-ui's listeners with the existing props
           via cloneElement spread order. */
      } as Record<string, unknown>)
    : children;

  const portalTarget = typeof document !== "undefined" ? document.body : null;

  return (
    <>
      {anchor}
      {portalTarget &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={refs.setFloating}
                id={id}
                role="tooltip"
                style={floatingStyles}
                className="z-40 max-w-[280px] rounded-lg border border-border bg-card px-3 py-2 shadow-lg"
                initial={{ opacity: 0, y: reduced ? 0 : 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduced ? 0 : 4 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                {...getFloatingProps()}
              >
                <div className="text-xs leading-snug text-foreground">{content}</div>
                <FloatingArrow
                  ref={arrowRef}
                  context={context}
                  width={12}
                  height={6}
                  className="fill-card [&>path:first-of-type]:stroke-border [&>path:last-of-type]:stroke-card"
                />
              </motion.div>
            )}
          </AnimatePresence>,
          portalTarget,
        )}
    </>
  );
}
