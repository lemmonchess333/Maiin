import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRO_INCLUDES } from "./proIncludesCopy";

/** The checked list of what Pro includes (`PRO_INCLUDES`), shared by the
 *  offer and a Pro member's card on the Pro page. */
export default function ProIncludes({ className }: { className?: string }) {
  return (
    <ul
      aria-label="What Pro includes"
      className={cn("space-y-1.5 text-sm text-foreground", className)}
    >
      {PRO_INCLUDES.map((line) => (
        <li key={line} className="flex items-start gap-1.5">
          <Check
            className="size-3.5 text-primary mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}
