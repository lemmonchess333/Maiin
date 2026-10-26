/** Mixed prose: its numerals take the inline number tier (`font-mono`, the
 *  text face with tabular digits) at the weight of the words around them. */
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
