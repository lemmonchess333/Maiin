import { useState, type FocusEvent } from "react";
import { User } from "lucide-react";
import AccordionSection from "@/components/AccordionSection";
import { haptic } from "@/lib/haptic";
import type { UserProfile, UpdateProfileResult } from "@/lib/auth";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { kgToLb, lbToKg } from "@/lib/weightUnits";

type Gender = "male" | "female" | "unspecified";
type AgeRange = "16-24" | "25-34" | "35-44" | "45-54" | "55+";

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "unspecified", label: "Prefer not to say" },
];

// "under-16" intentionally omitted — it's the signup age gate, not a
// legitimate edit target for an existing user.
/* Body metrics are STORED in kg and cm and shown in the unit chosen under
   Units & appearance. These fields showed kg and cm whatever was chosen. */
const CM_PER_INCH = 2.54;

/** Accepts a comma decimal as well as a point. */
function parseNumber(text: string): number {
  const t = text.trim().replace(",", ".");
  return /^\d+(?:\.\d+)?$/.test(t) ? Number(t) : NaN;
}

/** A stored weight as the field shows it: one decimal at most. */
function weightText(kg: number, unit: "kg" | "lbs"): string {
  return String(Number((unit === "lbs" ? kgToLb(kg) : kg).toFixed(1)));
}

function feetInches(cm: number): { feet: number; inches: number } {
  const total = Math.round(cm / CM_PER_INCH);
  return { feet: Math.floor(total / 12), inches: total % 12 };
}

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
  updateProfile: (data: Partial<UserProfile>) => Promise<UpdateProfileResult>;
  /** Set1.2 — skip the AccordionSection shell when rendered inside a
   *  SettingsSection nested page (which provides its own chrome). */
  inline?: boolean;
}

