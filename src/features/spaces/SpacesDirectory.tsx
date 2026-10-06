/**
 * Community Spaces directory carousel (Spc1 PR2) — the marquee of the
 * Community tab. Horizontally snap-scrolling photo cards, the Runna
 * Spaces pattern: each card is a full-bleed licensed photo (editorial
 * pipeline, `space-<id>` stems) with a sport-coded tint wash + scrim
 * and the space name overlaid. Until photos land the card renders the
 * designed fallback band (accent gradient + ghosted icon — the same
 * grammar as the challenge hero).
 *
 * Races & Events (races plan PR2): a second row of race-kind spaces —
 * RACE chip, race date + city under the name (Runna's card anatomy),
 * soonest first, then evergreen races awaiting their next date,
 * filtered by a row of chips (two selects before the Social
 * pass). The Feed's compact "Spaces for you" row went in the same pass:
 * Together already leads with this directory.
 *
 * Density gate (Spc1c): member counts below
 * SPACE_MEMBER_COUNT_MIN_VISIBLE render as a "New space" chip, never a
 * shame-count. No animation loops (WKWebView).
 */
import { useState } from "react";
import EmptyState from "@/components/ui/EmptyState";
import InlineNumerals from "@/components/ui/InlineNumerals";
import RaceFilterChips from "./RaceFilterChips";
import {
  ALL_RACE_FILTERS,
  UK_RACE_FILTERS,
  raceDistanceLabel,
} from "./raceBrowse";
import { Link } from "react-router-dom";
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
import SectionHeading from "@/components/ui/SectionHeading";
import { THEME } from "@/lib/theme";
import { spaceEditorialImage } from "@/lib/editorialImages";
import { localDateString } from "@/lib/dateHelpers";
import { formatRaceEventDate } from "./raceDates";
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

/* The same accents as chip INK — theme-aware -strong steps for the
   tinted (no-photo) chips, where the raw identities measured ~3.1:1 as
   10-11px text on the light card (2026-08-22 frame sweep). Photo chips
   don't use this: a fixed white pill can't take a theme-aware ink, so
   they carry the scrim register instead. */
const ACCENT_INK: Record<SpaceDef["accent"], string> = {
  running: "hsl(var(--running-strong))",
  lifting: "hsl(var(--lifting-strong))",
  brand: "hsl(var(--primary-strong))",
};

function SpaceCard({ entry }: { entry: SpaceDirectoryEntry }) {
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
      className="relative shrink-0 snap-start rounded-2xl overflow-hidden card-shadow active:scale-[0.98] transition-transform w-[236px] h-[148px]"
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
          className={`absolute top-2.5 left-2.5 inline-flex items-center px-2 py-0.5 rounded-full text-caption font-semibold uppercase tracking-wider ${
            photo ? "bg-black/55 text-white backdrop-blur-sm" : ""
          }`}
          /* Same chip grammar as Joined. On a photo the pill is the SCRIM
             register (photo-overlay text is white-over-dark-scrim in both
             themes — THEME.scrim's rule): the previous white pill carried
             the accent as ink, which measured 3.19:1 at this size on the
             fixed white — in BOTH themes, since the pill never changed.
             On the themed fallback card the tint stays and the ink takes
             the accent's -strong step. */
          style={
            photo
              ? undefined
              : { background: `${accent}1F`, color: ACCENT_INK[def.accent] }
          }
        >
          <span>
            <InlineNumerals>{raceDistanceLabel(event)}</InlineNumerals>
          </span>
        </span>
      )}

      {joined && (
        <span
          className={`absolute top-2.5 right-2.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-caption font-semibold ${
            photo ? "bg-black/55 text-white backdrop-blur-sm" : ""
          }`}
          style={
            photo
              ? undefined
              : { background: `${accent}1F`, color: ACCENT_INK[def.accent] }
          }
        >
          <Check className="size-3" aria-hidden />
          Joined
        </span>
      )}

      <div className="absolute bottom-3 left-3.5 right-3.5 min-w-0">
        <p
          className={`text-base font-bold leading-tight ${event ? "line-clamp-2" : "truncate"} ${
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
              <span
                className={
                  event.dateKey < localDateString()
                    ? undefined
                    : "font-mono tabular-nums"
                }
              >
                {event.dateKey < localDateString()
                  ? "Next date TBA"
                  : formatRaceEventDate(event)}
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
  hideLabel = false,
  label,
  entries,
}: {
  hideLabel?: boolean;
  label: string;
  entries: SpaceDirectoryEntry[];
}) {
  return (
    <div className="space-y-2">
      {!hideLabel && <SectionHeading>{label}</SectionHeading>}
      {/* -mx-[16px]/px-[16px] (the page gutter, px) bleeds the scroller to the screen edge so the
          peeking next card invites the swipe (the Runna affordance).
          data-no-page-swipe: a horizontal swipe to scroll this carousel
          must NOT be hijacked by the page/tab swipe-navigation gesture
          (useSwipeNavigation hard-blocks from inside this scroller). */}
      {/* scroll-pl-4: with MANDATORY snap and no scroll-padding,
          scrollLeft 0 is not a valid snap position (the first card's
          snap edge sits 16px in), so the engine snapped to 16 at load
          and pulled card 1 flush to the viewport edge — cancelling the
          px-4 inset on every carousel (2026-08-22 frame sweep). */}
      <div
        data-no-page-swipe
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-[16px] px-[16px] scroll-pl-[16px] pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="list"
        aria-label={label}
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

export default function SpacesDirectory() {
  const [filters, setFilters] = useState(UK_RACE_FILTERS);
  const { entries, upcomingRaces } = useSpacesDirectory(true, filters);
  const interest = entries.filter((e) => e.def.kind !== "race");
  const races = entries.filter((e) => e.def.kind === "race");
  const showRaces = upcomingRaces.length > 0;
  if (entries.length === 0 && !showRaces) return null;

  return (
    <div className="space-y-4">
      {interest.length > 0 && <CardRow label="Spaces" entries={interest} />}
      {showRaces && (
        <section className="space-y-2" aria-label="Races & events">
          <SectionHeading>Races & events</SectionHeading>
          <RaceFilterChips value={filters} onChange={setFilters} />
          {races.length > 0 ? (
            <CardRow label="Race directory" entries={races} hideLabel />
          ) : (
            <EmptyState
              compact
              icon={Flag}
              accent={THEME.running}
              headline="No matching races"
              sub="Try another country or distance."
              action={{
                label: "Clear filters",
                variant: "secondary",
                onClick: () => setFilters(ALL_RACE_FILTERS),
              }}
            />
          )}
        </section>
      )}
    </div>
  );
}
