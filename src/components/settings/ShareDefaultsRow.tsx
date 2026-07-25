/**
 * Share prompts — the escape hatch from "Always do this".
 *
 * When a user ticks "Always do this for runs/workouts" in the share sheet,
 * `compose()` short-circuits from then on and the sheet never opens again.
 * Without a way back that is a ONE-WAY DOOR: a user who picked "never"
 * can't get the prompt back, and one who picked "public" can't stop
 * auto-posting. `clearShareDefault` has existed since the composer landed
 * (#1416) but nothing ever called it — this row is that call site.
 *
 * The preference lives in localStorage, not the profile, so it is read
 * once into state and updated locally on reset rather than subscribed to.
 * Nothing else mutates it while this screen is open.
 *
 * Renders nothing when neither type has a saved default — there is no
 * "off" state to explain, only a choice to undo.
 */
import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { haptic } from "@/lib/haptic";
import { toast } from "@/lib/toast";
import { track as trackSettingsEvent } from "@/lib/settingsAnalytics";
import {
  getShareDefault,
  clearShareDefault,
  type ShareType,
} from "@/lib/shareComposer";

const TYPES: { type: ShareType; noun: string }[] = [
  { type: "run", noun: "Runs" },
  { type: "workout", noun: "Workouts" },
];

/** What the saved preference actually does, in the user's terms. */
function describe(pref: NonNullable<ReturnType<typeof getShareDefault>>) {
  switch (pref) {
    case "never":
      return "Never shared";
    case "followers":
      return "Always shared with followers";
    case "public":
      return "Always shared publicly";
  }
}

export default function ShareDefaultsRow({ uid }: { uid: string | null }) {
  const [defaults, setDefaults] = useState(() =>
    TYPES.map(({ type, noun }) => ({
      type,
      noun,
      pref: uid ? getShareDefault(uid, type) : null,
    }))
  );

  const saved = defaults.filter((d) => d.pref !== null);
  if (!uid || saved.length === 0) return null;

  return (
    <div className="p-4 rounded-lg bg-muted space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="size-4 text-primary" />
        <div>
          <p className="text-sm font-medium text-foreground">Share prompts</p>
          <p className="text-xs text-muted-foreground">
            You chose &ldquo;Always do this&rdquo; after finishing a session
          </p>
        </div>
      </div>

      {saved.map(({ type, noun, pref }) => (
        <div
          key={type}
          className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-card"
        >
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">{noun}</p>
            <p className="text-xs text-muted-foreground">{describe(pref!)}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              haptic("light");
              clearShareDefault(uid, type);
              setDefaults((prev) =>
                prev.map((d) => (d.type === type ? { ...d, pref: null } : d))
              );
              trackSettingsEvent("settings_toggle_changed", {
                toggle: "share_default_cleared",
                value: type,
              });
              toast.success(`You'll be asked again after each ${type}`);
            }}
          >
            Ask again
          </Button>
        </div>
      ))}
    </div>
  );
}
