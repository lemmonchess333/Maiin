/**
 * The races and Spaces directory at the head of Together's Discover
 * section (Spc1 PR2; first since Soc16, as the page's pictures). Horizontally snap-scrolling photo cards, the Runna
 * Spaces pattern: each card is a full-bleed editorial photo
 * (`space-<id>` stems) under the one dark shade every photo card uses,
 * with the space name over it. Until photos land the card renders the
 * designed fallback band (accent gradient + ghosted icon, the same
 * grammar as the challenge hero). Interest Spaces are the smaller cards.
 *
 * Races & Events (races plan PR2): the first row, of race-kind spaces,
 * with the race's distance chip and date + city under the name (Runna's
 * card anatomy), soonest first, then evergreen races awaiting their next
 * date, filtered by a row of chips.
 *
 * The line under a Space's name is its member count, and only a real one
 * (Spc1c): from SPACE_MEMBER_COUNT_MIN_VISIBLE it says how many, and under
 * it the Space says it is filling up (App1 Q6, `src/lib/fillingUp.ts`),
 * since every Space is offered from a person's first day however few
 * people are on Tropos. While the count is unknown it says neither. How
 * many posts a Space had this week is not read here (the directory reads
 * a member count and membership only), so no card says it. No animation
 * loops (WKWebView).
 *
 * Search (Run27 call 11): a field over the directory finds Spaces by name,
 * or a race by its city, among every Space and every race whatever the
 * chips say (`spaceSearch.ts`, on the device: Spaces are the app's own
 * config). While it holds a query, the results stand in for the rows.
 */
import { useMemo, useState } from "react";
import EmptyState from "@/components/ui/EmptyState";
import InlineNumerals from "@/components/ui/InlineNumerals";
import PhotoCaption from "@/components/ui/PhotoCaption";
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
  Search,
  Sprout,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import SectionHeading from "@/components/ui/SectionHeading";
import { IconButton } from "@/components/ui/IconButton";
import {
  SPACE_SEARCH_MIN_LENGTH,
  searchKey,
  searchSpaces,
} from "./spaceSearch";
import { THEME } from "@/lib/theme";
import { spaceEditorialImage } from "@/lib/editorialImages";
import { localDateString } from "@/lib/dateHelpers";
import { formatRaceEventDate } from "./raceDates";
import { FILLING_UP, roomPeople } from "@/lib/fillingUp";
import { SPACE_ACCENT_HEX } from "./spaceAccent";
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

/* The same accents as chip INK — theme-aware -strong steps for the
   tinted (no-photo) chips, where the raw identities measured ~3.1:1 as
   10-11px text on the light card (2026-08-22 frame sweep). Photo chips
   don't use this: a fixed white pill can't take a theme-aware ink, so
   they carry the scrim register instead. */
const ACCENT_INK: Record<SpaceDef["accent"], string> = {
  running: "hsl(var(--running-strong))",
  lifting: "hsl(var(--lifting-strong))",
  brand: "hsl(var(--lifting-strong))",
};

/* An interest Space is a smaller card than a race: its name and one line
   are all it carries, and the row shows more of them at once. */
const CARD_SIZE = {
  small: { box: "w-[160px] h-[136px]", name: "text-sm" },
  regular: { box: "w-[236px] h-[148px]", name: "text-base" },
} as const;

