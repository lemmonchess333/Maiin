import type { AppScreenImage } from "@/website/site/screens";
import { cn } from "@/lib/utils";

/**
 * One of the app's screens, captured on the emulator rig from the demo
 * accounts (src/website/screens/README.md): the screen alone, with its
 * corners rounded and no drawn phone around it. The words beside it say
 * what it shows; `alt` says it again for a screen reader.
 */
export default function AppScreen({
  screen,
  eager = false,
  className,
}: {
  screen: AppScreenImage;
  /** The page's first picture: fetched at once rather than on approach. */
  eager?: boolean;
  className?: string;
}) {
  return (
    <img
      src={screen.src}
      alt={screen.alt}
      width={screen.width}
      height={screen.height}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={eager ? "high" : undefined}
      draggable={false}
      className={cn("site-screen", className)}
    />
  );
}
