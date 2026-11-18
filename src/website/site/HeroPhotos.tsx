import { useEffect, useRef } from "react";
import { WELCOME_PHOTOS } from "@/lib/welcomePhotos";
import { startPhotoFade } from "@/website/site/photoFade";

/**
 * The welcome's five photographs (src/assets/welcome, DESIGN_GUIDE §14p)
 * behind the home page's opening. Decorative: the words say what Tropos
 * is, so the layer is hidden from assistive technology.
 *
 * Only the first is fetched with the page; the rest are named in
 * `data-src` and fetched by `startPhotoFade` once it has drawn. On the
 * page the build writes, `main.tsx` starts the fade; on a page React draws
 * (an invite, a Space), this does.
 */
export default function HeroPhotos() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    return startPhotoFade(ref.current);
  }, []);
  return (
    <div ref={ref} className="site-hero-photos" aria-hidden="true">
      {WELCOME_PHOTOS.map((photo, index) => (
        <img
          key={photo.src}
          data-photo=""
          src={index === 0 ? photo.src : undefined}
          data-src={index === 0 ? undefined : photo.src}
          data-shown={index === 0 ? "true" : "false"}
          alt=""
          width={1080}
          height={2340}
          decoding="async"
          fetchPriority={index === 0 ? "high" : "low"}
          draggable={false}
          className="site-hero-photo"
          style={{ objectPosition: photo.focus }}
        />
      ))}
    </div>
  );
}
