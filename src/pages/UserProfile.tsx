import { BLOCK_DIALOG_DESCRIPTION } from "@/lib/blockCopy";
import { useMemo, useState, type ReactNode } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { blockUser, unblockUser } from "../lib/socialApi";
import { useBlockedUsers } from "../hooks/useBlockedUsers";
import { useUid } from "../lib/auth";
import FollowButton from "../components/social/FollowButton";
import FollowRequestBanner from "../components/social/FollowRequestBanner";
import TrainingForChip from "@/features/spaces/TrainingForChip";
import PartnerStreakCard from "../features/partnerStreak/PartnerStreakCard";
import ActivityCard from "../components/social/ActivityCard";
import { ActivityCardSkeleton, Skeleton } from "../components/LoadingSkeleton";
import { Button } from "../components/ui/Button";
import { buttonClasses } from "../components/ui/buttonClasses";
import { IconButton } from "../components/ui/IconButton";
import Card from "../components/ui/Card";
import SectionHeading from "../components/ui/SectionHeading";
import SectionLabel from "../components/ui/SectionLabel";
import StatFigure from "../components/ui/StatFigure";
import { ErrorState } from "../components/ui/ErrorState";
import { EmptyState } from "../components/ui/EmptyState";
import { BADGE_ART, BADGE_ICONS } from "../features/streaks/badges";
import { BadgeHex } from "../features/streaks/BadgeHex";
import {
  Flame,
  MoreHorizontal,
  Ban,
  Flag,
  ChevronLeft,
  Trophy,
  UserX,
  Users,
  WifiOff,
} from "lucide-react";
import { toast } from "@/lib/toast";
import Avatar from "../components/Avatar";
import ReportModal from "../components/social/ReportModal";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Spinner } from "../components/ui/Spinner";
import { distanceValue } from "@/lib/runLabels";
import { distanceUnitLabel } from "@/lib/distanceUnits";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import { useLiftUnit } from "@/hooks/useLiftUnit";
import { liftUnitLabel, liftVolumeIn } from "@/lib/liftLoad";
import { useUserProfileData } from "@/hooks/useUserProfileData";
import { useMenuButton } from "@/hooks/useMenuButton";
import { profileWeek } from "@/lib/profileWeek";

/**
 * /user/:uid — a person's profile.
 *
 * Keyed by the (viewer, profile) pair: one profile's session card links to
 * another person, and with the page left mounted across that change the
 * last profile's name and numbers showed while the next one loaded.
 */
export default function UserProfile() {
  const { uid } = useParams<{ uid: string }>();
  const viewerUid = useUid();
  if (!uid) return null;
  return (
    <ProfilePage
      key={`${viewerUid ?? ""}:${uid}`}
      uid={uid}
      viewerUid={viewerUid}
    />
  );
}

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

/* The same words for a profile that is gone and one whose owner blocked
   the reader, so the page never tells anyone they were blocked (S4,
   Polish3 call 1). Reference apps answer a block the way they answer a
   missing page. */
function ProfileUnavailable({ back }: { back: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      {back}
      <EmptyState
        icon={UserX}
        headline="This profile isn't available"
        sub="The account may have been deleted, or the link is out of date."
        action={{
          label: "Go back",
          onClick: () => navigate(-1),
          variant: "secondary",
        }}
      />
    </div>
  );
}

function BackButton() {
  const navigate = useNavigate();
  return (
    <Button
      onClick={() => navigate(-1)}
      variant="ghost"
      size="sm"
      leftIcon={<ChevronLeft className="size-4" />}
      className="-ml-2 text-muted-foreground hover:text-foreground"
    >
      Back
    </Button>
  );
}

/**
 * Blocking hides each person from the other. A profile whose owner blocked
 * the reader is not read at all: nothing from it (name, photo, badges, the
 * race chip, sessions) reaches the page, and the rules refuse its public
 * projection besides. Waits for both block lists, so a blocker's profile
 * cannot show while they load.
 */
