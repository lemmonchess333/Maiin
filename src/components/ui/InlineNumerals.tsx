/** Mixed prose keeps the text font; only its numerals use Archivo. */
export default function InlineNumerals({ children }: { children: string }) {
  return (
    <>
      {children.split(/(\d+(?:\.\d+)?)/).map((part, index) =>
        index % 2 ? (
          <span key={index} className="font-mono tabular-nums">
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  );
}
