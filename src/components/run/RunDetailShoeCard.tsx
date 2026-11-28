import { useState } from "react";
import { Footprints } from "lucide-react";
import { Card } from "@/components/ui/Card";
import SectionLabel from "@/components/ui/SectionLabel";
import Select from "@/components/ui/Select";
import { useShoes } from "@/hooks/useShoes";
import { storedKmLabel } from "@/lib/runLabels";
import type { DistanceUnit } from "@/lib/distanceUnits";
import { assignRunShoe } from "@/lib/runShoe";
import { toast } from "@/lib/toast";
import { logger } from "@/lib/logger";
import { haptic } from "@/lib/haptic";

interface RunDetailShoeCardProps {
  uid: string;
  runId: string;
  /** The shoeId stored on the run document, or null when unassigned. */
  storedShoeId: string | null;
  /** Run distance in metres. */
  distanceMeters: number;
  /** Whether this run counts toward shoe mileage volume. */
  volumeEligible: boolean;
  unit: DistanceUnit;
}

/**
 * Displays and edits the running shoe attributed to a saved run.
 * Hidden when the runner has not added any shoes so non-trackers see zero noise.
 */
export default function RunDetailShoeCard({
  uid,
  runId,
  storedShoeId,
  distanceMeters,
  volumeEligible,
  unit,
}: RunDetailShoeCardProps) {
  const { shoes, activeShoes, loading } = useShoes();
  const [override, setOverride] = useState<{
    runId: string;
    shoeId: string | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  if (loading || shoes.length === 0) return null;

  const currentShoeId =
    override && override.runId === runId ? override.shoeId : storedShoeId;

  const assignedRetired = currentShoeId
    ? shoes.find((s) => s.id === currentShoeId && s.retired)
    : undefined;

  // Nothing selectable and nothing assigned (all shoes retired, run unassigned).
  if (activeShoes.length === 0 && !assignedRetired) return null;

  const handleChange = async (nextValue: string) => {
    const nextShoeId = nextValue || null;
    if (nextShoeId === currentShoeId || saving) return;

    const previousShoeId = currentShoeId;
    setOverride({ runId, shoeId: nextShoeId });
    setSaving(true);
    haptic("light");

    try {
      const alert = await assignRunShoe(uid, runId, {
        previousShoeId,
        nextShoeId,
        distanceMeters,
        volumeEligible,
        shoes,
      });
      const picked = nextShoeId
        ? shoes.find((s) => s.id === nextShoeId)
        : undefined;
      if (alert === "replace" && picked) {
        toast.success(`${picked.name} reached its mileage limit`);
      } else if (alert === "warning" && picked) {
        toast.success(`${picked.name} is past 85% of its mileage limit`);
      } else {
        toast.success(nextShoeId ? "Shoe updated" : "Shoe removed");
      }
    } catch (err) {
      setOverride({ runId, shoeId: previousShoeId });
      logger.error("assignRunShoe failed:", err);
      toast.error("Couldn’t update shoe. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="space-y-2">
      <SectionLabel>Shoe</SectionLabel>
      <Select
        aria-label="Shoe"
        value={currentShoeId ?? ""}
        disabled={saving}
        onChange={(e) => void handleChange(e.target.value)}
        icon={<Footprints className="size-4" />}
      >
        <option value="">No shoe assigned</option>
        {activeShoes.map((shoe) => (
          <option key={shoe.id} value={shoe.id}>
            {shoe.name} · {storedKmLabel(shoe.totalKm, unit)}
          </option>
        ))}
        {assignedRetired && (
          <option value={assignedRetired.id}>
            {assignedRetired.name} (retired)
          </option>
        )}
      </Select>
    </Card>
  );
}
