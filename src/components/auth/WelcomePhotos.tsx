import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { WELCOME_PHOTOS, WELCOME_PHOTO_HOLD_MS } from "@/lib/welcomePhotos";

/**
 * The photographs behind the welcome screen, fading from one to the next.
 *
 * Decorative: the screen's words say what Tropos is, so the layer is
 * hidden from assistive technology and every image has empty alt text.
 *
 * Only the first photograph is fetched with the screen. The other four
 * mount once it has drawn, so they never compete with it on a slow
 * connection, and the cycle only moves to a photograph that has loaded.
 * It pauses while the page is hidden. Under Reduce Motion the first
 * photograph stays, and the others are never fetched.
 */
export default function WelcomePhotos() {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(0);
  const [ready, setReady] = useState<ReadonlySet<number>>(() => new Set());
  const readyRef = useRef(ready);
  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  const markReady = useCallback((index: number) => {
    setReady((prev) => {
      if (prev.has(index)) return prev;
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  }, []);

  const firstReady = ready.has(0);
  const cycles = firstReady && !reduced;

  useEffect(() => {
    if (!cycles) return;
    let timer: number | undefined;
    const stop = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    };
    const start = () => {
      stop();
      if (document.hidden) return;
      timer = window.setInterval(() => {
        setShown((current) => {
          const next = (current + 1) % WELCOME_PHOTOS.length;
          return readyRef.current.has(next) ? next : current;
        });
      }, WELCOME_PHOTO_HOLD_MS);
    };
    start();
    document.addEventListener("visibilitychange", start);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", start);
    };
  }, [cycles]);

  return (
    <div className="welcome-photos" aria-hidden="true">
      {WELCOME_PHOTOS.map((photo, index) =>
        index === 0 || cycles ? (
          <img
            key={photo.src}
            src={photo.src}
            alt=""
            decoding="async"
            fetchPriority={index === 0 ? "high" : "low"}
            draggable={false}
            className="welcome-photo"
            style={{ objectPosition: photo.focus }}
            data-shown={index === shown}
            data-ready={ready.has(index)}
            ref={(img) => {
              // A photograph already in the cache can finish before React
              // attaches onLoad; it counts as loaded all the same.
              if (img?.complete && img.naturalWidth > 0) markReady(index);
            }}
            onLoad={() => markReady(index)}
          />
        ) : null
      )}
    </div>
  );
}
