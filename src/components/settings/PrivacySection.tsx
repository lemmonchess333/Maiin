import { Button } from "@/components/ui/Button";
import { useState } from "react";
import { haptic } from "@/lib/haptic";
import { track as trackSettingsEvent } from "@/lib/settingsAnalytics";
import { Users, Check, MapPin, Trash2, Plus, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { Toggle } from "@/components/ui/Toggle";
import { toast } from "@/lib/toast";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getBlockedUsers, unblockUser } from "@/lib/socialApi";
import AccordionSection from "@/components/AccordionSection";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { UserProfile, UpdateProfileResult } from "@/lib/auth";
import type { PrivacyZone } from "@/lib/privacyZones";
import type { User } from "firebase/auth";
import type { Crew } from "@/hooks/useCrews";

interface PrivacySectionProps {
  user: User | null;
  /** Subset of the profile fields read by this section. Required for
   *  F1's aiAnalysisEnabled toggle which renders the switch in its
   *  current state. */
  profile: Pick<
    UserProfile,
    "aiAnalysisEnabled" | "hideSharedRouteEnds"
  > | null;
  updateProfile: (
    data: Partial<UserProfile>,
    opts?: { allowProtected?: boolean }
  ) => Promise<UpdateProfileResult>;
  defaultVisibility: "public" | "followers" | "private";
  setDefaultVisibility: (v: "public" | "followers" | "private") => void;
  autoPostRuns: boolean;
  setAutoPostRuns: (v: boolean) => void;
  autoPostWorkouts: boolean;
  setAutoPostWorkouts: (v: boolean) => void;
  privacyZones: PrivacyZone[];
  addZone: (zone: Omit<PrivacyZone, "id">) => Promise<void>;
  removeZone: (id: string) => Promise<void>;
  newZoneName: string;
  setNewZoneName: (v: string) => void;
  newZoneRadius: number;
  setNewZoneRadius: (v: number) => void;
  defaultCrews: Crew[];
  currentCrew: Crew | null;
  joinCrew: (crewId: string) => Promise<void>;
  leaveCrew: () => Promise<void>;
  inline?: boolean;
}

