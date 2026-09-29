import { Lock } from "lucide-react";
import Spinner from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";

/**
 * One progress photo at 3:4 with its pose along the bottom. Before the
 * image is decrypted it shows a spinner while that runs, and a lock
 * when it has not started or could not finish.
 */
export default function ProgressPhotoThumb({
  url,
  decrypting,
  label,
  className,
}: {
  url: string | undefined;
  decrypting: boolean;
  /** The pose, drawn on the photo and read as its name. */
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative aspect-[3/4] overflow-hidden rounded-lg bg-muted",
        className
      )}
    >
      {url ? (
        <img
          src={url}
          alt={`${label} view`}
          className="size-full object-cover"
          decoding="async"
        />
      ) : (
        <div className="flex size-full items-center justify-center">
          {decrypting ? (
            <Spinner size="sm" variant="muted" label={`Opening ${label}`} />
          ) : (
            <Lock aria-hidden className="size-4 text-muted-foreground" />
          )}
        </div>
      )}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 bg-black/45 py-0.5 text-center text-caption font-semibold text-white"
      >
        {label}
      </span>
    </div>
  );
}
