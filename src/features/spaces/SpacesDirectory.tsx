/**
 * Community Spaces directory carousel (Spc1 PR2) — the marquee of the
 * Community tab. Horizontally snap-scrolling photo cards, the Runna
 * Spaces pattern: each card is a full-bleed licensed photo (editorial
 * pipeline, `space-<id>` stems) with a sport-coded tint wash + scrim
 * and the space name overlaid. Until photos land the card renders the
 * designed fallback band (accent gradient + ghosted icon — the same
 * grammar as the challenge hero).
 *
 * Races & Events (races plan PR2): the FULL directory adds a second
 * row of race-kind spaces — RACE chip, race date + city under the
 * name (Runna's card anatomy), soonest first, past dates hidden
 * (Q2: derived from dateKey, never operated). The compact Feed row
 * stays interest-only (Q6 — the calm-feed doctrine).
 *
 * Density gate (Spc1c): member counts below
 * SPACE_MEMBER_COUNT_MIN_VISIBLE render as a "New space" chip, never a
 * shame-count. Static everything — no filters, no loops (WKWebView).
 */
import { Link } from "react-router-dom";
import { format } from "date-fns";
import {
  Check,
  Dumbbell,
  Flag,
  Footprints,
  Heart,
  Medal,
  Mountain,
  Plane,
  Sprout,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import SectionLabel from "@/components/ui/SectionLabel";
import { THEME } from "@/lib/theme";
import { spaceEditorialImage } from "@/lib/editorialImages";
import { parseLocalDate } from "@/lib/dateHelpers";
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
  mountain: Mountain,
  dumbbell: Dumbbell,
  medal: Medal,
  plane: Plane,
  flag: Flag,
};

const ACCENT_HEX: Record<SpaceDef["accent"], string> = {
  running: THEME.running,
  lifting: THEME.lifting,
  brand: THEME.brand,
};

function SpaceCard({
  entry,
  compact = false,
}: {
  entry: SpaceDirectoryEntry;
  compact?: boolean;
}) {
  const { def, memberCount, joined } = entry;
  const photo = spaceEditorialImage(def.id);
  const accent = ACCENT_HEX[def.accent];
  const Icon = ICON_MAP[def.icon] ?? Users;
  const showCount =
    memberCount !== null && memberCount >= SPACE_MEMBER_COUNT_MIN_VISIBLE;
  const event = def.kind === "race" ? def.event : undefined;

  return (
    <Link
      to={`/space/${def.id}`}
      className={`relative shrink-0 snap-start rounded-2xl overflow-hidden card-shadow active:scale-[0.98] transition-transform ${
        compact ? "w-[176px] h-[112px]" : "w-[236px] h-[148px]"
      }`}
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

      {event && (
        <span
          className={`absolute top-2.5 left-2.5 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
            photo ? "bg-white/90" : ""
          }`}
          /* Same chip grammar as Joined: on a photo, a white pill with
             the accent as ink — the photo, not the theme, is the
             surface. */
          style={
            photo
              ? { color: accent }
              : { background: `${accent}1F`, color: accent }
          }
        >
          Race
        </span>
      )}

      {joined && (
        <span
          className={`absolute top-2.5 right-2.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-caption font-semibold ${
            photo ? "bg-white/90" : ""
          }`}
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
          className={`${compact ? "text-sm" : "text-base"} font-bold leading-tight truncate ${
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
          {event ? (
            /* Runna's race-card anatomy: race day + city, not a member
               count (membership lives on the space page header). */
            <span className="truncate">
              <span className="font-mono tabular-nums">
                {format(parseLocalDate(event.dateKey), "d MMM yyyy")}
              </span>
              {" · "}
              {event.city} {event.countryFlag}
            </span>
          ) : (
            <>
              <Users className="size-3" aria-hidden />
              {showCount
                ? `${memberCount.toLocaleString()} members`
                : "New space"}
            </>
          )}
        </p>
      </div>
    </Link>
  );
}

function CardRow({
  label,
  entries,
  compact,
}: {
  label: string;
  entries: SpaceDirectoryEntry[];
  compact: boolean;
}) {
  return (
    <div className="space-y-2">
      <SectionLabel>{label}</SectionLabel>
      {/* -mx-4/px-4 bleeds the scroller to the screen edge so the
          peeking next card invites the swipe (the Runna affordance).
          data-no-page-swipe: a horizontal swipe to scroll this carousel
          must NOT be hijacked by the page/tab swipe-navigation gesture
          (useSwipeNavigation hard-blocks from inside this scroller). */}
      <div
        data-no-page-swipe
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="list"
        aria-label={label}
      >
        {entries.map((entry) => (
          <div role="listitem" key={entry.def.id} className="contents">
            <SpaceCard entry={entry} compact={compact} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SpacesDirectory({
  compact = false,
  excludeJoined = false,
  title = "Spaces",
}: {
  /** Feed-row variant (Spc1g): smaller cards, same grammar. */
  compact?: boolean;
  /** Suggested mode — hide spaces the user already joined; the whole
   *  row collapses when nothing is left to suggest. */
  excludeJoined?: boolean;
  title?: string;
}) {
  /* Q6 lock: race rows exist ONLY in the full directory — the compact
     Feed row never requests them (and never pays their reads). */
  const { entries } = useSpacesDirectory(!compact);
  const shown = excludeJoined ? entries.filter((e) => !e.joined) : entries;
  const interest = shown.filter((e) => e.def.kind !== "race");
  const races = shown.filter((e) => e.def.kind === "race");
  if (shown.length === 0) return null;

  return (
    <div className="space-y-4">
      {interest.length > 0 && (
        <CardRow label={title} entries={interest} compact={compact} />
      )}
      {races.length > 0 && (
        <CardRow label="Races & Events" entries={races} compact={compact} />
      )}
    </div>
  );
}
