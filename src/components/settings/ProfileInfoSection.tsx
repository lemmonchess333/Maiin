import { User } from "lucide-react";
import AccordionSection from "@/components/AccordionSection";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import type { UserProfile, UpdateProfileResult } from "@/lib/auth";

type Gender = "male" | "female" | "unspecified";
type AgeRange = "16-24" | "25-34" | "35-44" | "45-54" | "55+";

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "unspecified", label: "Prefer not to say" },
];

// "under-16" intentionally omitted — it's the signup age gate, not a
// legitimate edit target for an existing user.
const AGE_RANGE_OPTIONS: { value: AgeRange; label: string }[] = [
  { value: "16-24", label: "16 – 24" },
  { value: "25-34", label: "25 – 34" },
  { value: "35-44", label: "35 – 44" },
  { value: "45-54", label: "45 – 54" },
  { value: "55+", label: "55+" },
];

interface ProfileInfoSectionProps {
  profile: UserProfile;
  name: string;
  setName: (v: string) => void;
  weightKg: number;
  setWeightKg: (v: number) => void;
  heightCm: number;
  setHeightCm: (v: number) => void;
  updateProfile: (data: Partial<UserProfile>) => Promise<UpdateProfileResult>;
  /** Set1.2 — skip the AccordionSection shell when rendered inside a
   *  SettingsSection nested page (which provides its own chrome). */
  inline?: boolean;
}

export default function ProfileInfoSection({
  profile,
  name,
  setName,
  weightKg,
  setWeightKg,
  heightCm,
  setHeightCm,
  updateProfile,
  inline = false,
}: ProfileInfoSectionProps) {
  return (
    <AccordionSection
      inline={inline}
      icon={<User className="size-5 text-primary" />}
      title="Profile"
      subtitle="Name, weight, height"
      defaultOpen
    >
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={async () => {
          const prev = profile.displayName ?? "";
          if (name === prev) return;
          const result = await updateProfile({ displayName: name });
          if (!result.ok) setName(prev);
        }}
        placeholder="Display name"
        className="w-full px-4 py-2.5 rounded-lg bg-muted border border-border/50 text-foreground text-sm placeholder:text-muted-foreground"
      />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="profile-weight"
            className="text-sm text-muted-foreground"
          >
            Weight (kg)
          </label>
          <input
            id="profile-weight"
            type="number"
            value={weightKg}
            onChange={(e) => setWeightKg(Number(e.target.value))}
            onBlur={async () => {
              const prev = profile.weightKg ?? 70;
              if (weightKg === prev) return;
              const result = await updateProfile({ weightKg });
              if (!result.ok) setWeightKg(prev);
            }}
            className="w-full mt-1 px-4 py-2.5 rounded-lg bg-muted border border-border/50 text-foreground text-sm"
          />
          <p className="text-xs text-muted-foreground/60 mt-1">
            For TDEE calc. Log daily weight from Home.
          </p>
        </div>
        <div>
          <label
            htmlFor="profile-height"
            className="text-sm text-muted-foreground"
          >
            Height (cm)
          </label>
          <input
            id="profile-height"
            type="number"
            value={heightCm}
            onChange={(e) => setHeightCm(Number(e.target.value))}
            onBlur={async () => {
              const prev = profile.heightCm ?? 170;
              if (heightCm === prev) return;
              const result = await updateProfile({ heightCm });
              if (!result.ok) setHeightCm(prev);
            }}
            className="w-full mt-1 px-4 py-2.5 rounded-lg bg-muted border border-border/50 text-foreground text-sm"
          />
        </div>
      </div>

      <div>
        <span className="text-sm text-muted-foreground">Gender</span>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          {GENDER_OPTIONS.map((opt) => {
            const selected = profile.gender === opt.value;
            return (
              <button
                key={opt.value}
                onClick={async () => {
                  haptic("light");
                  await updateProfile({ gender: opt.value });
                }}
                className={cn(
                  "min-h-14 flex items-center justify-center p-3 rounded-xl border text-center transition-all active:scale-[0.97]",
                  selected
                    ? "border-primary bg-primary/10"
                    : "border-border/50 bg-muted/30 hover:border-border"
                )}
              >
                <p
                  className={cn(
                    "text-xs font-medium leading-tight",
                    selected ? "text-primary" : "text-foreground"
                  )}
                >
                  {opt.label}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <span className="text-sm text-muted-foreground">Age range</span>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          {AGE_RANGE_OPTIONS.map((opt) => {
            const selected = profile.ageRange === opt.value;
            return (
              <button
                key={opt.value}
                onClick={async () => {
                  haptic("light");
                  await updateProfile({ ageRange: opt.value });
                }}
                className={cn(
                  "min-h-14 flex items-center justify-center p-3 rounded-xl border text-center transition-all active:scale-[0.97]",
                  selected
                    ? "border-primary bg-primary/10"
                    : "border-border/50 bg-muted/30 hover:border-border"
                )}
              >
                <p
                  className={cn(
                    "text-xs font-medium leading-tight",
                    selected ? "text-primary" : "text-foreground"
                  )}
                >
                  {opt.label}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </AccordionSection>
  );
}
