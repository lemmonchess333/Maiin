import type { SVGProps } from "react";

// Lucide-style stroke icon for the Avocado macro tile.
// Lucide doesn't ship an Avocado, so this stays in the same visual
// language (24×24 viewBox, 2px stroke, currentColor, rounded caps) as
// the Beef + Wheat icons paired alongside it. Shape is a half-avocado:
// pear body with a large pit sitting in the upper centre — the pit
// proportion (~54% of body width) is what visually separates "avocado"
// from a generic teardrop silhouette.
export function Avocado(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* Body — pear, narrower at top, bulging wider at the bottom */}
      <path d="M12 2.5c-3.5 0-6.5 2.5-6.5 6.5 0 7 3 12.5 6.5 12.5s6.5-5.5 6.5-12.5c0-4-3-6.5-6.5-6.5z" />
      {/* Pit — large, upper-centred */}
      <circle cx="12" cy="10" r="3.5" />
    </svg>
  );
}

export default Avocado;
