import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, Users } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { motion } from "framer-motion";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { useCrews, type Crew as CrewType } from "../hooks/useCrews";
import { getCrewActivities } from "../lib/socialApi";
import ActivityCard from "../components/social/ActivityCard";
import type { FeedItem } from "../hooks/useSocialFeed";
import { Skeleton } from "../components/LoadingSkeleton";
import { THEME } from "../lib/theme";
import { CREW_ICON_MAP } from "../lib/crewIcons";
import { toast } from "sonner";

const itemVariant = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.24 } },
};

/**
 * Per-crew home page (PR 3 core).
 *
 * Surfaces:
 *  - Header: icon + name + description + member count
 *  - Join / Leave button bound to useCrews
 *  - Recent activity feed scoped to this crewId via getCrewActivities
 *
 * Deferred to PR 3.5 / PR 4:
 *  - Weekly leaderboard (needs a scheduled rollup Cloud Function)
 *  - Active challenge per crew (ChallengeList isn't crew-scoped yet)
 *  - Member list view
 *
 * Activities arrive here because the post chain (useProgram +
 * RunSummary) auto-attaches `crewId: profile?.crewId` to every
 * postActivity call, so any post by a crew member surfaces on the
 * crew's home automatically. No new write path needed for PR 3.
 */
export default function Crew() {
  const { crewId } = useParams<{ crewId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { crews, currentCrew, joinCrew, leaveCrew } = useCrews();

  const [crewDoc, setCrewDoc] = useState<CrewType | null>(null);
  const [crewLoading, setCrewLoading] = useState(true);
  const [activities, setActivities] = useState<FeedItem[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [leaving, setLeaving] = useState(false);

  // Try the in-memory crews list first (covers the navigated-from-Social
  // case without a refetch); fall back to a direct read if the user
  // landed on this URL cold.
  useEffect(() => {
    if (!crewId) return;
    const fromList = crews.find((c) => c.id === crewId);
    if (fromList) {
      setCrewDoc(fromList);
      setCrewLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const snap = await getDoc(doc(db, "groups", crewId));
        if (cancelled) return;
        if (snap.exists()) {
          const data = snap.data() as Omit<CrewType, "id">;
          setCrewDoc({ id: snap.id, ...data });
        } else {
          setCrewDoc(null);
        }
      } finally {
        if (!cancelled) setCrewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [crewId, crews]);

  const loadActivities = useCallback(async () => {
    if (!crewId) return;
    setActivitiesLoading(true);
    try {
      const { items } = await getCrewActivities(crewId, 20);
      const mapped: FeedItem[] = items.map((a) => {
        const act = a as { id: string } & Record<string, unknown>;
        return {
          id: act.id,
          activityId: act.id,
          authorId: (act.authorId as string) ?? "",
          authorName: (act.authorName as string) ?? "Athlete",
          ...(act.authorPhotoURL ? { authorPhotoURL: act.authorPhotoURL as string } : {}),
          type: (act.type as "run" | "workout") ?? "workout",
          summary: "",
          createdAt: act.createdAt,
          activity: act,
          kudosCount: (act.kudosCount as number) ?? 0,
        };
      });
      setActivities(mapped);
    } catch {
      // Most likely cause on first run: missing composite index for
      // (crewId asc, visibility in, createdAt desc). Firestore logs a
      // one-click index creation link in the browser console.
      setActivities([]);
    } finally {
      setActivitiesLoading(false);
    }
  }, [crewId]);

  useEffect(() => {
    void loadActivities();
  }, [loadActivities]);

  if (!crewId) {
    return null;
  }

  if (crewLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!crewDoc) {
    return (
      <div className="p-6 text-center space-y-3">
        <p className="text-sm font-semibold text-foreground">Crew not found</p>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-xs font-medium text-primary"
        >
          Go back
        </button>
      </div>
    );
  }

  const isMember = currentCrew?.id === crewDoc.id;
  const Icon = CREW_ICON_MAP[crewDoc.icon];
  const memberLabel =
    crewDoc.memberCount === 0
      ? "No members yet"
      : `${crewDoc.memberCount} member${crewDoc.memberCount === 1 ? "" : "s"}`;

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      className="px-4 pt-4 pb-8 space-y-4"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}
    >
      {/* Back link */}
      <motion.div variants={itemVariant}>
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
      </motion.div>

      {/* Header card */}
      <motion.div
        variants={itemVariant}
        className="p-4 rounded-2xl bg-card border border-border/40"
      >
        <div className="flex items-start gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${THEME.brand}14` }}
          >
            {Icon ? (
              <Icon size={24} className="text-primary" />
            ) : (
              <span className="text-2xl">{crewDoc.icon}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-extrabold text-foreground truncate">{crewDoc.name}</h1>
            {crewDoc.description?.trim() && (
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {crewDoc.description}
              </p>
            )}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
              <Users size={12} />
              <span>{memberLabel}</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={async () => {
            if (!user) return;
            if (isMember) {
              setLeaving(true);
              try {
                await leaveCrew();
                toast.success("Left crew");
              } finally {
                setLeaving(false);
              }
            } else {
              try {
                await joinCrew(crewDoc.id);
                toast.success("Joined!");
              } catch {
                toast.error("Couldn't join. Try again.");
              }
            }
          }}
          disabled={leaving}
          className={`w-full mt-4 py-3 rounded-xl text-sm font-semibold active:scale-[0.98] transition-transform disabled:opacity-60 ${
            isMember
              ? "bg-muted text-foreground"
              : "bg-primary text-primary-foreground"
          }`}
        >
          {isMember ? (leaving ? "Leaving…" : "Leave crew") : "Join crew"}
        </button>
      </motion.div>

      {/* Recent activity */}
      <motion.div variants={itemVariant} className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Recent activity</h2>

        {activitiesLoading && (
          <div className="space-y-2">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {!activitiesLoading && activities.length === 0 && (
          /* Inline empty prompt — same compact pattern as the
             ChallengeList empty state on the Crews tab and the
             Following empty state on Feed. Keeps surface low-emotion
             when there's nothing to render. */
          <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-card border border-border/40">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${THEME.brand}14` }}
              >
                <Users size={16} style={{ color: THEME.brand }} />
              </div>
              <p className="text-xs text-muted-foreground leading-snug">
                {isMember
                  ? "Be the first to log a workout or run for this crew"
                  : "No activity yet — join to start posting here"}
              </p>
            </div>
          </div>
        )}

        {!activitiesLoading && activities.length > 0 && (
          <div className="space-y-3">
            {activities.map((item) => (
              <ActivityCard key={item.id} feedItem={item} />
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
