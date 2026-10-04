import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { useState } from "react";
import { haptic } from "@/lib/haptic";
import { track as trackSettingsEvent } from "@/lib/settingsAnalytics";
import { Users, MapPin, Trash2, Plus, Shield } from "lucide-react";
import { Toggle } from "@/components/ui/Toggle";
import { toast } from "@/lib/toast";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getBlockedUsers, unblockUser } from "@/lib/socialApi";
import { useBlockedUsers } from "@/hooks/useBlockedUsers";
import AccordionSection from "@/components/AccordionSection";
import ShareDefaultsRow from "@/components/settings/ShareDefaultsRow";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { AI_SWITCH_DESCRIPTION } from "@/lib/aiConsent";
import type { UserProfile, UpdateProfileResult } from "@/lib/auth";
import type { ShareDefaults } from "@/lib/shareDefaults";
import type { PrivacyZone } from "@/lib/privacyZones";
import type { User } from "firebase/auth";

interface PrivacySectionProps {
  user: User | null;
  /** Subset of the profile fields read by this section. Required for
   *  the aiAnalysisEnabled switch, which shows on only for `true`. */
  profile: Pick<
    UserProfile,
    "aiAnalysisEnabled" | "hideSharedRouteEnds" | "shareDefaults"
  > | null;
  updateProfile: (
    data: Partial<UserProfile>,
    opts?: { allowProtected?: boolean }
  ) => Promise<UpdateProfileResult>;
  /** Saves the Sharing row's answers on the account (AuthProvider). */
  updateShareDefaults: (answers: ShareDefaults) => Promise<UpdateProfileResult>;
  privacyZones: PrivacyZone[];
  addZone: (zone: Omit<PrivacyZone, "id">) => Promise<void>;
  removeZone: (id: string) => Promise<void>;
  newZoneName: string;
  setNewZoneName: (v: string) => void;
  newZoneRadius: number;
  setNewZoneRadius: (v: number) => void;
  inline?: boolean;
}

export default function PrivacySection({
  user,
  profile,
  updateProfile,
  updateShareDefaults,
  privacyZones,
  addZone,
  removeZone,
  newZoneName,
  setNewZoneName,
  newZoneRadius,
  setNewZoneRadius,
  inline = false,
}: PrivacySectionProps) {
  const [pendingZoneRemoval, setPendingZoneRemoval] =
    useState<PrivacyZone | null>(null);
  const { removeBlocked } = useBlockedUsers();
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
        title="Social & privacy"
        subtitle="Visibility, auto-post, GPS zones"
      >
        {/* Who sees a finished session is this row and nothing else: the
            finish screen reads it (SessionShareRow). Do not add a second
            control for it. Three that wrote profile fields nothing read
            (two auto-post toggles and a "Default visibility" select) each
            saved a value, changed nothing, and contradicted this row. */}
        <ShareDefaultsRow
          uid={user?.uid ?? null}
          shareDefaults={profile?.shareDefaults}
          updateShareDefaults={updateShareDefaults}
        />

        {/* AI food analysis — permission before food goes to Google (App
            Review 5.1.2(i); the rule is in src/lib/aiConsent.ts). On only
            once the person has said yes: undefined means not asked yet,
            and the first scan or Pro typed meal asks (AiConsentSheet).
            Turning it on here IS that yes, which is why the line under it
            says what is sent and to whom. Off writes false: nothing more
            is sent, and the server refuses it as well. */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
          <div className="flex-1 mr-3">
            <p className="text-sm font-medium text-foreground">
              AI food analysis
            </p>
            <p className="text-xs text-muted-foreground">
              {AI_SWITCH_DESCRIPTION}
            </p>
          </div>
          <Toggle
            checked={profile?.aiAnalysisEnabled === true}
            label="Toggle AI food analysis"
            onChange={async () => {
              haptic("light");
              const next = profile?.aiAnalysisEnabled !== true;
              trackSettingsEvent("settings_toggle_changed", {
                toggle: "ai_analysis_enabled",
                value: next,
              });
              await updateProfile({ aiAnalysisEnabled: next });
            }}
          />
        </div>

        {/* Shared-route end clipping — default-on home-location protection,
            independent of (and composed with) explicit Privacy zones below. */}
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

        {/* Privacy zones */}
        <div className="p-4 rounded-lg bg-muted space-y-3">
          <div className="flex items-center gap-2">
            <MapPin className="size-4 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Privacy zones
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
                  {z.radiusMeters} m radius
                </p>
              </div>
              <IconButton
                aria-label={`Remove privacy zone ${z.name}`}
                variant="destructive-tinted"
                icon={<Trash2 />}
                onClick={() => {
                  haptic("light");
                  setPendingZoneRemoval(z);
                }}
              />
            </div>
          ))}

          <div className="flex gap-2">
            <input
              type="text"
              aria-label="Privacy zone name"
              value={newZoneName}
              onChange={(e) => setNewZoneName(e.target.value)}
              placeholder="Zone name (e.g. Home)"
              className="flex-1 min-h-11 px-3 rounded-lg bg-card border border-border text-sm"
            />
            <select
              value={newZoneRadius}
              onChange={(e) => setNewZoneRadius(Number(e.target.value))}
              className="min-h-11 px-3 rounded-lg bg-card border border-border text-sm"
            >
              <option value={200}>200 m</option>
              <option value={500}>500 m</option>
              <option value={750}>750 m</option>
              <option value={1000}>1 km</option>
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
            Add current location
          </Button>
        </div>

        {/* Blocked users (#25) */}
        <div className="p-4 rounded-lg bg-muted space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="size-4 text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Blocked users
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
                    toast.error("Couldn't load your blocked users. Try again.");
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
                        /* The shared blocked Set too, not just this list.
                           `useBlockedUsers` exists so every consumer sees
                           one set — Social's feed filter reads it — and a
                           Firestore write alone leaves that set stale, so
                           the unblocked account's posts stayed hidden
                           until a reload. The block direction already
                           pairs its write with `addBlocked`; this is the
                           same pairing on the way back. */
                        removeBlocked(bu.uid);
                        setBlockedUsersList((prev) =>
                          prev.filter((u) => u.uid !== bu.uid)
                        );
                        toast.success(`Unblocked ${bu.displayName}`);
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium bg-muted text-foreground hover:bg-destructive/10 hover:text-destructive-strong transition-colors"
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
        open={pendingZoneRemoval !== null}
        title="Remove privacy zone?"
        description={
          pendingZoneRemoval
            ? `${pendingZoneRemoval.name} will stop hiding route starts and ends near this location.`
            : undefined
        }
        confirmLabel="Remove zone"
        destructive
        onConfirm={async () => {
          const zone = pendingZoneRemoval;
          if (!zone) return;
          // Close before the await so a double-tap can't submit twice; a
          // failed write leaves the zone visible with retry feedback.
          setPendingZoneRemoval(null);
          try {
            await removeZone(zone.id);
            toast.success("Privacy zone removed");
          } catch {
            toast.error("Couldn't remove the privacy zone. Try again.");
          }
        }}
        onCancel={() => setPendingZoneRemoval(null)}
      />
    </>
  );
}
