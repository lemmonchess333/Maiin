import BrandMark from "@/components/ui/BrandMark";
import { cn } from "@/lib/utils";

/**
 * The lockup on the signed-out screens (DS8 call 3): the mark in brand
 * purple beside the name. The name is set as a logo, in the figure face
 * at its heaviest (`.ds-wordmark`), not as a label, and it is the one
 * place the app writes its own name large. Its colour is the line's, so
 * the welcome can set it on its photographs.
 */
export default function AuthLockup({
  className,
  small = false,
}: {
  className?: string;
  /** The shared pages' size (owner, 22 Nov 2026): the card under it
   *  carries the lockup too, so the page's own is the small one. */
  small?: boolean;
}) {
  return (
    <p
      className={cn(
        "flex items-center text-foreground",
        small ? "gap-1.5" : "gap-2.5",
        className
      )}
    >
      <BrandMark className={small ? "h-4" : "h-[26px]"} />
      <span className={small ? "ds-wordmark ds-wordmark-small" : "ds-wordmark"}>
        Tropos
      </span>
    </p>
  );
}
