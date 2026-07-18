import { useSuggestedCrews } from "@/hooks/useSuggestedCrews";
import { useEffect, useState, Suspense } from "react";
import type { MutableRefObject } from "react";
import { Link } from "react-router-dom";
import CirclesSection from "@/components/social/CirclesSection";
import SpacesDirectory from "@/features/spaces/SpacesDirectory";
/* Soc5 item 10: ChallengeList lazy-loaded so the Social entry chunk
   stays lean. ChallengeList only loads when the user opens the Crews
   tab. lazyRetry gives the same stale-chunk recovery the page-level
   lazy loads use. (FullLeaderboard gets the same treatment in
   FeedView.) */
import { lazyRetry } from "@/lib/lazyRetry";
const ChallengeList = lazyRetry(() =>
  import("@/features/challenges/ChallengeList").then((m) => ({
    default: m.ChallengeList,
  }))
);
import {
  Dumbbell,
  Footprints,
  Zap,
  Target,
  Flame,
  Salad,
  PersonStanding,
  Medal,
  Sunrise,
  X,
} from "lucide-react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { toast } from "@/lib/toast";
import { THEME } from "@/lib/theme";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { track as trackSocialEvent } from "@/lib/socialAnalytics";
import type { Crew } from "@/hooks/useCrews";
import type { SocialTab } from "@/pages/Social";

// Crew icons live in src/lib/crewIcons so the Crew page can render
// the same glyph the list row shows.
import { CREW_ICON_MAP as ICON_MAP } from "@/lib/crewIcons";

export interface CommunityViewProps {
  /** True when the Community tab is the active top-level tab. Gates
   *  the useSuggestedCrews fetch and the section render. The view
   *  itself stays mounted across tab switches (SOCIAL-HOME-01 Stage A)
   *  so its state survives exactly as it did pre-extraction. */
  active: boolean;
  /** True while FeedView's FullLeaderboard overlay is open — the shell
   *  hides the tab bar and every tab section, exactly as the old
   *  inline `!showFullLeaderboard && <>` gate did. */
  chromeHidden: boolean;
  uid: string | undefined;
  profileCrewId: string | undefined;
  setTab: (next: SocialTab) => void;
  /** The shell's pull-to-refresh re-fetches BOTH the crew list AND
   *  friend-of-friend suggestions; the view publishes a combined
   *  refresh fn into this ref (same pattern as FeedView). */
  refreshRef: MutableRefObject<(() => Promise<void>) | null>;
  /* useCrews stays in the shell — the People tab consumes crews /
     currentCrew / crewsError too, and the hook has no shared cache,
     so a second instance would double-fetch and desync optimistic
     membership updates. The Community slice threads through here. */
  crews: Crew[];
  currentCrew: Crew | null;
  joinCrew: (crewId: string) => Promise<void>;
  leaveCrew: () => Promise<void>;
  createCrew: (
    name: string,
    description: string,
    icon: string
  ) => Promise<void>;
  refreshCrews: () => Promise<void>;
}

