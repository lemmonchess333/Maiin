import type { SVGProps } from "react";

// Lucide-style stroke icon for the Protein macro tile.
// Lucide's Beef reads as abstract; an earlier T-bone attempt read as
// a medical-kit plus. This is a cross-section cut: main muscle body,
// curved fat cap above it, single wavy marbling streak through the
// middle. Reads as "steak" without looking like a health icon.
export function Steak(props: SVGProps<SVGSVGElement>) {
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
      {/* Main muscle body — flat-topped oval */}
      <path d="M4 14c0-4 4-7 8-7s8 3 8 7c0 2-2 5-8 5s-8-1-8-5z" />
      {/* Fat cap — curved bracket above the body */}
      <path d="M5 13c1-3 4-5 7-5s6 2 7 5" />
      {/* Marbling — single wavy streak through the centre */}
      <path d="M8 15c1.5 0 3-.5 4 0s2.5.5 4 0" />
    </svg>
  );
}

export default Steak;
