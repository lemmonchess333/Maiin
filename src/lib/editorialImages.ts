/**
 * Editorial imagery: the race and Space photographs.
 *
 * Reference-app conformance: Runna puts the real race location behind a
 * race's plan, and Strava's clubs carry a cover; the dominant apps draw
 * their challenges as their own badge or medal art and keep the activity
 * feed to the person's own data. Tropos follows the same line: a
 * photograph only for a place or a community (a race, a Space), each
 * challenge its own medal (`MedalArt`, Soc16), and the feed the person's
 * routes, figures and photos. Recorded in GLOSSARY.md under "Editorial
 * imagery".
 *
 * HOW TO ADD PHOTOS (operator): drop licensed images with recorded
 * provenance into `src/assets/editorial/` as `space-<spaceId>` — see the
 * README in that directory. Everything is resolved at build time via
 * import.meta.glob, so a missing file simply resolves to null and the
 * surface renders its designed no-photo fallback (the tinted band with
 * the ghosted icon). No code change needed when assets land.
 */

const files = import.meta.glob<string>(
  "/src/assets/editorial/*.{webp,avif,jpg,jpeg,png}",
  { eager: true, query: "?url", import: "default" }
);

function byStem(stem: string): string | null {
  for (const [path, url] of Object.entries(files)) {
    const name = path.split("/").pop() ?? "";
    if (name.replace(/\.(webp|avif|jpe?g|png)$/i, "") === stem) return url;
  }
  return null;
}

/** Editorial photo URL for a community space (Spc1 PR2) — stems are
 *  `space-<spaceId>` per the spaceDefs contract, e.g.
 *  `space-womens-running.webp`. Null until the editorial asset lands
 *  (the directory card renders its tinted fallback band). */
export function spaceEditorialImage(spaceId: string): string | null {
  return byStem(`space-${spaceId}`);
}
