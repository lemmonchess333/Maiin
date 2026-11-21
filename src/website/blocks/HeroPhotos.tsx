import WelcomePhotos from "@/components/auth/WelcomePhotos";
import { WELCOME_PHOTOS } from "@/lib/welcomePhotos";

/** A 1 x 1 clear GIF: what a phone fetches for the wide screen's strip,
 *  which it never shows. */
const NOTHING =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/**
 * The welcome's photographs behind a `.home-hero` (DESIGN_GUIDE §14p): on
 * a phone the welcome's own layer, one photograph at a time fading to the
 * next; from 768px a still strip of them side by side, which only a wide
 * screen fetches (each is a <picture> whose fallback is a clear pixel).
 * Decorative: the words beside them say what Tropos is.
 */
export default function HeroPhotos() {
  return (
    <>
      <WelcomePhotos />
      <div className="home-hero-strip" aria-hidden="true">
        {WELCOME_PHOTOS.map((photo) => (
          <picture key={photo.src}>
            <source media="(min-width: 768px)" srcSet={photo.src} />
            <img
              src={NOTHING}
              alt=""
              decoding="async"
              style={{ objectPosition: photo.focus }}
            />
          </picture>
        ))}
      </div>
    </>
  );
}
