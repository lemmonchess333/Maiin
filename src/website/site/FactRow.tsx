/**
 * A row of the app's numbers, each with what it counts: a figure in the
 * figure face (DESIGN_GUIDE §0 rule 3) over a short label. Two to a row
 * on a phone, four on a wide window.
 */
export default function FactRow({
  facts,
  label,
}: {
  facts: readonly { figure: string; label: string }[];
  /** What the row is, for a screen reader. */
  label: string;
}) {
  return (
    <div className="mx-auto max-w-[70rem] px-4 lg:px-8">
      <dl
        aria-label={label}
        className="grid grid-cols-2 gap-x-6 gap-y-8 border-y border-white/[0.06] py-8 lg:grid-cols-4"
      >
        {facts.map((fact) => (
          <div
            key={fact.label}
            className="flex flex-col-reverse justify-end gap-1.5"
          >
            <dt className="text-sm leading-snug text-muted-foreground">
              {fact.label}
            </dt>
            <dd className="font-figure text-[2rem] font-extrabold leading-none tabular-nums text-foreground lg:text-[2.5rem]">
              {fact.figure}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
