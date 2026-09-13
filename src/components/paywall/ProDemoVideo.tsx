import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  PRO_DEMO_ASPECT,
  PRO_DEMO_SOURCES,
  publicUrl,
  type ProDemoSource,
} from "./proDemoVideo";

/**
 * ProDemoVideo — the app, recorded, in a device frame.
 *
 * A paywall sells the feature working, and nothing shows the feature
 * working like the feature working: a short silent loop of the real
 * Food surface reading a real plate. The drawn frames are the poster —
 * they stay in flow until the first frame of video has decoded — and
 * they are the whole surface whenever the recording is not the right
 * thing to play:
 *
 *   - no recording listed (the manifest is empty until one is cut),
 *   - reduced motion (a looping video is motion the user asked not to see),
 *   - data saver (a 2 MB autoplay on a metered connection is rude),
 *   - every source failed to load or decode.
 *
 * Once the video is playing, the fallback UNMOUNTS rather than hiding:
 * the scan frame carries its own ambient loop, and the recipe allows one
 * loop per surface. The video is that loop.
 *
 * Muted, inline, autoplay: the three attributes mobile Safari needs
 * before it will start a video without a tap. `muted` is also set as a
 * property because React does not reflect it into the markup and Safari
 * checks the element when deciding whether to autoplay.
 *
 * Failure is read off the LAST `<source>`: with source children a
 * browser reports each miss on the source element, not the video, and
 * only the last miss means nothing played.
 */
interface Props {
  /** What plays. Defaults to the manifest; tests pass their own. */
  sources?: readonly ProDemoSource[];
  /** The drawn frames — poster while loading, the surface otherwise. */
  fallback: ReactNode;
  /** Spoken for the video: what the recording shows. */
  label: string;
  className?: string;
}

function dataSaverOn(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
  return nav.connection?.saveData === true;
}

export default function ProDemoVideo({
  sources = PRO_DEMO_SOURCES,
  fallback,
  label,
  className,
}: Props) {
  const reducedMotion = useReducedMotion();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const key = sources.map((s) => s.path).join("|");

  // A new set of sources is a new attempt: forget the last one's fate.
  useEffect(() => {
    setReady(false);
    setFailed(false);
  }, [key]);

  const plays =
    sources.length > 0 && !reducedMotion && !failed && !dataSaverOn();

  if (!plays) return <div className={className}>{fallback}</div>;

  const last = sources.length - 1;
  return (
    <div
      className={cn("relative", className)}
      data-demo-state={ready ? "playing" : "loading"}
    >
      {!ready && fallback}
      <div
        className={cn(
          "mx-auto w-full max-w-[320px] rounded-3xl border border-border bg-card overflow-hidden card-shadow",
          // Off-flow until it plays: the poster holds the slot, and the
          // element stays rendered (not display:none) so the browser
          // treats it as a visible autoplay candidate.
          ready
            ? "relative"
            : "absolute inset-x-0 top-0 opacity-0 pointer-events-none"
        )}
        style={{ aspectRatio: PRO_DEMO_ASPECT }}
        aria-hidden={ready ? undefined : true}
      >
        <video
          className="absolute inset-0 size-full object-cover object-top"
          aria-label={label}
          muted
          autoPlay
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          ref={(el) => {
            if (el) {
              el.muted = true;
              el.defaultMuted = true;
            }
          }}
          onLoadedData={() => setReady(true)}
        >
          {sources.map((s, i) => (
            <source
              key={s.path}
              src={publicUrl(s.path)}
              type={s.type}
              onError={i === last ? () => setFailed(true) : undefined}
            />
          ))}
        </video>
      </div>
    </div>
  );
}
