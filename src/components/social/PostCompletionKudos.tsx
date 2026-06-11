import { ThumbsUp, Check } from "lucide-react";
import { THEME } from "@/lib/theme";
import BlockAwareAvatar from "@/components/social/BlockAwareAvatar";
import type { KudosCandidate } from "@/lib/postCompletionKudos";

/**
 * Phase 2 — post-completion kudos prompt. Calm, optional, shown only AFTER a
 * session completes when someone the user follows also trained today. Pure
 * presentational; all logic + rate-limiting lives in usePostCompletionKudos.
 */
export default function PostCompletionKudos({
  candidate,
  sending,
  sent,
  onSend,
  onDismiss,
}: {
  candidate: KudosCandidate | null;
  sending: boolean;
  sent: boolean;
  onSend: () => void;
  onDismiss: () => void;
}) {
  if (!candidate) return null;
  const verb = candidate.type === "run" ? "ran" : "trained";

  return (
    <div className="rounded-2xl bg-card card-shadow p-4">
      <div className="flex items-center gap-3">
        <BlockAwareAvatar
          uid={candidate.authorId}
          photoURL={candidate.authorPhotoURL}
          displayName={candidate.authorName}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground leading-snug">
            {candidate.authorName} also {verb} today
          </p>
          <p className="text-xs text-muted-foreground leading-snug">
            Send them some kudos?
          </p>
        </div>
      </div>

      {sent ? (
        <div
          className="mt-3 flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl text-sm font-semibold"
          style={{
            color: THEME.semantic.positive,
            background: `${THEME.semantic.positive}12`,
          }}
        >
          <Check size={16} />
          Kudos sent
        </div>
      ) : (
        <div className="flex items-center gap-2 mt-3">
          <button
            type="button"
            onClick={onSend}
            disabled={sending}
            className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-white motion-safe:active:scale-[0.99] transition-transform disabled:opacity-60"
            style={{ background: THEME.brand }}
          >
            <ThumbsUp size={16} />
            {sending ? "Sending…" : "Send kudos"}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="min-h-[44px] px-4 rounded-xl text-sm font-medium text-muted-foreground bg-muted/60 motion-safe:active:scale-[0.99] transition-transform"
          >
            Not now
          </button>
        </div>
      )}
    </div>
  );
}
