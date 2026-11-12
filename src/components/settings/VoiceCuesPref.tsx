import { useState } from "react";
import { Toggle } from "@/components/ui/Toggle";
import { haptic } from "@/lib/haptic";
import type { UserProfile, UpdateProfileResult } from "@/lib/auth";

/**
 * Voice cues for runs, on Run plan: whether a run starts with the spoken
 * announcements on. The run's own setup can still switch them for one run.
 *
 * It was the third control on Settings → Workouts, beside the two rest
 * timer controls, which are on Lift plan now (Trim1 call 7).
 */
export default function VoiceCuesPref({
  profile,
  updateProfile,
}: {
  profile: UserProfile;
  updateProfile: (data: Partial<UserProfile>) => Promise<UpdateProfileResult>;
}) {
  const [audioCues, setAudioCues] = useState(profile.audioCues ?? true);

  /* The control drops under its label once the label would be narrower
     than 8em, as the rest timer's rows do. */
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-card border border-border/40 px-[14px] py-3">
      <div className="min-w-[min(100%,8em)] flex-1">
        <p className="text-sm font-medium text-foreground">Audio cues</p>
        <p className="text-xs text-muted-foreground">
          Voice announcements during runs
        </p>
      </div>
      <Toggle
        className="ml-auto"
        checked={audioCues}
        label="Toggle audio cues"
        onChange={async () => {
          haptic("light");
          const prev = audioCues;
          const next = !audioCues;
          setAudioCues(next);
          const result = await updateProfile({ audioCues: next });
          if (!result.ok) setAudioCues(prev);
        }}
      />
    </div>
  );
}
