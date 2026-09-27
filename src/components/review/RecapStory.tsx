import { useCallback, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import IconButton from "@/components/ui/IconButton";
import { cn } from "@/lib/utils";

export interface RecapSlide {
  key: string;
  /** What a screen reader hears for the slide: "Your week". */
  label: string;
  /** The slide's content, handed the way to the next one. */
  render: (next: () => void) => ReactNode;
}

/**
 * The weekly recap's frame (DS3): one card at a time, full screen, with
 * the progress bars and a close button above it, like a story.
 *
 * The cards are a horizontal scroll-snap track, so a swipe is the
 * phone's own gesture (momentum and all, in WKWebView too) and a card
 * taller than the screen still scrolls vertically inside itself. Each
 * card ends in a button to the next, so nothing needs a swipe to reach.
 *
 * That button passes no scroll behaviour of its own. The track glides
 * by CSS, and only where motion is allowed: an explicit behaviour would
 * beat Reduce Motion's reset (animations.css) by spec, which is the
 * rule reducedMotionScroll.spec.ts holds every source to.
 */
export default function RecapStory({
  eyebrow,
  slides,
  onClose,
}: {
  /** The reviewed week's dates, above the cards. */
  eyebrow: string;
  slides: readonly RecapSlide[];
  onClose: () => void;
}) {
  /* The track, held as state through a callback ref rather than read
     from a ref object: every card's button is built during render, and
     a closure that reads `ref.current` there is a ref read the render
     cannot rule out. */
  const [track, setTrack] = useState<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);

  const goTo = useCallback(
    (target: number) => {
      if (!track) return;
      const i = Math.max(0, Math.min(slides.length - 1, target));
      // Optional only because jsdom has no element scrolling.
      track.scrollTo?.({ left: i * track.clientWidth });
    },
    [track, slides.length]
  );

  return (
    <div
      className="fixed inset-0 flex flex-col bg-background"
      style={{
        paddingTop: "var(--safe-top)",
        paddingBottom: "var(--safe-bottom)",
      }}
    >
      <h1 className="sr-only">Weekly Review</h1>
      <div className="space-y-2 px-4 pt-3">
        {slides.length > 1 && (
          <div className="flex gap-1" aria-hidden="true">
            {slides.map((slide, i) => (
              <span
                key={slide.key}
                data-seen={i <= index ? "" : undefined}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  i <= index ? "bg-foreground" : "bg-muted"
                )}
              />
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground font-mono tabular-nums">
            {eyebrow}
          </p>
          <IconButton
            aria-label="Close"
            variant="secondary"
            icon={<X />}
            onClick={onClose}
          />
        </div>
      </div>
      <div
        ref={setTrack}
        role="region"
        aria-roledescription="carousel"
        aria-label="Weekly recap"
        onScroll={(event) => {
          const el = event.currentTarget;
          if (el.clientWidth > 0) {
            setIndex(Math.round(el.scrollLeft / el.clientWidth));
          }
        }}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain motion-safe:scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((slide, i) => (
          <section
            key={slide.key}
            role="group"
            aria-roledescription="slide"
            aria-label={`${slide.label}, ${i + 1} of ${slides.length}`}
            className="flex w-full shrink-0 snap-start snap-always flex-col overflow-y-auto px-4 pb-4 pt-4"
          >
            {slide.render(() => goTo(i + 1))}
          </section>
        ))}
      </div>
    </div>
  );
}