export default function PrivacySection({
  user,
  profile,
  updateProfile,
  defaultVisibility,
  setDefaultVisibility,
  autoPostRuns,
  setAutoPostRuns,
  autoPostWorkouts,
  setAutoPostWorkouts,
  privacyZones,
  addZone,
  removeZone,
  newZoneName,
  setNewZoneName,
  newZoneRadius,
  setNewZoneRadius,
  defaultCrews,
  currentCrew,
  joinCrew,
  leaveCrew,
  inline = false,
}: PrivacySectionProps) {
  const [showCrewPicker, setShowCrewPicker] = useState(false);
  const [showLeaveCrewConfirm, setShowLeaveCrewConfirm] = useState(false);
  const [blockedUsersList, setBlockedUsersList] = useState<
    { uid: string; displayName: string }[]
  >([]);
  const [blockedUsersLoading, setBlockedUsersLoading] = useState(false);
  const [blockedUsersLoaded, setBlockedUsersLoaded] = useState(false);

  return (
    <>
      <AccordionSection
        inline={inline}
        icon={<Users className="size-5 text-primary" />}
        title="Social & Privacy"
        subtitle="Crew, visibility, auto-post"
      >
        {/* Crew switcher */}
        <div className="p-4 rounded-lg bg-muted space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">Your crew</p>
              <p className="text-xs text-muted-foreground">
                {currentCrew
                  ? `${currentCrew.icon} ${currentCrew.name}`
                  : "Not in a crew"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCrewPicker(!showCrewPicker)}
              className="px-3 py-1.5 min-h-[44px] inline-flex items-center rounded-lg text-xs font-medium bg-primary text-primary-foreground"
            >
              {currentCrew ? "Switch" : "Join"}
            </button>
          </div>
          {showCrewPicker && (
            <div className="space-y-2 pt-2 border-t border-border/50">
              {defaultCrews.map((crew) => (
                <button
                  type="button"
                  key={crew.id}
                  onClick={async () => {
                    await joinCrew(crew.id);
                    setShowCrewPicker(false);
                    toast.success(`Joined ${crew.name}`);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 p-2.5 rounded-lg text-left text-xs transition-colors",
                    currentCrew?.id === crew.id
                      ? "bg-primary/10 border border-primary/30"
                      : "bg-background hover:bg-muted"
                  )}
                >
                  <span className="text-lg">{crew.icon}</span>
                  <div className="flex-1">
                    <p className="font-medium">{crew.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {crew.description}
                    </p>
                  </div>
                  {currentCrew?.id === crew.id && (
                    <Check className="size-3.5 text-primary" />
                  )}
                </button>
              ))}
              {currentCrew && (
                <button
                  type="button"
                  onClick={() => setShowLeaveCrewConfirm(true)}
                  className="w-full text-center text-xs text-muted-foreground hover:text-destructive py-1"
                >
                  Leave crew
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
          <div>
            <p className="text-sm text-foreground">Default visibility</p>
            <p className="text-xs text-muted-foreground">
              Who can see your posts
            </p>
          </div>
          <select
            value={defaultVisibility}
            onChange={async (e) => {
              const prev = defaultVisibility;
              const val = e.target.value as "public" | "followers" | "private";
              setDefaultVisibility(val);
              const result = await updateProfile({ defaultVisibility: val });
              if (!result.ok) setDefaultVisibility(prev);
            }}
            className="bg-card rounded-lg px-2 py-1 text-sm border border-border/50"
          >
            <option value="public">Public</option>
            <option value="followers">Followers</option>
            <option value="private">Private</option>
          </select>
        </div>

        <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
          <div>
            <p className="text-sm text-foreground">Auto-post runs</p>
            <p className="text-xs text-muted-foreground">
              Share runs to feed automatically
            </p>
          </div>
          <Toggle
            checked={autoPostRuns}
            label="Auto-post runs"
            onChange={async () => {
              haptic("light");
              const prev = autoPostRuns;
              const next = !autoPostRuns;
              setAutoPostRuns(next);
              trackSettingsEvent("settings_toggle_changed", {
                toggle: "auto_post_runs",
                value: next,
              });
              const result = await updateProfile({ autoPostRuns: next });
              if (!result.ok) setAutoPostRuns(prev);
            }}
          />
        </div>

        <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
          <div>
            <p className="text-sm text-foreground">Auto-post workouts</p>
            <p className="text-xs text-muted-foreground">
              Share workouts to feed automatically
            </p>
          </div>
          <Toggle
            checked={autoPostWorkouts}
            label="Auto-post workouts"
            onChange={async () => {
              haptic("light");
              const prev = autoPostWorkouts;
              const next = !autoPostWorkouts;
              setAutoPostWorkouts(next);
              trackSettingsEvent("settings_toggle_changed", {
                toggle: "auto_post_workouts",
                value: next,
              });
              const result = await updateProfile({ autoPostWorkouts: next });
              if (!result.ok) setAutoPostWorkouts(prev);
            }}
          />
        </div>

        {/* F1 AI analysis opt-out. Undefined / true = enabled (default);
          false = user opted out. Toggling off hides the AI CTAs and
          refuses the underlying Gemini calls (gate lives downstream
          in useFoodAnalysis — wired separately so the call-site
          changes can be reviewed independently). */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
          <div className="flex-1 mr-3">
            <p className="text-sm font-medium text-foreground">
              AI food analysis
            </p>
            <p className="text-xs text-muted-foreground">
              Allow Gemini to analyse food photos and refine text entries
            </p>
          </div>
          <Toggle
            checked={profile?.aiAnalysisEnabled !== false}
            label="Toggle AI food analysis"
            onChange={async () => {
              haptic("light");
              // The field is undefined-default-on: treat any non-false
              // current value as "currently enabled" and flip to false.
              // Subsequent flips toggle between true / false explicitly
              // so the user can re-opt-in via the same control.
              const currentlyEnabled = profile?.aiAnalysisEnabled !== false;
              const next = !currentlyEnabled;
              trackSettingsEvent("settings_toggle_changed", {
                toggle: "ai_analysis_enabled",
                value: next,
              });
              await updateProfile({ aiAnalysisEnabled: next });
            }}
          />
        </div>

        {/* Shared-route end clipping — default-on home-location protection,
            independent of (and composed with) explicit Privacy Zones below. */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
          <div className="flex-1 mr-3">
            <p className="text-sm font-medium text-foreground">
              Hide route start &amp; end on shared runs
            </p>
            <p className="text-xs text-muted-foreground">
              Clips ~200m off each end of the route shown to followers, so your
              home isn&apos;t broadcast. Your own map keeps the full route.
            </p>
          </div>
          <Toggle
            checked={profile?.hideSharedRouteEnds !== false}
            label="Toggle hiding route ends on shared runs"
            onChange={async () => {
              haptic("light");
              const currentlyOn = profile?.hideSharedRouteEnds !== false;
              const next = !currentlyOn;
              trackSettingsEvent("settings_toggle_changed", {
                toggle: "hide_shared_route_ends",
                value: next,
              });
              await updateProfile({ hideSharedRouteEnds: next });
            }}
          />
        </div>

        {/* Privacy Zones */}
        <div className="p-4 rounded-lg bg-muted space-y-3">
          <div className="flex items-center gap-2">
            <MapPin className="size-4 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Privacy Zones
              </p>
              <p className="text-xs text-muted-foreground">
                Hide route start/end near saved locations
              </p>
            </div>
          </div>

          {privacyZones.map((z) => (
            <div
              key={z.id}
              className="flex items-center justify-between p-2.5 rounded-lg bg-card"
            >
              <div>
                <p className="text-xs font-medium text-foreground">{z.name}</p>
                <p className="text-xs text-muted-foreground">
                  {z.radiusMeters}m radius
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeZone(z.id)}
                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}

          <div className="flex gap-2">
            <input
              type="text"
              aria-label="Privacy zone name"
              value={newZoneName}
              onChange={(e) => setNewZoneName(e.target.value)}
              placeholder="Zone name (e.g. Home)"
              className="flex-1 px-3 py-2 rounded-lg bg-card border border-border text-sm"
            />
            <select
              value={newZoneRadius}
              onChange={(e) => setNewZoneRadius(Number(e.target.value))}
              className="p-2 rounded-lg bg-card border border-border text-sm"
            >
              <option value={200}>200m</option>
              <option value={500}>500m</option>
              <option value={750}>750m</option>
              <option value={1000}>1km</option>
            </select>
          </div>
          <Button
            variant="primary"
            fullWidth
            leftIcon={<Plus className="size-3.5" />}
            onClick={async () => {
              if (!newZoneName.trim()) {
                toast.error("Enter a zone name");
                return;
              }
              try {
                const pos = await new Promise<GeolocationPosition>(
                  (resolve, reject) =>
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                      enableHighAccuracy: true,
                      timeout: 10000,
                    })
                );
                await addZone({
                  name: newZoneName.trim(),
                  lat: pos.coords.latitude,
                  lon: pos.coords.longitude,
                  radiusMeters: newZoneRadius,
                });
                setNewZoneName("");
                toast.success("Privacy zone added");
              } catch {
                toast.error("Could not get your location");
              }
            }}
          >
            Add Current Location
          </Button>
        </div>

        {/* Blocked Users (#25) */}
        <div className="p-4 rounded-lg bg-muted space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="size-4 text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Blocked Users
                </p>
                <p className="text-xs text-muted-foreground">
                  Manage users you&apos;ve blocked
                </p>
              </div>
            </div>
            {!blockedUsersLoaded && (
              <Button
                variant="outline"
                size="sm"
                loading={blockedUsersLoading}
                onClick={async () => {
                  if (!user) return;
                  setBlockedUsersLoading(true);
                  try {
                    const ids = await getBlockedUsers(user.uid);
                    // PR G (audit P1 #12): read the public profile mirror
                    // rather than the private user doc. R1A account-
                    // deletion work plans a future write-freeze on
                    // private user docs; this site would silently break.
                    // The public mirror is the supported read surface
                    // for cross-user displays anyway.
                    const users = await Promise.all(
                      ids.map(async (uid) => {
                        const snap = await getDoc(
                          doc(db, "users", uid, "public", "profile")
                        );
                        return {
                          uid,
                          displayName: snap.exists()
                            ? snap.data().displayName || "User"
                            : "Deleted user",
                        };
                      })
                    );
                    setBlockedUsersList(users);
                    setBlockedUsersLoaded(true);
                  } catch {
                    toast.error(
                      "Couldn't load your blocked users. Please try again."
                    );
                  } finally {
                    setBlockedUsersLoading(false);
                  }
                }}
              >
                Show
              </Button>
            )}
          </div>
          {blockedUsersLoaded &&
            (blockedUsersList.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">
                You haven&apos;t blocked anyone
              </p>
            ) : (
              <div className="space-y-2">
                {blockedUsersList.map((bu) => (
                  <div
                    key={bu.uid}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-card"
                  >
                    <span className="text-xs font-medium text-foreground">
                      {bu.displayName}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!user) return;
                        await unblockUser(user.uid, bu.uid);
                        setBlockedUsersList((prev) =>
                          prev.filter((u) => u.uid !== bu.uid)
                        );
                        toast.success(`Unblocked ${bu.displayName}`);
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium bg-muted text-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                    >
                      Unblock
                    </button>
                  </div>
                ))}
              </div>
            ))}
        </div>
      </AccordionSection>

      <ConfirmDialog
        open={showLeaveCrewConfirm}
        title="Leave crew?"
        description="You can rejoin this crew later."
        confirmLabel="Leave"
        destructive
        onConfirm={async () => {
          setShowLeaveCrewConfirm(false);
          await leaveCrew();
          setShowCrewPicker(false);
          toast.success("Left crew");
        }}
        onCancel={() => setShowLeaveCrewConfirm(false)}
      />
    </>
  );
}
