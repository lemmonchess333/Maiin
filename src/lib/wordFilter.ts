/**
 * The word filter, loaded when public text is first checked.
 *
 * `profanityFilter.ts` carries leo-profanity's word lists (French and
 * Russian among them) and the hate terms: about 100 KB. A static import
 * puts them in every screen that reaches a composer or a Circle name:
 * the Social tab, Spaces, profiles, a run's finish screen, setup, and
 * the share sheet App.tsx mounts on every signed-in launch. They load
 * here instead, when a composer opens or a name is drawn.
 *
 * Every check still runs before its write: a composer reads the filter
 * from `useWordFilter` and holds its send while it is loading, and a
 * submit that checks on the tap awaits `loadWordFilter()` first. The
 * server is the trust boundary either way; this is the half that keeps
 * the person's words in the box with a reason.
 */
type WordFilterModule = typeof import("./profanityFilter");

/** The part of the filter a check needs. */
export type WordFilter = Pick<WordFilterModule, "containsProfanity">;

let loaded: WordFilterModule | null = null;
let loading: Promise<WordFilterModule> | null = null;

/** The filter, loading it on the first call. A failed load is forgotten,
 *  so the next check tries again. */
export function loadWordFilter(): Promise<WordFilter> {
  loading ??= import("./profanityFilter").then(
    (filter) => (loaded = filter),
    (err: unknown) => {
      loading = null;
      throw err;
    }
  );
  return loading;
}

/** The filter if it has loaded, else null. */
export function loadedWordFilter(): WordFilter | null {
  return loaded;
}
