import BrandMark from "@/components/ui/BrandMark";
import { cn } from "@/lib/utils";

/**
 * The lockup on the signed-out screens (DS8 call 3): the mark in brand
 * purple beside the name. The name is set as a logo, in the figure face
 * at its heaviest (`.ds-wordmark`), not as a label, and it is the one
 * place the app writes its own name large.
 */
export default function AuthLockup({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-center gap-2.5", className)}>
      <BrandMark className="h-[26px]" />
      <span className="ds-wordmark text-foreground">Tropos</span>
    </p>
  );
}
