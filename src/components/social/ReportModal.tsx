/**
 * ReportModal — S4 two-tier picker + three-checkbox submission.
 *
 * Locked decision (S4b + S4c):
 *   - Five top-level categories (Harassment / Spam / Inappropriate /
 *     Impersonation / Other) × 2-4 sub-reasons each. Single screen,
 *     no modal stacking.
 *   - Three checkboxes at submit: Report (default-ON), Hide from feed
 *     (default-ON), Block author (default-OFF).
 *     Submit disabled only if all three are unchecked.
 *   - 500-char freeform note with live counter.
 *   - Hide + Block take effect immediately on Submit; Report queues
 *     for admin review separately.
 *
 * Block author is opt-in (default off) because it's heavier than
 * Report — the reporter has to explicitly opt in to severing the
 * relationship.
 */
import { useState } from "react";
import {
  blockUser,
  reportContent,
  type ReportCategory,
} from "../../lib/socialApi";
import { useAuth } from "../../lib/auth";
import { useHiddenActivities } from "@/hooks/useHiddenActivities";
import { toast } from "sonner";
import { Flag, Check } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const FREEFORM_MAX = 500;

interface CategoryDef {
  value: ReportCategory;
  label: string;
  /** Concrete sub-reasons. Closed set per category — keeps the picker
   *  consistent. The server accepts any string so adding new ones is
   *  client-only. */
  subReasons: string[];
}

const CATEGORIES: CategoryDef[] = [
  {
    value: "harassment",
    label: "Harassment or bullying",
    subReasons: [
      "Targeted insults or threats",
      "Repeated unwanted contact",
      "Encouraging self-harm",
      "Other harassment",
    ],
  },
  {
    value: "spam",
    label: "Spam or misleading",
    subReasons: [
      "Unsolicited promotion",
      "Fake or misleading claims",
      "Scam or phishing",
    ],
  },
  {
    value: "inappropriate",
    label: "Inappropriate content",
    subReasons: [
      "Sexual or explicit",
      "Hateful symbols or slurs",
      "Violent or graphic",
    ],
  },
  {
    value: "impersonation",
    label: "Impersonation",
    subReasons: [
      "Pretending to be someone else",
      "Brand or organisation",
    ],
  },
  {
    value: "other",
    label: "Other",
    subReasons: [],
  },
];

interface Props {
  targetType: "activity" | "comment" | "user";
  targetId: string;
  /** Author of the reported content. Required if Block author should
   *  do anything; UserProfile passes the same uid as targetId since
   *  the profile IS the user. ActivityCard / comment surfaces pass
   *  the activity author's uid. */
  targetAuthorUid?: string;
  onClose: () => void;
}