function ProfilePage({
  uid,
  viewerUid,
}: {
  uid: string;
  viewerUid: string | null;
}) {
  const { blockedYou, ready } = useBlockedUsers();
  const isOwnProfile = viewerUid === uid;
  if (!isOwnProfile && !ready) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Spinner size="md" variant="muted" label="Loading profile" />
      </div>
    );
  }
  if (!isOwnProfile && blockedYou.has(uid)) {
    return <ProfileUnavailable back={<BackButton />} />;
  }
  return <ProfileContent uid={uid} viewerUid={viewerUid} />;
}

function ProfileContent({
  uid,
  viewerUid,
}: {
  uid: string;
  viewerUid: string | null;
}) {
  const unit = useDistanceUnit();
  // Lift18: their week's volume, stored in kg, in the reader's unit.
  const liftUnit = useLiftUnit();
  const navigate = useNavigate();
  const isOwnProfile = viewerUid === uid;
  const {
    status,
    identity,
    streak,
    trainingForSpaceId,
    followers,
    followingCount,
    countsFailed,
    badges,
    badgesFailed,
    posts,
    postsLoading,
    postsFailed,
    retry,
    adjustFollowers,
    adjustFollowing,
  } = useUserProfileData(uid, viewerUid);
  const week = useMemo(() => profileWeek(posts), [posts]);
  const {
    open: menuOpen,
    close: closeMenu,
    choose: chooseFromMenu,
    buttonProps: menuButtonProps,
    menuProps,
    itemProps: menuItemProps,
  } = useMenuButton();
  const [showReport, setShowReport] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const { youBlocked, addBlocked, removeBlocked } = useBlockedUsers();
  const youBlockedThem = !isOwnProfile && youBlocked.has(uid);

  const back = <BackButton />;

  if (status === "loading") {
    return (
      <div className="p-6 flex items-center justify-center">
        <Spinner size="md" variant="muted" label="Loading profile" />
      </div>
    );
  }

  /* A profile with nothing behind it used to spin forever: the page
     waited for a profile document that was never coming. A failed read
     is not the same thing, so it offers a retry rather than saying the
     profile is gone. */
  if (status === "error") {
    return (
      <div className="space-y-4">
        {back}
        <EmptyState
          icon={WifiOff}
          headline="Couldn't load this profile"
          sub="Check your connection and try again."
          action={{ label: "Try again", onClick: retry }}
        />
      </div>
    );
  }
  if (status === "missing" || !identity) {
    return <ProfileUnavailable back={back} />;
  }

  const name = identity.displayName;

  const handleBlock = async () => {
    if (!viewerUid) return;
    try {
      await blockUser(viewerUid, uid);
      addBlocked(uid);
      toast.success(`Blocked ${name}`);
      navigate(-1);
    } catch {
      toast.error("Couldn't block user. Try again.");
    }
  };

  /* The rules refuse a follow across a block, so a Follow button here
     would only fail. Unblocking is the way back to following. */
  const handleUnblock = async () => {
    if (!viewerUid) return;
    try {
      await unblockUser(viewerUid, uid);
      removeBlocked(uid);
      toast.success(`Unblocked ${name}`);
    } catch {
      toast.error("Couldn't unblock. Try again.");
    }
  };

  return (
    <div className="space-y-4">
      {back}

      <div className="flex items-center gap-4">
        {/* No photo for someone you blocked, as BlockAwareAvatar does
            everywhere else. */}
        <Avatar
          photoURL={youBlockedThem ? null : identity.photoURL}
          displayName={name}
          size="xl"
          className="size-16 text-2xl"
        />
        <div className="min-w-0 flex-1">
          {/* Two lines, then an ellipsis: the name is how a reader knows
              whose profile this is, and one line cut a long one to
              "Christopher Ale…" at 320px. */}
          <h1
            dir="auto"
            className="text-left text-h2 font-extrabold leading-tight tracking-tight line-clamp-2 break-words"
          >
            {name}
          </h1>
          {countsFailed ? (
            <p className="mt-1 text-small text-muted-foreground">
              Couldn't load follower counts.
            </p>
          ) : followers === null || followingCount === null ? (
            <Skeleton className="mt-1.5 h-4 w-36 rounded" />
          ) : (
            <p className="mt-1 text-small text-muted-foreground">
              <span className="font-mono tabular-nums font-semibold text-foreground">
                {followers.toLocaleString()}
              </span>{" "}
              {plural(followers, "follower", "followers")}
              <span aria-hidden="true"> · </span>
              <span className="font-mono tabular-nums font-semibold text-foreground">
                {followingCount.toLocaleString()}
              </span>{" "}
              following
            </p>
          )}
          {trainingForSpaceId && !youBlockedThem && (
            <div className="mt-2">
              <TrainingForChip spaceId={trainingForSpaceId} />
            </div>
          )}
        </div>
      </div>

      {isOwnProfile ? (
        <div className="space-y-2">
          <p className="text-small text-muted-foreground">
            This is how your profile looks to other people.
          </p>
          <Link
            to="/settings/profile"
            className={buttonClasses({ variant: "secondary", fullWidth: true })}
          >
            Edit profile
          </Link>
        </div>
      ) : (
        <>
          <FollowRequestBanner
            requesterUid={uid}
            name={name}
            onAccepted={() => adjustFollowing(1)}
          />
          <div className="flex items-center gap-2">
            {youBlockedThem ? (
              <Button
                variant="secondary"
                className="flex-1 text-sm"
                onClick={() => void handleUnblock()}
              >
                Unblock
              </Button>
            ) : (
              <FollowButton
                targetUid={uid}
                className="flex-1 text-sm"
                onFollowChange={(now, before) => {
                  // A request is not a follower yet.
                  if (now === "following") adjustFollowers(1);
                  else if (before === "following") adjustFollowers(-1);
                }}
              />
            )}
            <div className="relative">
              {/* A menu button (`useMenuButton`): it says it opens a menu,
                  the menu takes focus and arrow keys, and Escape puts
                  focus back here. A tap outside closes it, on a backdrop
                  that is not a control of its own, since a screen-sized
                  "Close menu" button would be a stop for every reader
                  and every Tab. */}
              <IconButton
                aria-label="More options"
                {...menuButtonProps}
                icon={<MoreHorizontal />}
                className="bg-muted hover:bg-muted/80 text-muted-foreground"
              />
              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    aria-hidden="true"
                    onClick={closeMenu}
                  />
                  <div
                    {...menuProps}
                    className="absolute right-0 top-full mt-1 z-20 w-44 bg-card rounded-xl border border-border/50 shadow-xl overflow-hidden"
                  >
                    <button
                      type="button"
                      {...menuItemProps}
                      onClick={chooseFromMenu(() => setShowReport(true))}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-foreground hover:bg-muted focus-visible:bg-muted focus-visible:outline-none transition-colors"
                    >
                      <Flag className="size-4" />
                      Report user
                    </button>
                    {!youBlockedThem && (
                      <button
                        type="button"
                        {...menuItemProps}
                        onClick={chooseFromMenu(() =>
                          setShowBlockConfirm(true)
                        )}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-destructive-strong hover:bg-destructive/10 focus-visible:bg-destructive/10 focus-visible:outline-none transition-colors"
                      >
                        <Ban className="size-4" />
                        Block user
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Someone you blocked: the name and the way back, and nothing
          they have shared, so the promise in the Block dialog holds. */}
      {youBlockedThem ? (
        <EmptyState
          icon={Ban}
          headline={`You blocked ${name}`}
          sub="Their sessions and badges stay hidden until you unblock them."
        />
      ) : (
        <>
          {/* Partner-streak entry (SOCIAL S3) — renders only for another
          user you mutually follow; null otherwise. */}
          {!isOwnProfile && (
            <PartnerStreakCard partnerUid={uid} partnerName={name} />
          )}

          {/* This week, from what they shared: all a profile can read, and
          the label says so. Replaced two lifetime-looking pills that
          summed the last ten shared posts. */}
          <Card>
            <div className="flex items-center justify-between gap-3">
              <SectionLabel>Shared this week</SectionLabel>
              {streak > 0 && (
                <p className="flex items-center gap-1 text-xs font-semibold text-foreground">
                  <Flame size={14} className="text-streak" aria-hidden="true" />
                  <span>
                    <span className="font-mono tabular-nums">{streak}</span>-day
                    streak
                  </span>
                </p>
              )}
            </div>
            {postsLoading ? (
              <Skeleton className="mt-3 h-12 w-full rounded-lg" />
            ) : postsFailed ? (
              <p className="mt-2 text-small text-muted-foreground">
                Couldn't load this week's sessions.
              </p>
            ) : week.sessions > 0 ? (
              <div className="mt-3 grid grid-cols-3 divide-x divide-border">
                <StatFigure
                  value={String(week.sessions)}
                  unit={plural(week.sessions, "session", "sessions")}
                />
                <StatFigure
                  value={distanceValue(week.distanceM, unit, 1)}
                  unit={`${distanceUnitLabel(unit)} run`}
                />
                <StatFigure
                  value={Math.round(
                    liftVolumeIn(week.volumeKg, liftUnit)
                  ).toLocaleString()}
                  unit={`${liftUnitLabel(liftUnit)} lifted`}
                />
              </div>
            ) : (
              <p className="mt-2 text-small text-muted-foreground">
                Nothing yet.
              </p>
            )}
          </Card>

          {badgesFailed && (
            <p className="text-small text-muted-foreground">
              Couldn't load badges.
            </p>
          )}
          {badges.length > 0 && (
            <ul className="grid grid-cols-4 gap-2" aria-label="Recent badges">
              {badges.map((badge) => (
                <li key={badge.id} className="flex flex-col items-center gap-1">
                  <BadgeHex
                    Icon={BADGE_ICONS[badge.lucideIcon] ?? Trophy}
                    tier={badge.tier}
                    earned
                    size={56}
                    imageSrc={BADGE_ART[badge.id]}
                  />
                  <span className="text-xs text-muted-foreground text-center leading-tight">
                    {badge.name}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <section className="space-y-2" aria-labelledby="profile-sessions">
            <SectionHeading id="profile-sessions">
              Recent sessions
            </SectionHeading>
            {postsLoading ? (
              <>
                <ActivityCardSkeleton />
                <ActivityCardSkeleton stagger={1} />
              </>
            ) : postsFailed ? (
              <ErrorState
                title="Couldn't load sessions"
                description="Check your connection and try again."
                retry={{ onClick: retry }}
              />
            ) : posts.length > 0 ? (
              posts.map((item) => (
                <ActivityCard key={item.id} feedItem={item} />
              ))
            ) : isOwnProfile ? (
              <EmptyState
                icon={Users}
                headline="Nothing shared yet"
                sub="Sessions you share show here and in your followers' feeds."
                action={{ label: "Start a workout", href: "/program" }}
              />
            ) : (
              <EmptyState
                icon={Users}
                headline="No shared sessions yet"
                sub={`When ${name} shares a workout or run, it shows here.`}
              />
            )}
          </section>
        </>
      )}

      {showReport && (
        <ReportModal
          targetType="user"
          targetId={uid}
          targetAuthorUid={uid}
          onClose={() => setShowReport(false)}
        />
      )}

      <ConfirmDialog
        open={showBlockConfirm}
        title={`Block ${name}?`}
        description={BLOCK_DIALOG_DESCRIPTION}
        confirmLabel="Block"
        destructive
        onConfirm={() => {
          setShowBlockConfirm(false);
          handleBlock();
        }}
        onCancel={() => setShowBlockConfirm(false)}
      />
    </div>
  );
}
