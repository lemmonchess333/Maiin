import { useState } from "react";
import { haptic } from "@/lib/haptic";
import { track as trackSettingsEvent } from "@/lib/settingsAnalytics";
import {
  Users,
  Check,
  MapPin,
  Trash2,
  Plus,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
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
  updateProfile: (data: Partial<UserProfile>, opts?: { allowProtected?: boolean }) => Promise<UpdateProfileResult>;
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
  const [blockedUsersList, setBlockedUsersList] = useState<{ uid: string; displayName: string }[]>([]);
  const [blockedUsersLoading, setBlockedUsersLoading] = useState(false);
  const [blockedUsersLoaded, setBlockedUsersLoaded] = useState(false);

  return (
    <>
    <AccordionSection inline={inline} icon={<Users className="w-5 h-5 text-primary" />} title="Social & Privacy" subtitle="Crew, visibility, auto-post">
      {/* Crew switcher */}
      <div className="p-4 rounded-lg bg-muted space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-foreground">Your crew</p>
            <p className="text-xs text-muted-foreground">
              {currentCrew ? `${currentCrew.icon} ${currentCrew.name}` : 'Not in a crew'}
            </p>
          </div>
          <button
            onClick={() => setShowCrewPicker(!showCrewPicker)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground"
          >
            {currentCrew ? 'Switch' : 'Join'}
          </button>
        </div>
        {showCrewPicker && (
          <div className="space-y-2 pt-2 border-t border-border/50">
            {defaultCrews.map(crew => (
              <button
                key={crew.id}
                onClick={async () => { await joinCrew(crew.id); setShowCrewPicker(false); toast.success(`Joined ${crew.name}`); }}
                className={cn(
                  "w-full flex items-center gap-2 p-2.5 rounded-lg text-left text-xs transition-colors",
                  currentCrew?.id === crew.id ? "bg-primary/10 border border-primary/30" : "bg-background hover:bg-muted"
                )}
              >
                <span className="text-lg">{crew.icon}</span>
                <div className="flex-1">
                  <p className="font-medium">{crew.name}</p>
                  <p className="text-xs text-muted-foreground">{crew.description}</p>
                </div>
                {currentCrew?.id === crew.id && <Check className="w-3.5 h-3.5 text-primary" />}
              </button>
            ))}
            {currentCrew && (
              <button
                onClick={() => setShowLeaveCrewConfirm(true)}
                className="w-full text-center text-xs text-muted-foreground hover:text-red-400 py-1"
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
          <p className="text-xs text-muted-foreground">Who can see your posts</p>
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
          <p className="text-xs text-muted-foreground">Share runs to feed automatically</p>
        </div>
        <button
          onClick={async () => {
            haptic("light");
            const prev = autoPostRuns;
            const next = !autoPostRuns;
            setAutoPostRuns(next);
            trackSettingsEvent("settings_toggle_changed", { toggle: "auto_post_runs", value: next });
            const result = await updateProfile({ autoPostRuns: next });
            if (!result.ok) setAutoPostRuns(prev);
          }}
          className={cn("w-10 h-6 rounded-full transition-colors relative", autoPostRuns ? "bg-primary" : "bg-muted border border-border")}
        >
          <div className={cn("w-4 h-4 rounded-full bg-white absolute top-1 transition-transform shadow-sm", autoPostRuns ? "translate-x-5" : "translate-x-1")} />
        </button>
      </div>

      <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
        <div>
          <p className="text-sm text-foreground">Auto-post workouts</p>
          <p className="text-xs text-muted-foreground">Share workouts to feed automatically</p>
        </div>
        <button
          onClick={async () => {
            haptic("light");
            const prev = autoPostWorkouts;
            const next = !autoPostWorkouts;
            setAutoPostWorkouts(next);
            trackSettingsEvent("settings_toggle_changed", { toggle: "auto_post_workouts", value: next });
            const result = await updateProfile({ autoPostWorkouts: next });
            if (!result.ok) setAutoPostWorkouts(prev);
          }}
          className={cn("w-10 h-6 rounded-full transition-colors relative", autoPostWorkouts ? "bg-primary" : "bg-muted border border-border")}
        >
          <div className={cn("w-4 h-4 rounded-full bg-white absolute top-1 transition-transform shadow-sm", autoPostWorkouts ? "translate-x-5" : "translate-x-1")} />
        </button>
      </div>

      {/* Privacy Zones */}
      <div className="p-4 rounded-lg bg-muted space-y-3">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">Privacy Zones</p>
            <p className="text-xs text-muted-foreground">Hide route start/end near saved locations</p>
          </div>
        </div>

        {privacyZones.map((z) => (
          <div key={z.id} className="flex items-center justify-between p-2.5 rounded-lg bg-card">
            <div>
              <p className="text-xs font-medium text-foreground">{z.name}</p>
              <p className="text-xs text-muted-foreground">{z.radiusMeters}m radius</p>
            </div>
            <button
              onClick={() => removeZone(z.id)}
              className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        <div className="flex gap-2">
          <input
            type="text"
            value={newZoneName}
            onChange={(e) => setNewZoneName(e.target.value)}
            placeholder="Zone name (e.g. Home)"
            className="flex-1 px-3 py-2 rounded-lg bg-card border border-border text-sm"
          />
          <select
            value={newZoneRadius}
            onChange={(e) => setNewZoneRadius(Number(e.target.value))}
            className="px-2 py-2 rounded-lg bg-card border border-border text-sm"
          >
            <option value={200}>200m</option>
            <option value={500}>500m</option>
            <option value={750}>750m</option>
            <option value={1000}>1km</option>
          </select>
        </div>
        <button
          onClick={async () => {
            if (!newZoneName.trim()) { toast.error("Enter a zone name"); return; }
            try {
              const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
                navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 })
              );
              await addZone({ name: newZoneName.trim(), lat: pos.coords.latitude, lon: pos.coords.longitude, radiusMeters: newZoneRadius });
              setNewZoneName("");
              toast.success("Privacy zone added");
            } catch {
              toast.error("Could not get your location");
            }
          }}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary/10 text-primary text-sm font-medium"
        >
          <Plus className="w-3.5 h-3.5" /> Add Current Location
        </button>
      </div>

      {/* Blocked Users (#25) */}
      <div className="p-4 rounded-lg bg-muted space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">Blocked Users</p>
              <p className="text-xs text-muted-foreground">Manage users you&apos;ve blocked</p>
            </div>
          </div>
          {!blockedUsersLoaded && (
            <button
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
                  const users = await Promise.all(ids.map(async (uid) => {
                    const snap = await getDoc(doc(db, 'users', uid, 'public', 'profile'));
                    return {
                      uid,
                      displayName: snap.exists() ? (snap.data().displayName || 'User') : 'Deleted user',
                    };
                  }));
                  setBlockedUsersList(users);
                  setBlockedUsersLoaded(true);
                } catch {
                  toast.error('Failed to load blocked users');
                } finally {
                  setBlockedUsersLoading(false);
                }
              }}
              disabled={blockedUsersLoading}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-card text-foreground"
            >
              {blockedUsersLoading ? '...' : 'Show'}
            </button>
          )}
        </div>
        {blockedUsersLoaded && (
          blockedUsersList.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">You haven&apos;t blocked anyone</p>
          ) : (
            <div className="space-y-2">
              {blockedUsersList.map(bu => (
                <div key={bu.uid} className="flex items-center justify-between p-2.5 rounded-lg bg-card">
                  <span className="text-xs font-medium text-foreground">{bu.displayName}</span>
                  <button
                    onClick={async () => {
                      if (!user) return;
                      await unblockUser(user.uid, bu.uid);
                      setBlockedUsersList(prev => prev.filter(u => u.uid !== bu.uid));
                      toast.success(`Unblocked ${bu.displayName}`);
                    }}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium bg-muted text-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    Unblock
                  </button>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </AccordionSection>

    <ConfirmDialog
      open={showLeaveCrewConfirm}
      title="Leave crew?"
      description="You can rejoin this crew later."
      confirmLabel="Leave"
      destructive
      onConfirm={async () => { setShowLeaveCrewConfirm(false); await leaveCrew(); setShowCrewPicker(false); toast.success('Left crew'); }}
      onCancel={() => setShowLeaveCrewConfirm(false)}
    />
    </>
  );
}
