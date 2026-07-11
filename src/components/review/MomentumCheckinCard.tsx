/**
 * Momentum Check-in card (CHECKIN-01) — the Weekly Review's decision
 * moment. Two bounded questions (plan feel + one next-week focus), a
 * single contextual next action, and a dismiss that won't re-nag for
 * the same review week. The review stays fully useful if this is
 * ignored — the card is additive, never a gate.
 *
 * Every response maps to NAVIGATION only (see momentumCheckin.ts):
 * no answer auto-changes programme volume, calorie targets or goals.
 * Answers are owner-only (`users/{uid}/checkins/{weekKey}`, rules
 * enforced) and are never copied to any social surface.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { X, CheckCircle2, CalendarCheck } from "lucide-react";
import { db } from "@/lib/firebase";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptic";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import SectionLabel from "@/components/ui/SectionLabel";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import {
  FEEL_OPTIONS,
  FOCUS_OPTIONS,
  nextActionForFeel,
  parseCheckin,
  type MomentumCheckin,
  type MomentumFocus,
  type PlanFeel,
} from "@/lib/momentumCheckin";

interface Props {
  uid: string;
  /** Reviewed week key — also the doc id (idempotent per week). */
  weekKey: string;
}

function checkinRef(uid: string, weekKey: string) {
  return doc(db, "users", uid, "checkins", weekKey);
}

function pillClass(selected: boolean): string {
  return cn(
    "min-h-[44px] px-3 rounded-xl text-xs font-semibold transition-colors active:scale-[0.97]",
    selected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
  );
}

export default function MomentumCheckinCard({ uid, weekKey }: Props) {
  const navigate = useNavigate();
  // undefined = loading, null = no doc yet (show the questions)
  const [existing, setExisting] = useState<MomentumCheckin | null | undefined>(
    undefined
  );
  const [feel, setFeel] = useState<PlanFeel | null>(null);
  const [focus, setFocus] = useState<MomentumFocus | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const snap = await getDoc(checkinRef(uid, weekKey));
        if (cancelled) return;
        setExisting(snap.exists() ? parseCheckin(snap.data()) : null);
      } catch (err) {
        // Read failure → keep the review calm: hide the card entirely
        // rather than risk a duplicate-nag or a broken form. Leaving the
        // state `undefined` does exactly that (`parseCheckin(null)` is
        // null — it would have re-shown the blank questions and let a
        // resave overwrite an answer we simply failed to read).
        logger.error("momentumCheckin: load failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, weekKey]);

  const save = async (record: MomentumCheckin) => {
    setSaving(true);
    try {
      await setDocGuarded(checkinRef(uid, weekKey), record);
      setExisting(record);
    } catch (err) {
      logger.error("momentumCheckin: save failed", err);
    } finally {
      setSaving(false);
    }
  };

  const submit = () => {
    if (!feel) return;
    haptic("light");
    void save({ weekKey, feel, focus, createdAt: Date.now() });
  };

  const dismiss = () => {
    haptic("light");
    void save({
      weekKey,
      feel: "good_fit",
      focus: null,
      dismissed: true,
      createdAt: Date.now(),
    });
  };

  // Loading, load-failed, or dismissed — render nothing. The review
  // must be complete without the check-in.
  if (existing === undefined || existing?.dismissed) return null;

  // Read-back state: answered this week already.
  if (existing) {
    const action = nextActionForFeel(existing.feel);
    const feelLabel = FEEL_OPTIONS.find(
      (o) => o.value === existing.feel
    )?.label;
    const focusLabel = existing.focus
      ? FOCUS_OPTIONS.find((o) => o.value === existing.focus)?.label
      : null;
    return (
      <div className="p-4 rounded-2xl bg-card space-y-2">
        <SectionLabel as="h2">Momentum check-in</SectionLabel>
        <div className="flex items-start gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 shrink-0">
            <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              Checked in — {feelLabel}
            </p>
            {focusLabel && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Next week: {focusLabel}
              </p>
            )}
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate(action.to)}
        >
          {action.label}
        </Button>
      </div>
    );
  }

  // Question state.
  return (
    <div className="p-4 rounded-2xl bg-card space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 shrink-0">
            <CalendarCheck className="size-4 text-primary" aria-hidden="true" />
          </div>
          <div>
            <SectionLabel as="h2">Momentum check-in</SectionLabel>
            <p className="text-sm font-semibold text-foreground">
              How did this week&apos;s plan feel?
            </p>
          </div>
        </div>
        <IconButton
          aria-label="Dismiss check-in"
          icon={<X className="size-4" aria-hidden="true" />}
          onClick={dismiss}
        />
      </div>

      <SegmentedControl
        options={FEEL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        value={feel}
        onChange={(v) => {
          haptic("light");
          setFeel(v);
        }}
        ariaLabel="Plan feel"
      />

      {feel && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            One focus for next week — optional, pick what&apos;s realistic.
          </p>
          <div
            className="grid grid-cols-2 gap-2"
            role="group"
            aria-label="Next week focus"
          >
            {FOCUS_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={focus === o.value}
                className={pillClass(focus === o.value)}
                onClick={() => {
                  haptic("light");
                  setFocus((prev) => (prev === o.value ? null : o.value));
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
          <Button onClick={submit} loading={saving} className="w-full">
            Save check-in
          </Button>
        </div>
      )}
    </div>
  );
}
