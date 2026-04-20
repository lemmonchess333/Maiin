import type { SVGProps } from "react";

// Lucide-style stroke icon for the Avocado macro tile.
// Lucide doesn't ship an Avocado, so this stays in the same visual
// language (24×24 viewBox, 2px stroke, currentColor, rounded caps)
// as the Beef + Wheat icons paired alongside it.
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
      {/* Pear-shaped body — narrower top, rounded base */}
      <path d="M12 3c-3.3 0-6 2.7-6 7 0 5 2.5 11 6 11s6-6 6-11c0-4.3-2.7-7-6-7z" />
      {/* Pit */}
      <circle cx="12" cy="13" r="2.5" />
    </svg>
  );
}

export default Avocado;
