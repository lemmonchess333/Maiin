/**
 * The longest name a run is saved under. The rules allow a post's title
 * 200 characters; a name is a line on a card, not a note.
 *
 * Its own module, with no imports, so the rename sheet's chunk cuts a name
 * without carrying the naming rules and the run templates they read
 * (`runName.ts`). The server cuts at the same length
 * (`functions/lib/runRename.js`, pinned by `runRename.cross.test.ts`).
 */
export const RUN_NAME_MAX = 80;