export default function ProfileInfoSection({
  profile,
  name,
  setName,
  updateProfile,
  inline = false,
}: ProfileInfoSectionProps) {
  const weightUnit = profile.preferredWeightUnit === "lbs" ? "lbs" : "kg";
  const heightUnit = profile.preferredHeightUnit === "ft" ? "ft" : "cm";
  const savedKg = profile.weightKg ?? 70;
  const savedCm = profile.heightCm ?? 170;

  // What each field shows, in the chosen unit. Compared as text on blur, so
  // leaving a field untouched never writes back a rounded conversion.
  const [weight, setWeight] = useState(() => weightText(savedKg, weightUnit));
  const [heightCmText, setHeightCmText] = useState(() =>
    String(Number(savedCm.toFixed(1)))
  );
  const [feet, setFeet] = useState(() => String(feetInches(savedCm).feet));
  const [inches, setInches] = useState(() =>
    String(feetInches(savedCm).inches)
  );

  async function commitWeight() {
    const shown = weightText(savedKg, weightUnit);
    if (weight.trim() === shown) return;
    const value = parseNumber(weight);
    const kg = weightUnit === "lbs" ? lbToKg(value) : value;
    // A cleared field blurs as Number("") = 0, and 0 splits the
    // pipeline downstream: calculateTDEE stores a 0g protein target while
    // getAdjustedTargets silently rebases to 70kg — two consumers
    // disagreeing about the same field. Reject out-of-range instead of
    // writing it; same 20-350 kg gate as the Home weigh-in sheet.
    if (!Number.isFinite(kg) || kg < 20 || kg > 350) {
      setWeight(shown);
      return;
    }
    const result = await updateProfile({ weightKg: kg });
    if (!result.ok) setWeight(shown);
  }

  /** The bounds match profileSanitizer.js's heightCm range, so the client
   *  and the Cloud-Function write path agree on what's plausible. */
  async function commitHeight(cm: number, unchanged: boolean) {
    const restore = () => {
      setHeightCmText(String(Number(savedCm.toFixed(1))));
      setFeet(String(feetInches(savedCm).feet));
      setInches(String(feetInches(savedCm).inches));
    };
    if (unchanged) return;
    if (!Number.isFinite(cm) || cm < 120 || cm > 230) {
      restore();
      return;
    }
    const result = await updateProfile({ heightCm: Number(cm.toFixed(1)) });
    if (!result.ok) restore();
  }

  function commitFeetInches(e: FocusEvent<HTMLDivElement>) {
    // Moving between the two boxes is still editing one height.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    const saved = feetInches(savedCm);
    const ft = parseNumber(feet);
    const inch = inches.trim() === "" ? 0 : parseNumber(inches);
    const whole = Number.isInteger(ft) && inch >= 0 && inch < 12;
    void commitHeight(
      whole ? (ft * 12 + inch) * CM_PER_INCH : NaN,
      feet.trim() === String(saved.feet) &&
        inches.trim() === String(saved.inches)
    );
  }

  // D16 — the personal "why". Local draft persisted on blur (same pattern
  // as displayName); clearing it writes an empty string (treated as "no
  // why" everywhere it resurfaces).
  const [why, setWhy] = useState(profile.trainingWhy ?? "");
  return (
    <AccordionSection
      inline={inline}
      icon={<User className="size-5 text-primary" />}
      title="Profile"
      subtitle="Name, weight, height"
      defaultOpen
    >
      <div>
        <label htmlFor="profile-name" className="text-xs text-muted-foreground">
          Name
        </label>
        <input
          id="profile-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={async () => {
            const prev = profile.displayName ?? "";
            if (name === prev) return;
            const result = await updateProfile({ displayName: name });
            if (!result.ok) setName(prev);
          }}
          placeholder="Your name"
          className="w-full mt-1 min-h-11 px-4 rounded-lg bg-muted border border-border/50 text-foreground text-sm placeholder:text-muted-foreground"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="profile-weight"
            className="text-xs text-muted-foreground"
          >
            Weight ({weightUnit === "lbs" ? "lb" : "kg"})
          </label>
          <input
            id="profile-weight"
            type="number"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            onBlur={() => void commitWeight()}
            className="w-full mt-1 min-h-11 px-4 rounded-lg bg-muted border border-border/50 text-foreground text-sm font-mono tabular-nums"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Sets your calorie target. Log your weight on Home to keep it
            current.
          </p>
        </div>
        {heightUnit === "ft" ? (
          <div>
            <label
              htmlFor="profile-height"
              className="text-xs text-muted-foreground"
            >
              Height (ft, in)
            </label>
            <div className="mt-1 flex gap-2" onBlur={commitFeetInches}>
              <input
                id="profile-height"
                type="number"
                inputMode="numeric"
                aria-label="Height, feet"
                value={feet}
                onChange={(e) => setFeet(e.target.value)}
                className="w-full min-w-0 min-h-11 px-3 rounded-lg bg-muted border border-border/50 text-foreground text-sm font-mono tabular-nums"
              />
              <input
                type="number"
                inputMode="numeric"
                aria-label="Height, inches"
                value={inches}
                onChange={(e) => setInches(e.target.value)}
                className="w-full min-w-0 min-h-11 px-3 rounded-lg bg-muted border border-border/50 text-foreground text-sm font-mono tabular-nums"
              />
            </div>
          </div>
        ) : (
          <div>
            <label
              htmlFor="profile-height"
              className="text-xs text-muted-foreground"
            >
              Height (cm)
            </label>
            <input
              id="profile-height"
              type="number"
              inputMode="decimal"
              value={heightCmText}
              onChange={(e) => setHeightCmText(e.target.value)}
              onBlur={() =>
                void commitHeight(
                  parseNumber(heightCmText),
                  heightCmText.trim() === String(Number(savedCm.toFixed(1)))
                )
              }
              className="w-full mt-1 min-h-11 px-4 rounded-lg bg-muted border border-border/50 text-foreground text-sm font-mono tabular-nums"
            />
          </div>
        )}
      </div>

      <div>
        <span className="text-xs text-muted-foreground">Gender</span>
        <SegmentedControl
          ariaLabel="Gender"
          layout="wrap"
          className="mt-1.5"
          value={profile.gender}
          onChange={(value) => {
            haptic("light");
            void updateProfile({ gender: value });
          }}
          options={GENDER_OPTIONS}
        />
      </div>

      <div>
        <span className="text-xs text-muted-foreground">Age range</span>
        <SegmentedControl
          ariaLabel="Age range"
          layout="wrap"
          className="mt-1.5"
          value={profile.ageRange}
          onChange={(value) => {
            haptic("light");
            void updateProfile({ ageRange: value });
          }}
          options={AGE_RANGE_OPTIONS}
        />
      </div>

      <div>
        <label htmlFor="profile-why" className="text-xs text-muted-foreground">
          Why you train
        </label>
        <input
          id="profile-why"
          type="text"
          value={why}
          maxLength={120}
          onChange={(e) => setWhy(e.target.value)}
          onBlur={async () => {
            const prev = profile.trainingWhy ?? "";
            const next = why.trim().slice(0, 120);
            if (next === prev) return;
            const result = await updateProfile({ trainingWhy: next });
            if (!result.ok) setWhy(prev);
            else setWhy(next);
          }}
          placeholder="What's driving you?"
          className="w-full mt-1 min-h-11 px-4 rounded-lg bg-muted border border-border/50 text-foreground text-sm placeholder:text-muted-foreground"
        />
        <p className="text-xs text-muted-foreground mt-1">
          We resurface this in your weekly review.
        </p>
      </div>
    </AccordionSection>
  );
}
