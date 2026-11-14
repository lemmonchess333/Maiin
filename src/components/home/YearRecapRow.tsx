import { Suspense, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cardClasses } from "@/components/ui/cardClasses";
import RevealBoundary from "@/components/RevealBoundary";
import { haptic } from "@/lib/haptic";
import { lazyRetry } from "@/lib/lazyRetry";
import { yearRecapDue, type YearRecapDue } from "@/lib/proReport";

/* The recap and its year of reads load only when it is opened: most
   visits to Home have no recap due. A chunk that fails to load closes it
   quietly and leaves the row. */
const YearRecap = lazyRetry(() => import("@/components/review/YearRecap"), {
  reloadOnChunkError: false,
});

/**
 * "Your year with Pro", on Home in the week before a yearly Pro plan
 * renews (App1 Q56), as one row that opens the recap full screen. It does
 * not open by itself: a reward never opens over Home on its own
 * (ADR-0004's amendment), and the badge waits on the same kind of row.
 *
 * Once the year has drawn, the account records the renewal it was for
 * (`yearRecapShownFor`), so the row goes on every device and comes back
 * before the next renewal. Who sees it is `yearRecapDue`.
 */
export default function YearRecapRow() {
  const { profile, updateProfile } = useAuth();
  /* Read when Home draws; the row's window is days long, so a visit that
     spans its edge is told on the next one. */
  const [now] = useState(() => new Date());
  const due = yearRecapDue(profile, now);
  /* The recap stays open on the renewal it opened for, though recording
     it takes the row away. */
  const [open, setOpen] = useState<YearRecapDue | null>(null);

  const shown = useCallback(() => {
    if (open) void updateProfile({ yearRecapShownFor: open.key });
  }, [open, updateProfile]);
  const close = useCallback(() => setOpen(null), []);

  return (
    <>
      {due && !open && (
        <button
          type="button"
          onClick={() => {
            haptic("light");
            setOpen(due);
          }}
          className={cardClasses({
            size: "compact",
            className:
              "w-full min-h-11 flex items-center gap-3 text-left active:scale-[0.97] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          })}
        >
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-lifting/12"
          >
            <Sparkles className="size-4 text-lifting-strong" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-medium text-muted-foreground">
              Pro renews soon
            </span>
            <span className="block text-sm font-semibold text-foreground truncate">
              Your year with Pro
            </span>
          </span>
          <ChevronRight
            className="size-4 text-muted-foreground shrink-0"
            aria-hidden="true"
          />
        </button>
      )}
      {open &&
        createPortal(
          <RevealBoundary key={open.key} onError={close}>
            <Suspense fallback={null}>
              <YearRecap due={open} onShown={shown} onClose={close} />
            </Suspense>
          </RevealBoundary>,
          document.body
        )}
    </>
  );
}
