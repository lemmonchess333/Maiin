import type { SVGProps } from "react";

// Lucide-style stroke icon for the Avocado macro tile.
// Lucide doesn't ship an Avocado. Shape: half-avocado with the
// narrow stem end at top (small nub), wider fleshy base at bottom,
// pit sitting in the lower-centre where the real seed sits. The
// previous version had the pit in the upper half which read
// upside-down.
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
      {/* Stem nub — short diagonal stroke off the top */}
      <path d="M12 4.5 L10.5 2" />
      {/* Body — pear silhouette, narrow at top (stem end), wider + rounder at bottom */}
      <path d="M12 4.5c-3.5 0-6.5 2.5-6.5 6 0 6 3 11 6.5 11s6.5-5 6.5-11c0-3.5-3-6-6.5-6z" />
      {/* Pit — lower-centre (where real avocado seed sits in the wide flesh) */}
      <circle cx="12" cy="14" r="3.5" />
    </svg>
  );
}
