/** What Tropos is, in the welcome's own words, for the signed-out pages a
 *  shared link opens (a post's, a card's). `line`: the one line under the
 *  button (owner, 22 Nov 2026); otherwise the heading and its sentence. */
export default function AboutTropos({ line = false }: { line?: boolean }) {
  if (line) {
    return (
      <p className="mt-3 text-center text-sm text-muted-foreground">
        Your training and food, planned together.
      </p>
    );
  }
  return (
    <div>
      <h2 className="text-lg font-bold leading-snug text-foreground text-balance">
        Your training and food, planned together
      </h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Answer a few questions and get a week of training and a daily calorie
        target that fit you.
      </p>
    </div>
  );
}
