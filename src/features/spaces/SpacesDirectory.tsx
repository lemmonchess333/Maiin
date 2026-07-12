/**
 * Community Spaces directory carousel (Spc1 PR2) — the marquee of the
 * Community tab. Horizontally snap-scrolling photo cards, the Runna
 * Spaces pattern: each card is a full-bleed licensed photo (editorial
 * pipeline, `space-<id>` stems) with a sport-coded tint wash + scrim
 * and the space name overlaid. Until photos land the card renders the
 * designed fallback band (accent gradient + ghosted icon — the same
 * grammar as the challenge hero).
 *
 * Density gate (Spc1c): member counts below
 * SPACE_MEMBER_COUNT_MIN_VISIBLE render as a "New space" chip, never a
 * shame-count. Static everything — no filters, no loops (WKWebView).
 */
import { Link } from "react-router-dom";
import {
  Check,
  Dumbbell,
  Footprints,
  Heart,
  Medal,
  Plane,
  Sprout,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import SectionLabel from "@/components/ui/SectionLabel";
import { THEME } from "@/lib/theme";
import { spaceEditorialImage } from "@/lib/editorialImages";
import { SPACE_MEMBER_COUNT_MIN_VISIBLE, type SpaceDef } from "./spaceDefs";
import {
  useSpacesDirectory,
  type SpaceDirectoryEntry,
} from "./useSpacesDirectory";

const ICON_MAP: Record<string, LucideIcon> = {
  sprout: Sprout,
  zap: Zap,
  heart: Heart,
  footprints: Footprints,
  dumbbell: Dumbbell,
  medal: Medal,
  plane: Plane,
};

const ACCENT_HEX: Record<SpaceDef["accent"], string> = {
  running: THEME.running,
  lifting: THEME.lifting,
  brand: THEME.brand,
};

function SpaceCard({ entry }: { entry: SpaceDirectoryEntry }) {
  const { def, memberCount, joined } = entry;
  const photo = spaceEditorialImage(def.id);
  const accent = ACCENT_HEX[def.accent];
  const Icon = ICON_MAP[def.icon] ?? Users;
  const showCount =
    memberCount !== null && memberCount >= SPACE_MEMBER_COUNT_MIN_VISIBLE;

  return (
    <Link
      to={`/space/${def.id}`}
      className="relative w-[236px] h-[148px] shrink-0 snap-start rounded-2xl overflow-hidden card-shadow active:scale-[0.98] transition-transform"
      style={
        photo
          ? undefined
          : {
              background: `linear-gradient(150deg, ${accent}26 0%, ${accent}0C 55%, ${accent}14 100%)`,
            }
      }
      aria-label={`${def.name} space`}
    >
      {photo ? (
        <>
          <img
            src={photo}
            alt=""
            aria-hidden
            className="absolute inset-0 size-full object-cover"
          />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(150deg, ${accent}59 0%, ${accent}1F 60%, transparent 100%)`,
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(to top, ${THEME.scrim} 0%, ${THEME.scrimSoft} 45%, transparent 70%)`,
            }}
          />
        </>
      ) : (
        <Icon
          size={96}
          className="absolute -right-3 -bottom-4"
          style={{ color: accent, opacity: 0.16, transform: "rotate(-10deg)" }}
          aria-hidden
        />
      )}

      {joined && (
        <span
          className={`absolute top-2.5 right-2.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-caption font-semibold ${
            photo ? "bg-white/90" : ""
          }`}
          /* On a photo the chip is a white pill with the accent as ink —
             theme-independent (the photo, not the theme, is the surface). */
          style={
            photo
              ? { color: accent }
              : { background: `${accent}1F`, color: accent }
          }
        >
          <Check className="size-3" aria-hidden />
          Joined
        </span>
      )}

      <div className="absolute bottom-3 left-3.5 right-3.5 min-w-0">
        <p
          className={`text-base font-bold leading-tight truncate ${
            photo ? "text-white" : "text-foreground"
          }`}
        >
          {def.name}
        </p>
        <p
          className={`text-caption font-medium mt-0.5 flex items-center gap-1 ${
            photo ? "text-white/85" : "text-muted-foreground"
          }`}
        >
          <Users className="size-3" aria-hidden />
          {showCount ? `${memberCount.toLocaleString()} members` : "New space"}
        </p>
      </div>
    </Link>
  );
}

export default function SpacesDirectory() {
  const { entries } = useSpacesDirectory();

  return (
    <div className="space-y-2">
      <SectionLabel>Spaces</SectionLabel>
      {/* -mx-4/px-4 bleeds the scroller to the screen edge so the
          peeking next card invites the swipe (the Runna affordance). */}
      <div
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="list"
        aria-label="Community spaces"
      >
        {entries.map((entry) => (
          <div role="listitem" key={entry.def.id} className="contents">
            <SpaceCard entry={entry} />
          </div>
        ))}
      </div>
    </div>
  );
}