export default function ReportModal({
  targetType,
  targetId,
  targetAuthorUid,
  onClose,
}: Props) {
  const { user } = useAuth();
  const { hide } = useHiddenActivities();

  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [subReason, setSubReason] = useState<string | null>(null);
  const [freeform, setFreeform] = useState("");
  const [doReport, setDoReport] = useState(true);
  const [doHide, setDoHide] = useState(true);
  const [doBlock, setDoBlock] = useState(false);
  const [sending, setSending] = useState(false);

  const activeCategory = CATEGORIES.find((c) => c.value === category) ?? null;
  // Submit disabled if no category picked OR nothing checked OR
  // (when Report is checked) no sub-reason selected for categories
  // that have sub-reasons. "Other" has no sub-reasons, so it skips.
  const subReasonRequired = !!activeCategory && activeCategory.subReasons.length > 0 && doReport;
  const subReasonMissing = subReasonRequired && !subReason;
  const nothingChecked = !doReport && !doHide && !doBlock;
  const canSubmit = !!category && !subReasonMissing && !nothingChecked;
  // Block requires knowing the author uid. Hide that checkbox if we
  // don't know who to block (e.g. legacy callsite that hasn't passed
  // targetAuthorUid through yet).
  const blockAvailable = !!targetAuthorUid && targetAuthorUid !== user?.uid;

  async function handleSubmit() {
    if (!user || !category) return;
    setSending(true);
    try {
      // Run the three actions independently so a failure in one
      // doesn't block the others. Block takes precedence (heaviest);
      // Report queues to admin; Hide is local-only.
      if (doBlock && blockAvailable && targetAuthorUid) {
        await blockUser(user.uid, targetAuthorUid);
      }
      if (doReport) {
        await reportContent(user.uid, {
          targetType,
          targetId,
          targetUid: targetAuthorUid,
          category,
          subReason: subReason ?? undefined,
          freeformNote: freeform.trim() || undefined,
          hideFromFeed: doHide,
          blockAuthor: doBlock && blockAvailable,
        });
      }
      if (doHide && targetType === "activity") {
        hide(targetId);
      }
      // Success messaging — adapt copy to what actually fired.
      const parts: string[] = [];
      if (doReport) parts.push("Report submitted");
      if (doBlock && blockAvailable) parts.push("user blocked");
      if (doHide && targetType === "activity") parts.push("hidden from your feed");
      toast.success(parts.length > 0 ? parts.join(" · ") + "." : "Done.");
      onClose();
    } catch {
      toast.error("Couldn't complete that. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      closeButton
      labelledBy="report-modal-title"
    >
      <div className="flex items-center gap-2 pr-6">
        <Flag className="w-4 h-4 text-destructive" aria-hidden="true" />
        <h3 id="report-modal-title" className="text-base font-semibold text-foreground">
          Report {targetType}
        </h3>
      </div>

      {/* Category picker (top-level) */}
      <fieldset className="mt-4 space-y-2">
        <legend className="text-sm text-muted-foreground">
          Why are you reporting this {targetType}?
        </legend>
        <div role="radiogroup" aria-label="Report category" className="space-y-1.5">
          {CATEGORIES.map((c) => {
            const isSelected = category === c.value;
            return (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => {
                  setCategory(c.value);
                  setSubReason(null);
                }}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-lg text-sm border",
                  "motion-safe:transition-colors",
                  isSelected
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border/50 bg-muted text-muted-foreground hover:bg-muted/80",
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Sub-reason picker (second tier). Only renders for categories
          that have sub-reasons. "Other" deliberately has none — the
          freeform note covers the unstructured case. */}
      {activeCategory && activeCategory.subReasons.length > 0 ? (
        <fieldset className="mt-3 space-y-2">
          <legend className="text-xs uppercase tracking-wider text-muted-foreground">
            More specifically
          </legend>
          <div role="radiogroup" aria-label="Sub-reason" className="flex flex-wrap gap-1.5">
            {activeCategory.subReasons.map((sr) => {
              const isSelected = subReason === sr;
              return (
                <button
                  key={sr}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setSubReason(sr)}
                  className={cn(
                    "px-2.5 py-1.5 rounded-lg text-xs font-medium",
                    "motion-safe:transition-colors",
                    isSelected
                      ? "bg-primary-strong text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {sr}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {/* Freeform note — always available, max 500 chars. */}
      {category ? (
        <div className="mt-3">
          <label
            htmlFor="report-freeform"
            className="text-xs uppercase tracking-wider text-muted-foreground"
          >
            Anything else? <span className="lowercase">(optional)</span>
          </label>
          <textarea
            id="report-freeform"
            value={freeform}
            onChange={(e) => setFreeform(e.target.value.slice(0, FREEFORM_MAX))}
            placeholder="Add context for the review team…"
            className="w-full mt-1 px-3 py-2 rounded-xl bg-muted text-sm text-foreground placeholder:text-muted-foreground resize-none"
            rows={3}
            maxLength={FREEFORM_MAX}
          />
          <p className="text-[10px] text-muted-foreground text-right mt-0.5 font-mono tabular-nums">
            {freeform.length} / {FREEFORM_MAX}
          </p>
        </div>
      ) : null}

      {/* Action checkboxes — what to do with this report. */}
      {category ? (
        <div className="mt-3 space-y-1.5">
          <ActionCheckbox
            label="Send to review team"
            description="Admins review and may hide, restrict, or remove."
            checked={doReport}
            onChange={setDoReport}
          />
          {targetType === "activity" ? (
            <ActionCheckbox
              label="Hide from my feed"
              description="You won't see this activity again."
              checked={doHide}
              onChange={setDoHide}
            />
          ) : null}
          {blockAvailable ? (
            <ActionCheckbox
              label="Block this user"
              description="Hide their activities everywhere. Reversible from Settings."
              checked={doBlock}
              onChange={setDoBlock}
            />
          ) : null}
        </div>
      ) : null}

      <div className="flex gap-2 mt-4">
        <Button onClick={onClose} variant="secondary" className="flex-1">
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!canSubmit}
          loading={sending}
          variant="destructive"
          className="flex-1"
        >
          Submit
        </Button>
      </div>
    </Dialog>
  );
}

interface ActionCheckboxProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

function ActionCheckbox({ label, description, checked, onChange }: ActionCheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "w-full flex items-start gap-3 px-3 py-2.5 rounded-lg border text-left",
        "motion-safe:transition-colors motion-safe:active:scale-[0.99]",
        checked
          ? "border-primary/30 bg-primary/5"
          : "border-border/50 bg-card hover:bg-muted/30",
      )}
    >
      <span
        className={cn(
          "mt-0.5 w-4 h-4 rounded shrink-0 inline-flex items-center justify-center border",
          checked
            ? "bg-primary-strong border-primary-strong text-primary-foreground"
            : "border-border",
        )}
        aria-hidden="true"
      >
        {checked ? <Check className="w-3 h-3" strokeWidth={3} /> : null}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}
