import { useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { blockUser } from "../lib/socialApi";
import { useUid } from "../lib/auth";
import FollowButton from "../components/social/FollowButton";
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
import { useUserProfileData } from "@/hooks/useUserProfileData";
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

function ProfilePage({
  uid,
  viewerUid,
}: {
  uid: string;
  viewerUid: string | null;
}) {
  const unit = useDistanceUnit();
  const navigate = useNavigate();
  const isOwnProfile = viewerUid === uid;
  const {
    status,
    identity,
    streak,
    trainingForSpaceId,
    followers,
    followingCount,
    badges,
    posts,
    postsLoading,
    retry,
    adjustFollowers,
  } = useUserProfileData(uid, viewerUid);
  const week = useMemo(() => profileWeek(posts), [posts]);
  const [showMenu, setShowMenu] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);

  const back = (
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
  if (status === "missing" || status === "error" || !identity) {
    return (
      <div className="space-y-4">
        {back}
        {status === "error" ? (
          <EmptyState
            icon={WifiOff}
            headline="Couldn't load this profile"
            sub="Check your connection and try again."
            action={{ label: "Try again", onClick: retry }}
          />
        ) : (
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
        )}
      </div>
    );
  }

  const name = identity.displayName;

  const handleBlock = async () => {
    if (!viewerUid) return;
    try {
      await blockUser(viewerUid, uid);
      toast.success(`Blocked ${name}`);
      navigate(-1);
    } catch {
      toast.error("Couldn't block user. Try again.");
    }
  };

  return (
    <div className="space-y-4">
      {back}

      <div className="flex items-center gap-4">
        <Avatar
          photoURL={identity.photoURL}
          displayName={name}
          size="xl"
          className="size-16 text-2xl"
        />
        <div className="min-w-0 flex-1">
          <h1
            dir="auto"
            className="text-left text-h2 font-extrabold leading-tight tracking-tight truncate"
          >
            {name}
          </h1>
          {followers === null || followingCount === null ? (
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
          {trainingForSpaceId && (
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
        <div className="flex items-center gap-2">
          <FollowButton
            targetUid={uid}
            className="flex-1 text-sm"
            onFollowChange={(following) => adjustFollowers(following ? 1 : -1)}
          />
          <div className="relative">
            <IconButton
              aria-label="More options"
              onClick={() => setShowMenu(!showMenu)}
              icon={<MoreHorizontal />}
              className="bg-muted hover:bg-muted/80 text-muted-foreground"
            />
            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  role="button"
                  tabIndex={0}
                  aria-label="Close menu"
                  onClick={() => setShowMenu(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setShowMenu(false);
                  }}
                />
                <div className="absolute right-0 top-full mt-1 z-20 w-44 bg-card rounded-xl border border-border/50 shadow-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      setShowReport(true);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <Flag className="size-4" />
                    Report user
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      setShowBlockConfirm(true);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-destructive-strong hover:bg-destructive/10 transition-colors"
                  >
                    <Ban className="size-4" />
                    Block user
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

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
              value={Math.round(week.volumeKg).toLocaleString()}
              unit="kg lifted"
            />
          </div>
        ) : (
          <p className="mt-2 text-small text-muted-foreground">Nothing yet.</p>
        )}
      </Card>

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
        <SectionHeading id="profile-sessions">Recent sessions</SectionHeading>
        {postsLoading ? (
          <>
            <ActivityCardSkeleton />
            <ActivityCardSkeleton stagger={1} />
          </>
        ) : posts.length > 0 ? (
          posts.map((item) => <ActivityCard key={item.id} feedItem={item} />)
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
        description="They won't be able to see your activity and you won't see theirs."
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
