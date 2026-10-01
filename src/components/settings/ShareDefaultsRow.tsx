/**
 * Share defaults — who sees a session, decided once.
 *
 * The finish screen reads this preference (SessionShareRow): a saved
 * audience posts the session automatically, "Never" posts nothing, and no
 * preference ("Ask") shows the one question that sets it. Until
 * 2026-08-04 the share sheet was its ONLY writer and this row its
 * only reader, which made the setting reachable in one direction: you could
 * arrive at a default by finishing a session and ticking a box, and Settings
 * could only take it back. A user who wanted "never share my workouts" had
 * to finish a workout to say so.
 *
 * That asymmetry is why the row also used to render NOTHING until a default
 * existed — there was no state to show and no control to offer. It is now a
 * four-way picker per type (Ask / Followers / Public / Never) that is always
 * present, so the setting can be found by looking for it. "Ask" is the
 * absence of a saved answer, not a fourth value — picking it saves `null`,
 * which the finish screen on every device reads as "ask".
 *
 * The answers are saved on the account (`profile.shareDefaults`), so what
 * this row shows is what every device does. The row renders the profile's
 * value and holds no copy of its own: `updateShareDefaults` changes the
 * profile the moment it is called, so a pick shows at once, and moves back
 * if the save is refused.
 */
import { MessageSquare } from "lucide-react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { haptic } from "@/lib/haptic";
import { toast } from "@/lib/toast";
import { track as trackSettingsEvent } from "@/lib/settingsAnalytics";
import type { UpdateProfileResult } from "@/lib/auth";
import { savedShareDefault, type ShareDefaults } from "@/lib/shareDefaults";
import type { ShareType } from "@/lib/shareComposer";

/** "ask" is the UI name for having no saved answer. */
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
  ask: "You'll be asked when you next finish one",
  followers: "Shared with your followers automatically",
  public: "Shared publicly automatically",
  never: "Never shared",
};

function confirmCopy(noun: string, choice: Choice): string {
  switch (choice) {
    case "ask":
      return `You'll be asked when you next finish one`;
    case "followers":
      return `${noun} now share with your followers`;
    case "public":
      return `${noun} now share publicly`;
    case "never":
      return `${noun} are no longer shared`;
  }
}

export default function ShareDefaultsRow({
  uid,
  shareDefaults,
  updateShareDefaults,
}: {
  uid: string | null;
  /** The account's answers (`profile.shareDefaults`). */
  shareDefaults: ShareDefaults | null | undefined;
  updateShareDefaults: (answers: ShareDefaults) => Promise<UpdateProfileResult>;
}) {
  if (!uid) return null;

  const change = (type: ShareType, noun: string, next: Choice) => {
    haptic("light");
    // "ask" is the absence of an answer, so it saves null rather than a
    // fourth value — the finish screen asks whenever there is none.
    void updateShareDefaults({ [type]: next === "ask" ? null : next });
    trackSettingsEvent("settings_toggle_changed", {
      toggle: next === "ask" ? "share_default_cleared" : "share_default_set",
      value: next === "ask" ? type : `${type}:${next}`,
    });
    toast.success(confirmCopy(noun, next));
  };

  return (
    <div className="p-4 rounded-2xl bg-card space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="size-4 text-primary" />
        <div>
          <p className="text-sm font-medium text-foreground">Sharing</p>
          <p className="text-xs text-muted-foreground">
            Who sees a session when you finish it
          </p>
        </div>
      </div>

      {TYPES.map(({ type, noun }) => {
        const choice: Choice = savedShareDefault(shareDefaults, type) ?? "ask";
        return (
          <div key={type} className="space-y-2">
            <div>
              <p className="text-xs font-medium text-foreground">{noun}</p>
              <p className="text-xs text-muted-foreground">
                {DESCRIBE[choice]}
              </p>
            </div>
            <SegmentedControl
              options={OPTIONS}
              value={choice}
              onChange={(next) => change(type, noun, next)}
              ariaLabel={`Default sharing for ${noun.toLowerCase()}`}
              // One row of four. They wrapped ("Never" alone on a second
              // line) while each type sat in a box of its own inside this
              // card; without the inner box the row is 24px wider and the
              // four fit at 375px.
            />
          </div>
        );
      })}
    </div>
  );
}