export default function CommunityView({
  active,
  chromeHidden,
  uid,
  profileCrewId,
  setTab,
  refreshRef,
  crews,
  currentCrew,
  joinCrew,
  leaveCrew,
  createCrew,
  refreshCrews,
}: CommunityViewProps) {
  // Soc5d Phase 2: Suggested Crews — friend-of-friend (≥2 follows in
  // the same crew). Lazy-active on the Crews tab to skip the read
  // cost when the user is browsing Feed or Find.
  const {
    crews: suggestedCrews,
    refresh: refreshSuggestedCrews,
    dismiss: dismissSuggestedCrew,
  } = useSuggestedCrews(active, crews);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [newGroupIcon, setNewGroupIcon] = useState("");
  const [creatingCrew, setCreatingCrew] = useState(false);

  // Leave crew modal (#19)
  // Crew leave/create confirmation + form now use the BottomSheet primitive,
  // which provides the focus trap (plus Escape, scroll-lock, drag-dismiss).
  const [leavingCrewId, setLeavingCrewId] = useState<string | null>(null);
  /* Crew list sort. Default is 'popular' (memberCount desc) which is
     also the order Firestore returns rows in, so the initial render
     matches the user's first impression. 'new' surfaces recently-
     created crews so they don't get permanently buried under
     established ones. 'alpha' is the predictable browse mode. */
  const [crewSort, setCrewSort] = useState<"popular" | "new" | "alpha">(
    "popular"
  );
  /* Per-crew busy state — tracks the crew the user is currently
     joining so the row button can disable + show "Joining…". Without
     this, double-taps would double-fire joinCrew. */
  const [joiningCrewId, setJoiningCrewId] = useState<string | null>(null);
  /* Busy flag for the leave-confirm sheet so a slow Firestore write
     can't be triggered twice (Cancel/Leave double tap would otherwise
     race). */
  const [leavingInFlight, setLeavingInFlight] = useState(false);

  /* Publish the combined refresh into the shell's ref (effect-time
     sync, same latest-ref pattern as FeedView). */
  useEffect(() => {
    refreshRef.current = async () => {
      // Soc5 cross-cutting pin: single pull-to-refresh re-fetches
      // BOTH the crew list AND friend-of-friend suggestions so
      // the user gets a consistent fresh state.
      await Promise.all([refreshCrews(), refreshSuggestedCrews()]);
    };
  }, [refreshRef, refreshCrews, refreshSuggestedCrews]);

  if (!active || chromeHidden) return null;

  return (
    <section aria-label="Community" className="space-y-6">
      {/* Spc1g order: Spaces photo-carousel leads (the marquee),
          then Challenges, then Circles. Supersedes the
          GOALS-CORE-01 Circles-first IA — the curated public
          layer is now the tab's front door. */}
      <SpacesDirectory />

      {/* Challenges — the active / competitive surface. Empty-
      state CTA jumps to Discover so users have a clear path to
      find people to challenge. Suspense wraps the lazy chunk
      (Soc5 item 10); the fallback is a single skeleton row so
      the surface doesn't jump on first tab open. */}
      <Suspense
        fallback={
          <div
            className="h-16 rounded-xl bg-muted/40 animate-pulse"
            aria-hidden="true"
          />
        }
      >
        <ChallengeList onFindFriends={() => setTab("find")} />
      </Suspense>

      {uid && <CirclesSection uid={uid} />}

      {/* Soc5d: prominent Create-Crew CTA, shown ONLY when the
      user isn't currently in any crew. Per the locked spec,
      users with a crew see a smaller muted CTA below the
      crew list instead. The visual prominence here mirrors
      the gradient pill used elsewhere for primary growth
      actions (eg. Pro upgrade). */}
      {!profileCrewId && (
        <div className="space-y-3">
          {/* Soc5 item 8c: empty-state copy framing the section.
          The prominent CTA below provides the primary
          action; this explainer names the state so a brand-
          new user understands WHY they're staring at a
          button rather than a list. Mirrors the inline pill
          pattern used for the Following empty state. */}
          <div className="text-center px-4">
            <p className="text-sm font-semibold text-foreground">
              You're not in any crews yet
            </p>
            <p className="text-small text-muted-foreground mt-1">
              Create one or join via invite link
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowCreateGroup(true);
              trackSocialEvent("social_create_crew_tapped");
            }}
            className="w-full py-3.5 rounded-2xl text-white font-semibold text-sm active:scale-[0.98] transition-transform shadow-sm"
            style={{ background: THEME.brandStrong }}
          >
            Create a Crew
          </button>
        </div>
      )}

      {/* Soc5d Phase 2: Suggested Crews section — friend-of-friend
      picks where ≥2 of the user's follows are members. Section
      hides entirely when no qualifying suggestions exist
      (zero-state on follows, all dismissed, no overlaps), so
      users without a social network don't see a sad empty
      section. Each card has a dismiss X that persists to
      localStorage. */}
      {suggestedCrews.length > 0 && (
        <div className="space-y-3">
          <p className="text-small font-semibold uppercase tracking-wide text-muted-foreground">
            Suggested for you
          </p>
          <div className="space-y-2">
            {suggestedCrews.slice(0, 3).map((crew) => {
              const IconComp = ICON_MAP[crew.icon];
              const isJoiningThis = joiningCrewId === crew.id;
              return (
                <div
                  key={crew.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/40"
                >
                  <div
                    className="size-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${THEME.brand}14` }}
                  >
                    {IconComp && (
                      <IconComp size={18} className="text-primary shrink-0" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {crew.name}
                    </p>
                    <p className="text-micro text-muted-foreground truncate">
                      {crew.matchedFollows} of your follows
                      {crew.matchedFollows === 1 ? " is" : " are"} here
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      setJoiningCrewId(crew.id);
                      try {
                        await joinCrew(crew.id);
                        toast.success(`Joined ${crew.name}`);
                      } catch {
                        toast.error("Couldn't join the crew. Try again.");
                      } finally {
                        setJoiningCrewId(null);
                      }
                    }}
                    disabled={isJoiningThis}
                    className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold disabled:opacity-60 active:scale-[0.96] transition-transform"
                    style={{ background: THEME.brandStrong }}
                  >
                    {isJoiningThis ? "Joining…" : "Join"}
                  </button>
                  <button
                    type="button"
                    onClick={() => dismissSuggestedCrew(crew.id)}
                    aria-label={`Dismiss suggestion: ${crew.name}`}
                    className="size-7 rounded-lg flex items-center justify-center text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 active:scale-90 transition-all"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Crews list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-small font-semibold uppercase tracking-wide text-muted-foreground">
            Crews
          </p>
          {/* Sort — same canonical SegmentedControl, compact
          `wrap` layout so the three short options sit beside the
          section eyebrow without stretching. Three options keep
          the bar narrow enough not to wrap on a 320px viewport. */}
          <SegmentedControl
            ariaLabel="Sort crews"
            layout="wrap"
            className="shrink-0"
            value={crewSort}
            onChange={setCrewSort}
            options={[
              { value: "popular", label: "Popular" },
              { value: "new", label: "New" },
              { value: "alpha", label: "A–Z" },
            ]}
          />
        </div>
        <div className="space-y-2">
          {(() => {
            /* Client-side re-sort over the full fetched array.
           The Firestore query already returns every crew (no
           limit), so sorting here is just an array reorder —
           no extra reads. The slice cap stays at 5 across all
           sort modes to keep the surface curated; users who
           want the long tail can use the sort to peek at
           different slices without an "expand" affordance. */
            const sorted = [...crews];
            if (crewSort === "new") {
              sorted.sort((a, b) => {
                const at = a.createdAt as
                  | { toMillis?: () => number }
                  | Date
                  | null;
                const bt = b.createdAt as
                  | { toMillis?: () => number }
                  | Date
                  | null;
                const am =
                  at instanceof Date ? at.getTime() : (at?.toMillis?.() ?? 0);
                const bm =
                  bt instanceof Date ? bt.getTime() : (bt?.toMillis?.() ?? 0);
                return bm - am;
              });
            } else if (crewSort === "alpha") {
              sorted.sort((a, b) => a.name.localeCompare(b.name));
            }
            /* 'popular' falls through — Firestore already ordered
           by memberCount desc, so the initial array is the
           correct order. */
            return sorted.slice(0, 5);
          })().map((crew) => {
            const isMember = currentCrew?.id === crew.id;
            const IconComp = ICON_MAP[crew.icon];
            /* Subtext priority:
           1. crew.description (set on creation) — gives the
              crew an actual purpose line.
           2. "Be the first to join" when no members — softer
              than "0 members" which reads as a dead room.
           3. Member count otherwise. */
            const subtext = crew.description?.trim()
              ? crew.description
              : crew.memberCount === 0
                ? "Be the first to join"
                : `${crew.memberCount} member${crew.memberCount === 1 ? "" : "s"}`;
            return (
              /* Crew row — body links to the per-crew page; the
             Join/Leave button is a sibling so its click
             doesn't bubble into the navigation. */
              <div
                key={crew.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-card"
              >
                <Link
                  to={`/crew/${crew.id}`}
                  className="flex items-center gap-3 flex-1 min-w-0"
                >
                  {IconComp ? (
                    <IconComp
                      size={24}
                      className="text-muted-foreground shrink-0"
                    />
                  ) : (
                    <span className="text-2xl shrink-0">{crew.icon}</span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {crew.name}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">
                      {subtext}
                    </p>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (isMember) {
                      /* Tapping a member crew opens the leave-confirm sheet
                     rather than firing leaveCrew directly. The button
                     label stays positive ("Joined") because membership
                     is the success state — destructive copy belongs
                     behind the confirm flow. */
                      setLeavingCrewId(crew.id);
                      return;
                    }
                    if (joiningCrewId) return;
                    setJoiningCrewId(crew.id);
                    try {
                      await joinCrew(crew.id);
                    } finally {
                      setJoiningCrewId(null);
                    }
                  }}
                  disabled={!isMember && joiningCrewId === crew.id}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 disabled:opacity-60 ${
                    isMember
                      ? "bg-muted text-muted-foreground"
                      : "bg-primary-strong text-white"
                  }`}
                >
                  {isMember
                    ? "Joined"
                    : joiningCrewId === crew.id
                      ? "Joining…"
                      : "Join"}
                </button>
              </div>
            );
          })}
        </div>

        {/* Soc5d: muted bottom CTA shown only when the user
        already has a crew (the prominent top CTA covers the
        no-crew case). Bottom placement keeps the entry low-
        friction without competing visually with the user's
        existing crew row above. */}
        {profileCrewId && (
          /* Soc5d pin (2): dim further when user already belongs to
         ≥5 crews. Tropos's positioning is small private groups —
         the CTA stays available but its visual weight de-
         emphasises crew collecting. Half-width + reduced
         padding + opacity-60 stacks "smaller AND less prominent"
         per the locked copy. */
          <div className={crews.length >= 5 ? "flex justify-center" : ""}>
            <button
              type="button"
              onClick={() => {
                setShowCreateGroup(true);
                trackSocialEvent("social_create_crew_tapped");
              }}
              className={
                crews.length >= 5
                  ? "py-2 px-4 rounded-xl bg-card border border-border/50 text-xs font-medium text-muted-foreground/70 hover:text-foreground/80 transition-colors"
                  : "w-full py-3 rounded-xl bg-card border border-border/50 shadow-sm text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              }
            >
              + Create a Crew
            </button>
          </div>
        )}
      </div>

      {/* Leave Crew Confirmation Modal */}
      <BottomSheet
        open={!!leavingCrewId}
        onOpenChange={(o) => !o && setLeavingCrewId(null)}
        title="Leave crew?"
        hideHeader
        className="bg-[var(--glass-bg)] border border-[var(--glass-border)]"
      >
        <div className="p-5 space-y-4">
          <div className="w-10 h-1 rounded-full bg-border mx-auto" />
          <p className="text-base font-semibold text-foreground">Leave crew?</p>
          <p className="text-sm text-muted-foreground">
            You can rejoin this crew later.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setLeavingCrewId(null)}
              disabled={leavingInFlight}
              className="flex-1 py-3 rounded-xl bg-muted text-foreground font-medium text-sm disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={async () => {
                if (leavingInFlight) return;
                setLeavingInFlight(true);
                try {
                  await leaveCrew();
                  setLeavingCrewId(null);
                  toast.success("Left crew");
                } catch {
                  toast.error("Couldn't leave. Try again.");
                } finally {
                  setLeavingInFlight(false);
                }
              }}
              disabled={leavingInFlight}
              className="flex-1 py-3 rounded-xl bg-destructive text-destructive-foreground font-medium text-sm disabled:opacity-60"
            >
              {leavingInFlight ? "Leaving…" : "Leave"}
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* Create Crew Modal */}
      <BottomSheet
        open={showCreateGroup}
        onOpenChange={(o) => !o && setShowCreateGroup(false)}
        title="Create a Crew"
        hideHeader
        className="bg-[var(--glass-bg)] border border-[var(--glass-border)]"
      >
        <div className="p-5 space-y-4">
          <div className="w-10 h-1 rounded-full bg-border mx-auto" />
          <h3 className="text-base font-semibold text-foreground">
            Create a Crew
          </h3>
          <input
            type="text"
            aria-label="Crew name"
            placeholder="Crew name"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-muted border border-border/50 text-sm text-foreground"
          />
          <input
            type="text"
            aria-label="Crew description"
            placeholder="Description"
            value={newGroupDesc}
            onChange={(e) => setNewGroupDesc(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-muted border border-border/50 text-sm text-foreground"
          />
          <div className="flex gap-2 flex-wrap">
            {[
              { name: "dumbbell", Icon: Dumbbell },
              { name: "footprints", Icon: Footprints },
              { name: "zap", Icon: Zap },
              { name: "target", Icon: Target },
              { name: "flame", Icon: Flame },
              { name: "salad", Icon: Salad },
              { name: "person", Icon: PersonStanding },
              { name: "medal", Icon: Medal },
              { name: "sunrise", Icon: Sunrise },
            ].map(({ name, Icon }) => (
              <button
                type="button"
                key={name}
                onClick={() => setNewGroupIcon(name)}
                className={`p-2.5 rounded-lg ${newGroupIcon === name ? "bg-primary/20 ring-2 ring-primary" : "bg-muted"}`}
              >
                <Icon
                  size={24}
                  className={
                    newGroupIcon === name
                      ? "text-primary"
                      : "text-muted-foreground"
                  }
                />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={async () => {
              if (!newGroupName.trim() || creatingCrew) return;
              setCreatingCrew(true);
              try {
                await createCrew(
                  newGroupName,
                  newGroupDesc,
                  newGroupIcon || "dumbbell"
                );
                setShowCreateGroup(false);
                setNewGroupName("");
                setNewGroupDesc("");
                setNewGroupIcon("");
                toast.success("Crew created");
              } catch {
                toast.error("Failed to create crew. Please try again.");
              } finally {
                setCreatingCrew(false);
              }
            }}
            disabled={!newGroupName.trim() || creatingCrew}
            className="w-full py-3 rounded-xl bg-primary-strong text-white font-medium text-sm disabled:opacity-50"
          >
            {creatingCrew ? "Creating..." : "Create Crew"}
          </button>
        </div>
      </BottomSheet>
    </section>
  );
}
