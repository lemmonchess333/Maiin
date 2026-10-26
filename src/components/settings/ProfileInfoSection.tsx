import { useEffect, useRef, useState, type FocusEvent } from "react";
import { User } from "lucide-react";
import AccordionSection from "@/components/AccordionSection";
import { haptic } from "@/lib/haptic";
import type { UserProfile, UpdateProfileResult } from "@/lib/auth";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { kgToLb, lbToKg } from "@/lib/weightUnits";
import { HEIGHT_CM } from "@/lib/bodyMetrics";
import { DISPLAY_NAME_MAX, validateDisplayName } from "@/lib/displayName";
import { loadWordFilter } from "@/lib/wordFilter";
import { flushQueuedWeights, queueWeightEntry } from "@/lib/weightQueue";
import { localDateString } from "@/lib/dateHelpers";
import { toast } from "@/lib/toast";

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
  /** Re-reads the profile once a weight saved here has been written. */
  refreshProfile?: () => Promise<void>;
  /** Set1.2 — skip the AccordionSection shell when rendered inside a
   *  SettingsSection nested page (which provides its own chrome). */
  inline?: boolean;
}

export default function ProfileInfoSection({
  profile,
  name,
  setName,
  updateProfile,
  refreshProfile,
  inline = false,
}: ProfileInfoSectionProps) {
  // A completed blur save belongs to the draft it submitted. Editing again
  // (or leaving this form) must prevent it from replacing a newer draft.
  const nameRevision = useRef(0);
  const heightRevision = useRef(0);
  const whyRevision = useRef(0);
  const pendingSaves = useRef({ name: 0, height: 0, why: 0 });
  async function saveField(
    field: "name" | "height" | "why",
    data: Partial<UserProfile>
  ) {
    pendingSaves.current[field]++;
    try {
      return await updateProfile(data);
    } finally {
      pendingSaves.current[field]--;
    }
  }
  useEffect(
    () => () => {
      nameRevision.current++;
      heightRevision.current++;
      whyRevision.current++;
    },
    []
  );
  const weightUnit = profile.preferredWeightUnit === "lbs" ? "lbs" : "kg";
  const heightUnit = profile.preferredHeightUnit === "ft" ? "ft" : "cm";
  /* The weight a change here last saved. The weigh-in queue writes the
     profile on the server, not the profile this screen was handed, so
     without it a second change compared against the old weight: putting a
     mistake back to it saved nothing. Dropped when the profile itself
     moves. */
  const [savedHereKg, setSavedHereKg] = useState<number | null>(null);
  const [seenProfileKg, setSeenProfileKg] = useState(profile.weightKg);
  if (profile.weightKg !== seenProfileKg) {
    setSeenProfileKg(profile.weightKg);
    setSavedHereKg(null);
  }
  const savedKg = savedHereKg ?? profile.weightKg ?? 70;
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
    // A weight changed here is today's weigh-in, as one from Home is: the
    // log, Home's tile and trend, and the macros all follow it. A bare
    // profile write left Home showing the last logged weight and the stored
    // macro targets on the old one.
    try {
      queueWeightEntry(profile.uid, localDateString(), kg);
      setSavedHereKg(kg);
      if (refreshProfile)
        void flushQueuedWeights(profile.uid).then(refreshProfile, () => {});
    } catch (err) {
      setWeight(shown);
      toast.error(
        err instanceof Error ? err.message : "Couldn't save your weight."
      );
    }
  }

  /** The bounds are profileSanitizer.js's heightCm range (bodyMetrics),
   *  so the client and the Cloud-Function write path agree on what's
   *  plausible. */
  async function commitHeight(cm: number, unchanged: boolean) {
    const submitted = ++heightRevision.current;
    const restore = () => {
      setHeightCmText(String(Number(savedCm.toFixed(1))));
      setFeet(String(feetInches(savedCm).feet));
      setInches(String(feetInches(savedCm).inches));
    };
    // The profile stays on the last acknowledged value while a save runs.
    // Returning to that value is another write, not an unchanged field.
    if (unchanged && pendingSaves.current.height === 0) return;
    const next = unchanged ? savedCm : cm;
    if (
      !Number.isFinite(next) ||
      next < HEIGHT_CM.min ||
      next > HEIGHT_CM.max
    ) {
      restore();
      return;
    }
    const result = await saveField("height", {
      heightCm: unchanged ? savedCm : Number(next.toFixed(1)),
    });
    if (!result.ok && heightRevision.current === submitted) restore();
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
  // Why the name typed last was not saved, until it is edited again.
  const [nameError, setNameError] = useState<string | null>(null);
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
          maxLength={DISPLAY_NAME_MAX}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? "profile-name-error" : undefined}
          onChange={(e) => {
            nameRevision.current++;
            setName(e.target.value);
            setNameError(null);
          }}
          onBlur={async () => {
            const submitted = ++nameRevision.current;
            const prev = profile.displayName ?? "";
            if (name === prev && pendingSaves.current.name === 0) return;
            /* The name is public, and this field writes the profile
               directly, so it is held to Onboarding's rules here,
               word filter included. A refused name is not saved; the
               field keeps it so it can be corrected. */
            const wordFilter = await loadWordFilter().catch(() => null);
            // Edited again while the filter loaded: the next blur saves
            // that draft, and this one would overwrite it.
            if (nameRevision.current !== submitted) return;
            if (!wordFilter) {
              setNameError("Couldn't check the name. Try again.");
              return;
            }
            const check = validateDisplayName(name, wordFilter);
            if (!check.valid) {
              setNameError(check.message);
              return;
            }
            setName(check.trimmed);
            const result = await saveField("name", {
              displayName: check.trimmed,
            });
            if (!result.ok && nameRevision.current === submitted) setName(prev);
          }}
          placeholder="Your name"
          className="ds-input mt-1 text-sm"
        />
        {nameError && (
          <p
            id="profile-name-error"
            role="alert"
            className="text-xs text-destructive-strong mt-1"
          >
            {nameError}
          </p>
        )}
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
            className="ds-input mt-1 text-sm font-mono tabular-nums"
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
                onChange={(e) => {
                  heightRevision.current++;
                  setFeet(e.target.value);
                }}
                className="ds-input min-w-0 text-sm font-mono tabular-nums"
              />
              <input
                type="number"
                inputMode="numeric"
                aria-label="Height, inches"
                value={inches}
                onChange={(e) => {
                  heightRevision.current++;
                  setInches(e.target.value);
                }}
                className="ds-input min-w-0 text-sm font-mono tabular-nums"
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
              onChange={(e) => {
                heightRevision.current++;
                setHeightCmText(e.target.value);
              }}
              onBlur={() =>
                void commitHeight(
                  parseNumber(heightCmText),
                  heightCmText.trim() === String(Number(savedCm.toFixed(1)))
                )
              }
              className="ds-input mt-1 text-sm font-mono tabular-nums"
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
          onChange={(e) => {
            whyRevision.current++;
            setWhy(e.target.value);
          }}
          onBlur={async () => {
            const submitted = ++whyRevision.current;
            const prev = profile.trainingWhy ?? "";
            const next = why.trim().slice(0, 120);
            if (next === prev && pendingSaves.current.why === 0) return;
            const result = await saveField("why", { trainingWhy: next });
            if (whyRevision.current !== submitted) return;
            if (!result.ok) setWhy(prev);
            else setWhy(next);
          }}
          placeholder="What's driving you?"
          className="ds-input mt-1 text-sm"
        />
        <p className="text-xs text-muted-foreground mt-1">
          We resurface this in your weekly review.
        </p>
      </div>
    </AccordionSection>
  );
}
