import { useState } from 'react';
import { reportContent, type ReportReason } from '../../lib/socialApi';
import { useAuth } from '../../lib/auth';
import { toast } from 'sonner';
import { Flag } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam or misleading' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'other', label: 'Other' },
];

interface Props {
  targetType: 'activity' | 'comment' | 'user';
  targetId: string;
  onClose: () => void;
}

/**
 * Sprint 3: migrated onto the shared <Dialog> primitive. Pre-Sprint-3
 * this modal had a hand-rolled focus trap and a hand-rolled X close
 * button, but no escape handler. Dialog provides escape + backdrop
 * dismiss + focus trap + body scroll lock + animated enter/exit.
 * The hand-rolled X close button is replaced by Dialog's
 * closeButton prop.
 */
export default function ReportModal({ targetType, targetId, onClose }: Props) {
  const { user } = useAuth();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    if (!user || !reason) return;
    setSending(true);
    try {
      await reportContent(user.uid, { targetType, targetId, reason, details: details.trim() || undefined });
      toast.success('Report submitted. We will review this content.');
      onClose();
    } catch {
      toast.error('Failed to submit report. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      closeButton
      // Title rendered in children so we can include the Flag icon
      // alongside it. labelledBy wires aria-labelledby to that span.
      labelledBy="report-modal-title"
    >
      <div className="flex items-center gap-2 pr-6">
        <Flag className="w-4 h-4 text-destructive" aria-hidden="true" />
        <h3
          id="report-modal-title"
          className="text-base font-semibold text-foreground"
        >
          Report {targetType}
        </h3>
      </div>

      <p className="text-sm text-muted-foreground mt-3">
        Why are you reporting this {targetType}?
      </p>

      <div className="space-y-2 mt-3">
        {REASONS.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => setReason(r.value)}
            className={`w-full text-left p-3 rounded-xl text-sm transition-colors border ${
              reason === r.value
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border/50 bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {reason === 'other' && (
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Please describe the issue..."
          aria-label="Describe the issue"
          className="w-full px-3 py-2 rounded-xl bg-muted text-sm text-foreground placeholder:text-muted-foreground resize-none mt-3"
          rows={3}
        />
      )}

      <div className="flex gap-2 mt-4">
        <Button onClick={onClose} variant="secondary" className="flex-1">
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!reason}
          loading={sending}
          variant="destructive"
          className="flex-1"
        >
          Submit Report
        </Button>
      </div>
    </Dialog>
  );
}
