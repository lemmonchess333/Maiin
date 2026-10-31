import type { ReactNode, Ref } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import VerifyEmailNotice from "./VerifyEmailNotice";
import RestrictedNotice from "./RestrictedNotice";
import { COMMENT_MAX_CHARS } from "@/lib/commentLimit";

export interface CommentComposerProps {
  text: string;
  onTextChange: (text: string) => void;
  onSend: () => void;
  sending: boolean;
  /** Comments are public: an unverified email reads but can't add one. */
  needsVerification: boolean;
  onRecheck: () => Promise<boolean>;
  /** A restricted account reads the thread but can't add to it (S4e). */
  isRestricted: boolean;
  /** Quick replies, offered on a session's post only. */
  quickChips?: string[];
  inputRef?: Ref<HTMLInputElement>;
}

interface CommentSheetFrameProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The count the card that opened the sheet shows. */
  commentCount: number;
  /** A comment being acted on (CommentPanels), shown in place of the list. */
  panel: ReactNode;
  /** The list before it has a comment to show, or null once it has one. */
  status: "loading" | "failed" | "empty" | null;
  onRetry: () => void;
  composer: CommentComposerProps;
  /** The comments, and anything under them. */
  children: ReactNode;
}

/**
 * The comment sheet, whichever post it opens on. A session in the feed
 * and a post in a Space read their comments from different callables and
 * draw their rows differently (only the feed's take reactions), but the
 * sheet around them is this one: the same title with the count, the same
 * empty, loading and failed states, and the same field and Send button
 * under the list, which scrolls while they stay put.
 */
export default function CommentSheetFrame({
  open,
  onOpenChange,
  commentCount,
  panel,
  status,
  onRetry,
  composer,
  children,
}: CommentSheetFrameProps) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Comments${commentCount > 0 ? ` (${commentCount})` : ""}`}
      maxHeight="max-h-[70vh]"
    >
      {panel ? (
        // Report, Block user and Delete happen in the sheet, in place of
        // the list (CommentPanels says why a dialog cannot go over it).
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">{panel}</div>
      ) : (
        <>
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
            <CommentListStatus status={status} onRetry={onRetry} />
            {children}
          </div>
          <CommentComposer {...composer} />
        </>
      )}
    </BottomSheet>
  );
}

/** A thread before it has a comment to show: loading, failed with Try
 *  again, or empty. The sheet's and the post page's (ActivityPostComments). */
export function CommentListStatus({
  status,
  onRetry,
}: {
  status: "loading" | "failed" | "empty" | null;
  onRetry: () => void;
}) {
  if (status === "loading")
    return (
      <div className="flex justify-center py-8">
        <Spinner size="sm" variant="muted" label="Loading comments" />
      </div>
    );
  if (status === "failed")
    return (
      <div className="text-center py-8 space-y-2" role="alert">
        <p className="text-sm font-medium text-foreground">
          Couldn't load comments
        </p>
        <p className="text-xs text-muted-foreground">
          Check your connection and try again.
        </p>
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  if (status === "empty")
    return (
      <div className="text-center py-8 space-y-1.5">
        <p className="text-sm font-medium text-foreground">No comments yet</p>
        <p className="text-xs text-muted-foreground">
          Be the first to leave a comment
        </p>
      </div>
    );
  return null;
}

/** The field and Send under a post's comments: at the foot of the sheet,
 *  and pinned above the tab bar on the post's own page
 *  (ActivityPostComments). */
export function CommentComposer({
  text,
  onTextChange,
  onSend,
  sending,
  needsVerification,
  onRecheck,
  isRestricted,
  quickChips,
  inputRef,
}: CommentComposerProps) {
  const held = sending || needsVerification || isRestricted;
  return (
    <div className="border-t border-border/30 px-4 pt-3 pb-4 space-y-2">
      {isRestricted ? (
        <RestrictedNotice />
      ) : (
        needsVerification && (
          <VerifyEmailNotice action="comment" onRecheck={onRecheck} />
        )
      )}
      {quickChips && quickChips.length > 0 && !isRestricted && (
        <div data-no-page-swipe className="flex gap-1.5 overflow-x-auto pb-1">
          {quickChips.map((chip) => (
            <button
              type="button"
              key={chip}
              onClick={() => onTextChange(chip)}
              className="shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition active:scale-95 bg-primary/10 text-lifting-strong"
            >
              {chip}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          // Enter sends, unless it is ending a word being composed (IME).
          onKeyDown={(e) =>
            e.key === "Enter" && !e.nativeEvent.isComposing && onSend()
          }
          enterKeyHint="send"
          maxLength={COMMENT_MAX_CHARS}
          placeholder="Add a comment…"
          aria-label="Add a comment"
          disabled={held}
          className="ds-input flex-1 min-w-0 text-sm"
        />
        <Button onClick={onSend} disabled={held || !text.trim()}>
          Send
        </Button>
      </div>
    </div>
  );
}
