/** Coaching context is available on demand, beside the prescription. */
export default function RunPurpose({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <details className="group text-xs text-muted-foreground">
      <summary className="min-h-11 flex items-center gap-2 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 list-none before:content-['+'] group-open:before:content-['−']">
        Why this run
      </summary>
      <p className="pb-2 leading-relaxed">{children}</p>
    </details>
  );
}
