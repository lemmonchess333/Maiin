/**
 * The home page's photographs, fading from one to the next as the
 * welcome's do (DESIGN_GUIDE §14p, `WelcomePhotos`), without React: the
 * page is written at build time and loads no framework, so this runs on
 * the page as it arrives (`main.tsx`), and on the page React draws for an
 * invite or a Space (`HeroPhotos`).
 *
 * The page carries the first photograph and names the rest in
 * `data-src`. Once the first has drawn, the rest are fetched; the cycle
 * moves only to one that has loaded, pauses while the page is hidden, and
 * never starts under Reduce Motion, when the rest are never fetched.
 *
 * It plays once through and comes to rest on the first photograph. A
 * website has no way to pause it, and WCAG 2.2.2 asks that motion which
 * starts by itself and lasts more than five seconds can be paused or
 * stops; one pass shows every sport and every person, then holds.
 */

/** How long each photograph holds before the next fades in: the welcome's. */
export const PHOTO_HOLD_MS = 4500;

/** Starts the fade in `container`, and returns what stops it. */
export function startPhotoFade(container: HTMLElement): () => void {
  const photos = Array.from(
    container.querySelectorAll<HTMLImageElement>("img[data-photo]")
  );
  if (photos.length < 2) return () => {};
  const reduced = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  if (reduced) return () => {};

  const ready = new Set<number>();
  let shown = 0;
  let timer: number | undefined;
  let stopped = false;

  const show = (index: number) => {
    photos.forEach((photo, i) => {
      photo.dataset.shown = String(i === index);
    });
    shown = index;
  };
  const tick = () => {
    const next = (shown + 1) % photos.length;
    if (!ready.has(next)) return;
    show(next);
    if (next === 0) {
      stopped = true;
      stopTimer();
    }
  };
  const stopTimer = () => {
    if (timer !== undefined) window.clearInterval(timer);
    timer = undefined;
  };
  const startTimer = () => {
    stopTimer();
    if (stopped || document.hidden) return;
    timer = window.setInterval(tick, PHOTO_HOLD_MS);
  };
  const loadRest = () => {
    photos.forEach((photo, i) => {
      if (i === 0) return;
      const src = photo.dataset.src;
      if (!src) return;
      photo.addEventListener("load", () => ready.add(i), { once: true });
      photo.src = src;
      photo.removeAttribute("data-src");
    });
    startTimer();
  };

  ready.add(0);
  const first = photos[0];
  if (first.complete && first.naturalWidth > 0) loadRest();
  else first.addEventListener("load", loadRest, { once: true });
  document.addEventListener("visibilitychange", startTimer);

  return () => {
    stopped = true;
    stopTimer();
    first.removeEventListener("load", loadRest);
    document.removeEventListener("visibilitychange", startTimer);
  };
}
