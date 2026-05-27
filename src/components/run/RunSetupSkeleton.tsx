/**
 * Placeholder rendered while useProgram() resolves for
 * structured / race_prep users. Matches the rough shape of the
 * Run-setup modal so the surface doesn't shift when programme data
 * arrives:
 *
 *   - 28px context-strip placeholder
 *   - card-sized selected-run placeholder
 *
 * Only shown after a 100ms threshold (Run.tsx gates this) so the
 * common case — cached Firestore read returns in <100ms — renders
 * the real modal directly. The skeleton is for the cold-load tail.
 *
 * Freeform users skip this entirely.
 */
export default function RunSetupSkeleton() {
  return (
    <div className="flex-1 flex flex-col bg-background text-foreground">
      <div className="px-4 pt-16 pb-6 space-y-4">
        <div className="h-7 w-40 rounded-md bg-muted/60 animate-pulse" />
        {/* Context-strip placeholder — purple-tinted like the real strip */}
        <div
          className="h-7 rounded-xl animate-pulse"
          style={{ background: "rgba(123,114,233,0.10)" }}
          aria-hidden="true"
        />
        {/* Selected-run card placeholder — matches the real card shape */}
        <div className="w-full rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
          <div className="size-11 rounded-xl bg-muted/60 animate-pulse shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 rounded-md bg-muted/60 animate-pulse" />
            <div className="h-3 w-48 rounded-md bg-muted/40 animate-pulse" />
          </div>
        </div>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        Loading your plan…
      </p>
    </div>
  );
}
