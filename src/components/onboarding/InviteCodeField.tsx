/**
 * InviteCodeField — setup's optional "Invited by a friend?" (Soc15 call 4).
 *
 * On the last step, under the name. Closed unless a code is waiting: an
 * invite link opened on this device leaves its code (`pendingInvite.ts`),
 * and the field opens with it filled in. The iPhone app does not open
 * troposfit.com links, so there the person types the code a friend read
 * out or sent. Nothing is sent until the plan is made; then the code is
 * used and the two follow each other (Onboarding's finish, then
 * `redeemInviteAfterSetup`).
 *
 * Optional: leaving it empty changes nothing, and a code that cannot be one
 * says so here, before the person leaves setup.
 */
import { useId, useState } from "react";
import { normaliseInviteCode } from "@/lib/inviteCode";
import { NOT_A_CODE } from "@/lib/invites";

export default function InviteCodeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const inputId = useId();
  const noteId = useId();
  const errorId = useId();
  // Said once the person leaves the field, not at every letter typed.
  const [left, setLeft] = useState(false);
  // Open from the start when a code is waiting; after that the person opens
  // and closes it, and clearing the field does not snap it shut.
  const [startsOpen] = useState(() => value.trim().length > 0);
  const typed = value.trim();
  const invalid =
    left && typed.length > 0 && normaliseInviteCode(typed) === null;

  return (
    <details
      className="rounded-2xl bg-card card-shadow px-4"
      open={startsOpen || undefined}
    >
      <summary className="min-h-11 py-3 cursor-pointer text-base font-semibold">
        Invited by a friend?
      </summary>
      <div className="space-y-2 pb-4">
        <label htmlFor={inputId} className="block text-sm font-medium">
          Their invite code
        </label>
        <input
          id={inputId}
          className="ds-input w-full min-h-11 font-mono"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setLeft(true)}
          placeholder="ABCD-2345"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={12}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${noteId} ${errorId}` : noteId}
        />
        <p id={noteId} className="text-sm text-muted-foreground">
          You'll follow each other once your plan is made.
        </p>
        {invalid && (
          <p id={errorId} className="text-sm text-destructive-strong">
            {NOT_A_CODE}
          </p>
        )}
      </div>
    </details>
  );
}
