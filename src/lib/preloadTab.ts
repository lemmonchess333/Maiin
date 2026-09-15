const loaders: Record<string, () => Promise<unknown>> = {
  "/": () => import("@/pages/Home"),
  "/program": () => import("@/pages/Program"),
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
