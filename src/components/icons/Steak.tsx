import type { SVGProps } from "react";

// Lucide-style stroke icon for the Protein macro tile.
// Lucide's `Beef` is stylised and reads as abstract at small sizes.
// This one is a T-bone steak: kidney-shaped meat outline with a
// clear T-shaped bone in the middle — the silhouette everyone
// recognises as "steak."
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
      {/* Meat outline — rounded kidney/oval */}
      <path d="M5 8c0-2 2-3 4-3h6c2 0 4 1 4 3v8c0 2-2 3-4 3H9c-2 0-4-1-4-3z" />
      {/* T-bone — vertical spine + horizontal crossbar */}
      <path d="M12 8v8" />
      <path d="M9 12h6" />
    </svg>
  );
}

export default Steak;
