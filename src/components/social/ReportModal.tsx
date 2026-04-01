import { useState } from 'react';
import { reportContent, type ReportReason } from '../../lib/socialApi';
import { useAuth } from '../../lib/auth';
import { toast } from 'sonner';
import { X, Flag } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

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

export default function ReportModal({ targetType, targetId, onClose }: Props) {
  const { user } = useAuth();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const focusTrapRef = useFocusTrap<HTMLDivElement>();

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
    <>
      <div className="fixed inset-0 bg-black/50 z-[1000]" onClick={onClose} aria-hidden="true" />
      <div
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-modal-title"
        className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[1001] bg-card rounded-2xl p-5 space-y-4 max-w-sm mx-auto shadow-xl"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-destructive" />
            <h3 id="report-modal-title" className="text-base font-semibold text-foreground">Report {targetType}</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted" aria-label="Close">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground">
          Why are you reporting this {targetType}?
        </p>

        <div className="space-y-2">
          {REASONS.map((r) => (
            <button
              key={r.value}
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
            className="w-full px-3 py-2 rounded-xl bg-muted text-sm text-foreground placeholder:text-muted-foreground resize-none"
            rows={3}
          />
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-muted text-foreground text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!reason || sending}
            className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-medium disabled:opacity-50"
          >
            {sending ? 'Submitting...' : 'Submit Report'}
          </button>
        </div>
      </div>
    </>
  );
}
