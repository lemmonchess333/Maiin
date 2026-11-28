import { useId, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import SectionHeading from "@/components/ui/SectionHeading";
import { Button } from "@/components/ui/Button";
import { RangeInput } from "@/components/ui/RangeInput";
import { nearDistanceLabel } from "@/lib/runLabels";
import {
  SEGMENT_NAME_MAX,
  makeSegment,
  metresAlong,
  segmentNameRefusal,
  segmentRejection,
  stretchOf,
  type PointRange,
} from "@/lib/segments";
import {
  isRestrictedRefusal,
  showRestrictedToast,
} from "@/lib/accountRestriction";
import type { DistanceUnit } from "@/lib/distanceUnits";
import { useAuth } from "@/lib/auth";
import { useEmailVerificationGate } from "@/hooks/useEmailVerificationGate";
import { useRestrictedStatus } from "@/hooks/useRestrictedStatus";
import RestrictedNotice from "@/components/social/RestrictedNotice";
import VerifyEmailNotice from "@/components/social/VerifyEmailNotice";
import type { GPSPoint } from "@/lib/gps";

/**
 * Where the maker is: choosing the stretch and its name, waiting on the
 * server, or showing why the server refused. Closed is its parent's: the
 * maker is not drawn then.
 */
export type MakerState =
  | { step: "picking" }
  | { step: "saving" }
  | { step: "refused"; message: string };

/**
 * Making a segment from a stretch of this run (Run26 call 3), under the
 * run's map. The stretch is the parent's (`range`), so a tap on the map
 * and the two sliders move the same ends, and the map draws it. The rule
 * for a stretch (at least 400 m, no gap) and the name's are checked here
 * before the request goes; the server checks them again, with the privacy
 * zones and the word filter, and its refusal is shown in its own words.
 *
 * A segment's name and line are public, so making one needs a verified
 * email and an unrestricted account, as a post does: the maker says which
 * is missing where Save is, before the server refuses.
 */
export default function SegmentMaker({
  runId,
  points,
  range,
  onRangeChange,
  unit,
  onCancel,
  onMade,
}: {
  runId: string;
  points: readonly GPSPoint[];
  range: PointRange;
  onRangeChange: (range: PointRange) => void;
  unit: DistanceUnit;
  onCancel: () => void;
  onMade: (segmentId: string) => void;
}) {
  const headingId = useId();
  const nameId = useId();
  const { user } = useAuth();
  const gate = useEmailVerificationGate(user);
  const { isRestricted } = useRestrictedStatus(user?.uid);
  const held = gate.needsVerification || isRestricted;
  const startId = useId();
  const endId = useId();
  const [name, setName] = useState("");
  const [state, setState] = useState<MakerState>({ step: "picking" });
  const along = useMemo(() => metresAlong(points), [points]);
  const last = Math.max(1, points.length - 1);
  const stretch = stretchOf(points, range.from, range.to);
  const nameRefusal = segmentNameRefusal(name);
  const saving = state.step === "saving";

  const move = (next: PointRange) => {
    if (state.step === "refused") setState({ step: "picking" });
    onRangeChange(next);
  };
  const at = (index: number) => nearDistanceLabel(along[index] ?? 0, unit);

  const save = async () => {
    if (!stretch.ok) {
      setState({ step: "refused", message: stretch.refusal });
      return;
    }
    if (nameRefusal) {
      setState({ step: "refused", message: nameRefusal });
      return;
    }
    setState({ step: "saving" });
    try {
      const segmentId = await makeSegment({
        runId,
        startIndex: range.from,
        endIndex: range.to,
        name,
      });
      onMade(segmentId);
    } catch (err) {
      if (isRestrictedRefusal(err)) showRestrictedToast();
      setState({
        step: "refused",
        message:
          segmentRejection(err) ?? "Couldn’t save the segment. Try again.",
      });
    }
  };

  return (
    <Card
      as="section"
      tone="flat"
      aria-labelledby={headingId}
      className="space-y-4"
    >
      <div className="space-y-1">
        <SectionHeading id={headingId} size="compact">
          Make a segment
        </SectionHeading>
        <p className="text-sm text-muted-foreground text-pretty">
          Tap the map to move the nearer end, or use the sliders. Every run you
          save along it is timed.
        </p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <label htmlFor={startId} className="font-semibold text-foreground">
              Start
            </label>
            <span className="font-mono tabular-nums text-muted-foreground">
              {at(range.from)} in
            </span>
          </div>
          <RangeInput
            id={startId}
            min={0}
            max={last}
            step={1}
            value={range.from}
            disabled={saving}
            aria-valuetext={`${at(range.from)} into the run`}
            onChange={(e) =>
              move({
                ...range,
                from: Math.min(Number(e.target.value), range.to - 1),
              })
            }
          />
        </div>
        <div className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <label htmlFor={endId} className="font-semibold text-foreground">
              End
            </label>
            <span className="font-mono tabular-nums text-muted-foreground">
              {at(range.to)} in
            </span>
          </div>
          <RangeInput
            id={endId}
            min={0}
            max={last}
            step={1}
            value={range.to}
            disabled={saving}
            aria-valuetext={`${at(range.to)} into the run`}
            onChange={(e) =>
              move({
                ...range,
                to: Math.max(Number(e.target.value), range.from + 1),
              })
            }
          />
        </div>
        <p className="text-sm" aria-live="polite">
          {stretch.ok ? (
            <>
              <span className="text-muted-foreground">Length </span>
              <span className="font-semibold font-mono tabular-nums text-foreground">
                {nearDistanceLabel(stretch.metres, unit)}
              </span>
            </>
          ) : (
            <span className="text-warning-strong">{stretch.refusal}</span>
          )}
        </p>
      </div>

      <div className="space-y-1">
        <label
          htmlFor={nameId}
          className="text-sm font-semibold text-foreground"
        >
          Name
        </label>
        <input
          id={nameId}
          type="text"
          value={name}
          maxLength={SEGMENT_NAME_MAX}
          disabled={saving}
          autoComplete="off"
          enterKeyHint="done"
          onChange={(e) => {
            if (state.step === "refused") setState({ step: "picking" });
            setName(e.target.value);
          }}
          className="ds-input text-base"
        />
        <p className="text-xs text-muted-foreground text-pretty">
          Anyone whose run is timed on it sees its name and its line, never who
          made it.
        </p>
      </div>

      {isRestricted ? (
        <RestrictedNotice />
      ) : (
        gate.needsVerification && (
          <VerifyEmailNotice action="make a segment" onRecheck={gate.recheck} />
        )
      )}

      {state.step === "refused" && (
        <p role="alert" className="text-sm font-medium text-warning-strong">
          {state.message}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="ghost"
          className="flex-1"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          loading={saving}
          disabled={held || !stretch.ok || !!nameRefusal}
          onClick={() => void save()}
        >
          Save segment
        </Button>
      </div>
    </Card>
  );
}
