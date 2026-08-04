/**
 * Share defaults — who sees a session, decided once.
 *
 * `compose()` short-circuits the post-session sheet as soon as a default
 * exists, so this preference is the thing that actually governs whether the
 * app asks. Until 2026-08-04 the sheet was its ONLY writer and this row its
 * only reader, which made the setting reachable in one direction: you could
 * arrive at a default by finishing a session and ticking a box, and Settings
 * could only take it back. A user who wanted "never share my workouts" had
 * to finish a workout to say so.
 *
 * That asymmetry is why the row also used to render NOTHING until a default
 * existed — there was no state to show and no control to offer. It is now a
 * four-way picker per type (Ask / Followers / Public / Never) that is always
 * present, so the setting can be found by looking for it. "Ask" is the
 * absence of a stored default, not a fourth stored value — picking it calls
 * `clearShareDefault`, which is exactly what the old "Ask again" button did.
 *
 * The preference lives in localStorage, not the profile, so it is read once
 * into state and updated locally. Nothing else mutates it while this screen
 * is open.
 */
import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { haptic } from "@/lib/haptic";
import { toast } from "@/lib/toast";
import { track as trackSettingsEvent } from "@/lib/settingsAnalytics";
import {
  getShareDefault,
  setShareDefault,
  clearShareDefault,
  type ShareType,
} from "@/lib/shareComposer";

/** "ask" is the UI name for having no stored default. */
type Choice = "ask" | "followers" | "public" | "never";

const TYPES: { type: ShareType; noun: string }[] = [
  { type: "run", noun: "Runs" },
  { type: "workout", noun: "Workouts" },
];

const OPTIONS: { value: Choice; label: string }[] = [
  { value: "ask", label: "Ask" },
  { value: "followers", label: "Followers" },
  { value: "public", label: "Public" },
  { value: "never", label: "Never" },
];

/** What the current choice actually does. "Public" on its own is ambiguous
 *  (public what, when?) — the segment names the option, this names the
 *  behaviour. */
const DESCRIBE: Record<Choice, string> = {
  ask: "You'll be asked after each one",
  followers: "Shared with your followers automatically",
  public: "Shared publicly automatically",
  never: "Never shared",
};

function confirmCopy(noun: string, choice: Choice): string {
  switch (choice) {
    case "ask":
      return `You'll be asked after each one`;
    case "followers":
      return `${noun} now share with your followers`;
    case "public":
      return `${noun} now share publicly`;
    case "never":
      return `${noun} are no longer shared`;
  }
}

export default function ShareDefaultsRow({ uid }: { uid: string | null }) {
  const [choices, setChoices] = useState<Record<ShareType, Choice>>(() => ({
    run: uid ? ((getShareDefault(uid, "run") ?? "ask") as Choice) : "ask",
    workout: uid
      ? ((getShareDefault(uid, "workout") ?? "ask") as Choice)
      : "ask",
  }));

  if (!uid) return null;

  const change = (type: ShareType, noun: string, next: Choice) => {
    haptic("light");
    // "ask" is the absence of a default, so it CLEARS rather than storing a
    // fourth value — `compose()` only short-circuits on a stored preference.
    if (next === "ask") clearShareDefault(uid, type);
    else setShareDefault(uid, type, next);
    setChoices((prev) => ({ ...prev, [type]: next }));
    trackSettingsEvent("settings_toggle_changed", {
      toggle: next === "ask" ? "share_default_cleared" : "share_default_set",
      value: next === "ask" ? type : `${type}:${next}`,
    });
    toast.success(confirmCopy(noun, next));
  };

  return (
    <div className="p-4 rounded-lg bg-muted space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="size-4 text-primary" />
        <div>
          <p className="text-sm font-medium text-foreground">Sharing</p>
          <p className="text-xs text-muted-foreground">
            Who sees a session when you finish it
          </p>
        </div>
      </div>

      {TYPES.map(({ type, noun }) => (
        <div key={type} className="p-3 rounded-lg bg-card space-y-2">
          <div>
            <p className="text-xs font-medium text-foreground">{noun}</p>
            <p className="text-xs text-muted-foreground">
              {DESCRIBE[choices[type]]}
            </p>
          </div>
          <SegmentedControl
            options={OPTIONS}
            value={choices[type]}
            onChange={(next) => change(type, noun, next)}
            ariaLabel={`Default sharing for ${noun.toLowerCase()}`}
            // Four segments don't fit one 375px row without truncating
            // "Followers"; wrap degrades to two rows instead of clipping.
            layout="wrap"
          />
        </div>
      ))}
    </div>
  );
}