function SpaceCard({
  entry,
  size,
}: {
  entry: SpaceDirectoryEntry;
  size: keyof typeof CARD_SIZE;
}) {
  const { def, memberCount, joined } = entry;
  const photo = spaceEditorialImage(def.id);
  const accent = SPACE_ACCENT_HEX[def.accent];
  const Icon = ICON_MAP[def.icon] ?? Users;
  const people = roomPeople(memberCount, SPACE_MEMBER_COUNT_MIN_VISIBLE);
  const event = def.kind === "race" ? def.event : undefined;

  return (
    <Link
      to={`/space/${def.id}`}
      className={`relative shrink-0 snap-start rounded-2xl overflow-hidden card-shadow active:scale-[0.98] transition-transform ${CARD_SIZE[size].box}`}
      style={
        photo
          ? undefined
          : {
              background: `linear-gradient(150deg, ${accent}26 0%, ${accent}0C 55%, ${accent}14 100%)`,
            }
      }
    >
      {/* Every photo card on the one dark shade (PhotoCaption's scrim),
          with no tint of its own, so the white words read alike on each. */}
      {photo ? (
        <img
          src={photo}
          alt=""
          aria-hidden
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <Icon
          size={96}
          className="absolute -right-3 -bottom-4"
          style={{ color: accent, opacity: 0.16, transform: "rotate(-10deg)" }}
          aria-hidden
        />
      )}

      {/* The card is named by its words, so the caption comes first in
          the page's order and the Space's name leads its name, "space"
          unseen after it, then the tags drawn over the picture: Voice Control is spoken to with the
          words on the screen (WCAG 2.5.3, Label in Name). The tags are
          placed absolutely, so the order moves nothing on the card.
          The name takes two lines before it gives way, on every card, so
          a long name wraps at a word rather than being cut on its first
          line. The tags below sit over the caption's scrim (z-10), which
          reaches them at larger text. */}
      <PhotoCaption onPhoto={!!photo} className="px-3.5">
        <p
          className={`${CARD_SIZE[size].name} font-bold leading-tight line-clamp-2 break-words ${
            photo ? "text-white" : "text-foreground"
          }`}
        >
          {def.name} <span className="sr-only">space</span>
        </p>
        {(event || people) && (
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
                {people === "fillingUp" ? (
                  <span>{FILLING_UP}</span>
                ) : (
                  <span>
                    <span className="font-mono tabular-nums">
                      {people?.count.toLocaleString()}
                    </span>{" "}
                    members
                  </span>
                )}
              </>
            )}
          </p>
        )}
      </PhotoCaption>
      {event && (
        <span
          className={`absolute z-10 top-2.5 left-2.5 inline-flex items-center px-2 py-0.5 rounded-full text-caption font-semibold ${
            photo
              ? "bg-black/55 text-white backdrop-blur-sm transparency-reduce:backdrop-blur-none transparency-reduce:bg-black!"
              : ""
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
          className={`absolute z-10 top-2.5 right-2.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-caption font-semibold ${
            photo
              ? "bg-black/55 text-white backdrop-blur-sm transparency-reduce:backdrop-blur-none transparency-reduce:bg-black!"
              : ""
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
    </Link>
  );
}

function CardRow({
  hideLabel = false,
  label,
  entries,
  size,
}: {
  hideLabel?: boolean;
  label: string;
  entries: SpaceDirectoryEntry[];
  size: keyof typeof CARD_SIZE;
}) {
  return (
    <div className="space-y-2">
      {!hideLabel && (
        <SectionHeading as="h3" size="compact">
          {label}
        </SectionHeading>
      )}
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
            <SpaceCard entry={entry} size={size} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** One Space found by a search: its picture, its name, and its race day
 *  and city or its tagline. */
function SpaceSearchRow({ def }: { def: SpaceDef }) {
  const photo = spaceEditorialImage(def.id);
  const accent = SPACE_ACCENT_HEX[def.accent];
  const Icon = ICON_MAP[def.icon] ?? Users;
  const event = def.kind === "race" ? def.event : undefined;
  const past = event ? event.dateKey < localDateString() : false;
  return (
    <Link
      to={`/space/${def.id}`}
      className="flex items-center gap-3 min-h-14 rounded-xl bg-card card-shadow p-2.5 pr-3.5 active:scale-[0.98] transition-transform"
    >
      <span
        className="relative size-11 shrink-0 overflow-hidden rounded-lg"
        style={photo ? undefined : { background: `${accent}26` }}
        aria-hidden
      >
        {photo ? (
          <img src={photo} alt="" className="size-full object-cover" />
        ) : (
          <Icon
            className="absolute inset-0 m-auto size-5"
            style={{ color: accent }}
          />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-tight text-foreground line-clamp-2 break-words">
          {def.name}
        </span>
        <span className="mt-0.5 block text-caption text-muted-foreground truncate">
          {event ? (
            <>
              <span className={past ? undefined : "font-mono tabular-nums"}>
                {past ? "Next date TBA" : formatRaceEventDate(event)}
              </span>
              {" · "}
              {event.city} {event.countryFlag}
            </>
          ) : (
            def.tagline
          )}
        </span>
      </span>
    </Link>
  );
}

/** The directory's search field: a query, and a way to clear it. */
function SpaceSearchField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="relative" role="search">
      <Search
        className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
        aria-hidden="true"
      />
      <input
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="Search spaces"
        aria-label="Search spaces"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="ds-input pl-10 pr-11 text-base text-foreground placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
      />
      {value.length > 0 && (
        <IconButton
          onClick={() => onChange("")}
          aria-label="Clear search"
          icon={<X />}
          className="absolute right-0.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        />
      )}
    </div>
  );
}

export default function SpacesDirectory() {
  const [filters, setFilters] = useState(UK_RACE_FILTERS);
  const { entries, upcomingRaces } = useSpacesDirectory(true, filters);
  const [query, setQuery] = useState("");
  /* Every Space a search can find: every interest Space and every race,
     whatever the chips say, in the directory's own order. */
  const searchable = useMemo(
    () => [
      ...entries.filter((e) => e.def.kind !== "race").map((e) => e.def),
      ...upcomingRaces,
    ],
    [entries, upcomingRaces]
  );

  const interest = entries.filter((e) => e.def.kind !== "race");
  const races = entries.filter((e) => e.def.kind === "race");
  const showRaces = upcomingRaces.length > 0;
  if (entries.length === 0 && !showRaces) return null;
  const searching = searchKey(query).length >= SPACE_SEARCH_MIN_LENGTH;
  const results = searching ? searchSpaces(searchable, query) : [];

  return (
    <div className="space-y-4">
      <SpaceSearchField value={query} onChange={setQuery} />
      {/* Always in the page, so a screen reader hears each new count. */}
      <p className="sr-only" aria-live="polite">
        {searching
          ? results.length === 1
            ? "1 space found"
            : `${results.length} spaces found`
          : ""}
      </p>
      {searching ? (
        results.length > 0 ? (
          <div className="space-y-2" role="list" aria-label="Spaces found">
            {results.map((def) => (
              <div role="listitem" key={def.id}>
                <SpaceSearchRow def={def} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            compact
            icon={Search}
            headline="No matching spaces"
            sub="Try a race’s name or its city."
            action={{
              label: "Clear search",
              variant: "secondary",
              onClick: () => setQuery(""),
            }}
          />
        )
      ) : null}
      {!searching && showRaces && (
        <section className="space-y-2" aria-label="Races & events">
          <SectionHeading as="h3" size="compact">
            Races & events
          </SectionHeading>
          <RaceFilterChips value={filters} onChange={setFilters} />
          {races.length > 0 ? (
            <CardRow
              label="Race directory"
              entries={races}
              size="regular"
              hideLabel
            />
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
      {!searching && interest.length > 0 && (
        <CardRow label="Spaces" entries={interest} size="small" />
      )}
    </div>
  );
}
