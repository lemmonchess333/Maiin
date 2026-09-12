/**
 * Page entrance motion — the variants every route-level page uses.
 *
 * A `.ts` sibling rather than an export from `PageShell.tsx`, for the same
 * reason `buttonClasses.ts` sits beside `Button.tsx`: the react-refresh
 * lint rule requires a component file to export only components, so a
 * shared constant needs its own module. `PageShell` consumes these; pages
 * import `pageItemVariant` for the sections they animate in themselves.
 *
 * One definition. Food, Social and History each declared this object
 * identically and Home inlined it.
 */
export const pageItemVariant = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export const pageStaggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};
