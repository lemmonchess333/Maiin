/**
 * Muscle-name presentation.
 *
 * Two data sources feed the Form tab's muscle key and they disagree
 * about case: the local catalogue title-cases ("Rear Delts", "Teres
 * Major"), the borrowed free-exercise-db does not ("chest", "triceps"),
 * and which one an exercise resolves to depends on whether it carries
 * local instructions. So the same row reads differently between two
 * exercises for a reason no reader could infer.
 *
 * Normalised at the point of DISPLAY rather than in the data: the
 * borrowed names are matched against elsewhere (`MUSCLE_MAP` keys the
 * body-highlighter lookup off the lowercase form), so rewriting them at
 * the source would break the diagram to tidy a caption.
 */

/** Title-case a muscle name for display. Already-capitalised names pass
 *  through unchanged, so a catalogue name is never mangled. */
export function titleCaseMuscle(name: string): string {
  return name.replace(
    /(^|[\s-])([a-z])/g,
    (_, sep: string, c: string) => `${sep}${c.toUpperCase()}`
  );
}
