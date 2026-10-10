import type { RunSessionAbout } from "@/lib/runSessionAbout";

/**
 * "Why this run"'s four lines (Run21 (3)): what it is, how it should feel,
 * why it's in your week and what to do if it feels wrong. The reason is the
 * plan's and shows only with one; the other three come with the session.
 * A fifth, "Coaches also call this", gives the session's physiology name
 * where coaches use one (Run21 (2)).
 */
export default function RunAbout({
  about,
  why,
}: {
  about: RunSessionAbout | null;
  why?: string | null;
}) {
  const lines: [string, string][] = [];
  if (about) lines.push(["What it is", about.what]);
  if (about) lines.push(["How it should feel", about.feel]);
  if (why) lines.push(["Why it's in your week", why]);
  if (about) lines.push(["If it feels wrong", about.ifWrong]);
  // Run21 (2): the one place a physiology name appears.
  if (about?.alsoCalled)
    lines.push(["Coaches also call this", about.alsoCalled]);
  if (lines.length === 0) return null;
  return (
    <dl className="space-y-1.5">
      {lines.map(([term, text]) => (
        <div key={term}>
          <dt className="font-semibold text-foreground">{term}</dt>
          <dd>{text}</dd>
        </div>
      ))}
    </dl>
  );
}
