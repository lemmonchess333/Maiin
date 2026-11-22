/**
 * The page a shared link opens on troposfit.com, a post's or a card's
 * (owner's layout, 22 Nov 2026, from three mockups): the small lockup at
 * the top left, one small line naming the sharer and what they shared,
 * the card as the hero, and at the foot one filled button, "Join Tropos",
 * with one line under it about Tropos. Signed-out screens sit on the
 * plain page in one phone-wide column (DESIGN_GUIDE §14p).
 */
import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import AboutTropos from "@/components/auth/AboutTropos";
import AuthLockup from "@/components/auth/AuthLockup";
import ShareCardRenderer, {
  type ShareCardRenderData,
} from "@/components/share/ShareCardRenderer";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { JOIN_TROPOS } from "@/lib/joinTropos";

const TITLE =
  "text-h2 font-extrabold leading-[1.12] tracking-tight text-foreground text-balance";

export function SharedLanding({
  line,
  title,
  children,
  href,
}: {
  /** The small line naming the sharer, when the page shows what they
   *  shared: their name bold. */
  line?: { name: string | null; rest: string };
  /** The state's own words, when the page shows nothing shared. */
  title?: ReactNode;
  children?: ReactNode;
  href: string;
}) {
  return (
    <div className="ds-auth-shell">
      <main className="ds-auth-page">
        <AuthLockup small />
        {line ? (
          <h1 className="mt-7 text-base font-medium leading-6 text-muted-foreground">
            {line.name && (
              <b className="font-bold text-foreground">{line.name}</b>
            )}
            {line.rest}
          </h1>
        ) : title ? (
          <h1 className={`mt-7 ${TITLE}`}>{title}</h1>
        ) : null}
        <div className="mt-3 space-y-3">{children}</div>
        <div className="mt-auto pt-6">
          <a
            href={href}
            className={buttonClasses({ fullWidth: true, size: "md" })}
          >
            {JOIN_TROPOS}
          </a>
          <AboutTropos line />
        </div>
      </main>
    </div>
  );
}

/** A card's drawn size (ShareCardRenderer). */
const CARD_PX = 1080;

/**
 * The share card, drawn at 1080 px as it is rasterised and scaled to its
 * frame, which `.ds-shared-card` holds to 60% of the screen's height. To a
 * screen reader it is one picture, named by its figures in a sentence.
 */
export function SharedCardFrame({
  data,
  label,
}: {
  data: ShareCardRenderData;
  label: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  const height = data.format === "story" ? 1920 : CARD_PX;
  return (
    <div
      ref={frame}
      role="img"
      aria-label={label}
      className="ds-shared-card relative overflow-hidden rounded-2xl card-shadow"
      style={
        {
          "--card-ratio": CARD_PX / height,
          aspectRatio: `${CARD_PX} / ${height}`,
        } as CSSProperties
      }
    >
      <div
        aria-hidden="true"
        style={{
          width: CARD_PX,
          height,
          transform: `scale(${width / CARD_PX})`,
          transformOrigin: "top left",
        }}
      >
        <ShareCardRenderer data={data} offscreen={false} />
      </div>
    </div>
  );
}
