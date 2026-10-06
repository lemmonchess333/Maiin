import { useState } from "react";
import SectionHeading from "@/components/ui/SectionHeading";
import { Button } from "@/components/ui/Button";
import { haptic } from "@/lib/haptic";
import { useHeartRate } from "@/hooks/useHeartRate";
import { ZONE_NAMES } from "@/lib/hrZones";
import type { UserProfile } from "@/lib/auth";

/**
 * Heart-rate zones — Settings preview + max-HR capture.
 *
 * The web-visible half of the HR groundwork (live streaming is native/HealthKit
 * and lands later — see heartRateSource.ts + docs/heart-rate-healthkit.md).
 * Here the user can review their five zones and override the age-estimated max
 * with a measured one (`profile.maxHeartRate`). Writes through the guarded
 * `updateProfile` chain (allow-list + profileSanitizer fixed alongside).
 *
 * `null`/absent maxHeartRate → fall back to the Tanaka age estimate; with no
 * age either, we prompt for it rather than render bogus bands.
 *
 * The section says where the zones come from and nothing about live heart
 * rate: heartRateSource.ts has no source on any platform, so nothing
 * streams. Copy that names a live feature waits for the feature.
 */
export default function HeartRateZonesSection({
  updateProfile,
}: {
  updateProfile: (
    patch: Partial<UserProfile>,
    opts?: { throwOnError?: boolean; allowProtected?: boolean }
  ) => Promise<unknown>;
}) {
  const { maxHr, maxHrSource, zones } = useHeartRate();

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave(next: number | null) {
    setError(null);
    setSaving(true);
    try {
      await updateProfile({ maxHeartRate: next }, { throwOnError: true });
      haptic("success");
      setEditing(false);
      setValue("");
    } catch {
      setError("Couldn't save — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit() {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 100 || n > 240) {
      setError("Enter a max heart rate between 100 and 240 bpm.");
      return;
    }
    void handleSave(Math.round(n));
  }

  return (
    <div className="space-y-3">
      <SectionHeading size="compact">Heart-rate zones</SectionHeading>

      <div className="rounded-xl bg-card border border-border/40 p-3 space-y-3">
        {maxHr > 0 ? (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Max heart rate{" "}
                  <span className="font-mono tabular-nums">{maxHr}</span> bpm
                </p>
                <p className="text-xs text-muted-foreground">
                  {maxHrSource === "measured"
                    ? "Your measured max"
                    : "Estimated from your age — set your real max for sharper zones"}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  haptic("light");
                  setEditing((v) => !v);
                  setError(null);
                  setValue(maxHrSource === "measured" ? String(maxHr) : "");
                }}
              >
                {editing
                  ? "Cancel"
                  : maxHrSource === "measured"
                    ? "Edit"
                    : "Set"}
              </Button>
            </div>

            {/* Zone bands preview. The range drops under the zone's name,
                at the right, when the two no longer fit on one line (double
                text on a 320px phone), rather than stacking "93–", "112"
                and "bpm" a piece a line. */}
            <div className="space-y-1.5">
              {zones.map((z) => (
                <div
                  key={z.zone}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-lg bg-muted/50 px-3 py-1.5"
                >
                  <span className="text-xs font-semibold text-foreground">
                    Z{z.zone} · {ZONE_NAMES[z.zone]}
                  </span>
                  <span className="ml-auto whitespace-nowrap text-xs font-mono tabular-nums text-muted-foreground">
                    {z.minBpm}–{z.maxBpm} bpm
                  </span>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              Zones come from your age, or from the max heart rate you enter.
            </p>
          </>
        ) : (
          <div>
            <p className="text-sm font-semibold text-foreground">
              Add your age to see zones
            </p>
            <p className="text-xs text-muted-foreground">
              Set your age in your profile, or enter your max heart rate
              directly below.
            </p>
            {!editing && (
              <Button
                variant="primary"
                size="sm"
                className="mt-2"
                onClick={() => {
                  haptic("light");
                  setEditing(true);
                }}
              >
                Set max HR
              </Button>
            )}
          </div>
        )}

        {editing && (
          <div className="space-y-2 pt-1">
            <label htmlFor="max-hr" className="text-xs text-muted-foreground">
              Max heart rate (bpm)
            </label>
            <input
              id="max-hr"
              type="text"
              inputMode="numeric"
              placeholder="188"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full rounded-lg bg-muted border border-border/40 px-3 py-2 text-sm font-mono tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            />
            {error && (
              <p className="text-xs text-destructive-strong">{error}</p>
            )}
            <div className="flex gap-2">
              <Button
                variant="primary"
                fullWidth
                loading={saving}
                onClick={handleSubmit}
              >
                Save max HR
              </Button>
              {maxHrSource === "measured" && (
                <Button
                  variant="ghost"
                  loading={saving}
                  onClick={() => void handleSave(null)}
                >
                  Use estimate
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
