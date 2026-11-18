const loaders: Record<string, () => Promise<unknown>> = {
  "/": () => import("@/pages/Home"),
  // Train is its page under the route that holds its engine, and a
  // session's page is one tap from it: all four at once, so neither the
  // way in nor a session waits on a chunk.
  "/program": () =>
    Promise.all([
      import("@/features/program/ProgramEngineRoute"),
      import("@/pages/Program"),
      import("@/pages/LiftSession"),
      import("@/pages/RunSession"),
    ]),
  "/food": () => import("@/pages/Food"),
  "/social": () => import("@/pages/Social"),
  "/history": () => import("@/pages/History"),
};

const pending = new Map<string, Promise<unknown>>();

/** Warm only the destination the person is approaching. Opening Home used
 * to import Food and Train immediately, including their closed editors.
 * Failed speculation must not navigate, reload, or prevent a later retry. */
export function preloadTab(path: string): void {
  const load = loaders[path];
  if (!load || pending.has(path)) return;
  pending.set(
    path,
    load().catch(() => {
      pending.delete(path);
    })
  );
}
