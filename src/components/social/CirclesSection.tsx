/**
 * CirclesSection (GOALS-CORE-01) — the Goal Spaces block that leads the
 * Social "Circles" tab. Renders the member's circles first (goal-led
 * spaces are the tab's purpose; legacy Crews stay reachable below), a
 * one-tap create flow seeded from the three locked launch templates
 * (GsPb1: Strength Block / Race Journey / Consistency Reset), and the
 * cold state for members in no circles yet.
 *
 * All writes go through the goalSpace callables — this component never
 * touches Firestore directly.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Target,
  ChevronRight,
  Users,
  Footprints,
  Dumbbell,
  UtensilsCrossed,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { haptic } from "@/lib/haptic";
import { logger } from "@/lib/logger";
import { track as trackSocialEvent } from "@/lib/socialAnalytics";
import { useGoalSpaces } from "@/hooks/useGoalSpaces";
import { createGoalSpace } from "@/lib/goalSpacesApi";
import { useAuth } from "@/lib/auth";
import Button from "@/components/ui/Button";
import BottomSheet from "@/components/ui/BottomSheet";
import SectionLabel from "@/components/ui/SectionLabel";
import EmptyState from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/LoadingSkeleton";
import {
  CIRCLE_TEMPLATES,
  MAX_TITLE_LENGTH,
  goalSpaceTypeLabel,
  type CircleTemplate,
  type GoalSpaceType,
} from "@/features/goalSpaces/goalSpaceModel";

function typeIcon(type: GoalSpaceType) {
  switch (type) {
    case "race":
      return Footprints;
    case "strength_block":
      return Dumbbell;
    case "nutrition_consistency":
      return UtensilsCrossed;
    default:
      return Target;
  }
}

export default function CirclesSection() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { journeys, spaces, loading } = useGoalSpaces();
  const [showCreate, setShowCreate] = useState(false);
  const [template, setTemplate] = useState<CircleTemplate | null>(null);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreate(): Promise<void> {
    if (!template || creating) return;
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    setCreating(true);
    try {
      const { spaceId } = await createGoalSpace({
        type: template.type,
        title: cleanTitle,
        // The profile "why" seeds the private journey side — never shown
        // to other members.
        why: profile?.trainingWhy ?? "",
        displayName: profile?.displayName || "Athlete",
        photoURL: profile?.photoURL ?? null,
      });
      trackSocialEvent("circle_created", { circleType: template.type });
      setShowCreate(false);
      setTemplate(null);
      setTitle("");
      toast.success("Circle created — invite someone to make it real");
      navigate(`/circle/${spaceId}`);
    } catch (e) {
      logger.warn("[Circles] create failed", e);
      toast.error("Couldn't create the circle. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionLabel as="h2">Your circles</SectionLabel>
        {journeys.length > 0 && (
          <button
            type="button"
            onClick={() => {
              haptic();
              setShowCreate(true);
            }}
            className="min-h-[44px] px-2 -my-2 text-sm font-semibold text-primary active:scale-[0.97]"
          >
            New circle
          </button>
        )}
      </div>

      {loading && (
        <div className="space-y-2">
          <Skeleton className="h-16 rounded-2xl" />
        </div>
      )}

      {!loading && journeys.length === 0 && (
        <div className="p-4 rounded-2xl bg-card border border-border/50">
          <EmptyState
            compact
            icon={Target}
            headline="Train a goal together"
            sub="A circle is 2–8 people around one goal — a race, a strength block, a consistency reset. Invite-only, no feeds, no numbers."
            action={{
              label: "Start a circle",
              onClick: () => setShowCreate(true),
            }}
          />
          <p className="mt-3 text-xs text-center text-muted-foreground">
            Got an invite link? Opening it joins you automatically.
          </p>
        </div>
      )}

      {!loading && journeys.length > 0 && (
        <div className="space-y-2">
          {journeys.map((j) => {
            const space = spaces[j.spaceId];
            const Icon = typeIcon(space?.type ?? j.type);
            return (
              <button
                key={j.spaceId}
                type="button"
                onClick={() => {
                  haptic();
                  navigate(`/circle/${j.spaceId}`);
                }}
                className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border/50 text-left active:scale-[0.98] transition-transform"
              >
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 shrink-0">
                  <Icon className="size-5 text-primary" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-foreground truncate">
                    {space?.title ?? "Circle"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {goalSpaceTypeLabel(space?.type ?? j.type)}
                    {space && (
                      <>
                        {" · "}
                        <span className="font-mono tabular-nums">
                          {space.memberCount}
                        </span>{" "}
                        {space.memberCount === 1 ? "member" : "members"}
                      </>
                    )}
                    {space && !space.active && " · archived"}
                  </p>
                </div>
                <ChevronRight
                  className="size-4 text-muted-foreground shrink-0"
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      )}

      {/* ── Create sheet — template picker → title confirm ───────────── */}
      <BottomSheet
        open={showCreate}
        onOpenChange={(o) => {
          if (!o) {
            setShowCreate(false);
            setTemplate(null);
            setTitle("");
          }
        }}
        title="Start a circle"
        description="Pick the goal this circle is about. You'll invite people after."
      >
        <div className="px-4 pb-6 space-y-2">
          {!template &&
            CIRCLE_TEMPLATES.map((t) => {
              const Icon = typeIcon(t.type);
              return (
                <button
                  key={t.type}
                  type="button"
                  onClick={() => {
                    haptic();
                    setTemplate(t);
                    setTitle(t.defaultTitle);
                  }}
                  className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-muted text-left active:scale-[0.98]"
                >
                  <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 shrink-0">
                    <Icon className="size-5 text-primary" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground">
                      {t.label}
                    </p>
                    <p className="text-xs text-muted-foreground leading-snug">
                      {t.description}
                    </p>
                  </div>
                </button>
              );
            })}

          {template && (
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="circle-title"
                  className="text-sm text-muted-foreground"
                >
                  Circle name
                </label>
                <input
                  id="circle-title"
                  type="text"
                  value={title}
                  maxLength={MAX_TITLE_LENGTH}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full mt-1 px-4 py-2.5 rounded-lg bg-muted border border-border/50 text-foreground text-sm"
                />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                <Users className="inline size-3.5 mr-1 align-[-2px]" />
                Invite-only, up to 8 people. Members see check-ins and
                milestones — never calories, weights or workout numbers.
              </p>
              <Button
                fullWidth
                loading={creating}
                disabled={!title.trim()}
                onClick={handleCreate}
              >
                Create circle
              </Button>
              <Button
                fullWidth
                variant="ghost"
                onClick={() => setTemplate(null)}
              >
                Back
              </Button>
            </div>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}
