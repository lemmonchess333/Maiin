/**
 * InviteCodeEntry — "Invited by a friend?" on People, for an account in its
 * first 14 days that has not used an invite (Soc15 call 4).
 *
 * Setup offers the same field; this is the way back for someone who
 * skipped it, mistyped it, or opened the friend's link after setting up.
 * It starts from a code an invite link left on this device. Using the
 * code makes the two follow each other at once (redeemInvite); the line
 * that says so replaces the field.
 *
 * Nothing shows for an older account, one that already joined from an
 * invite, or a restricted one.
 */
import { useId, useState, type FormEvent } from "react";
import { UserCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import SectionHeading from "@/components/ui/SectionHeading";
import {
  formatInviteCode,
  isWithinInviteWindow,
  normaliseInviteCode,
} from "@/lib/inviteCode";
import { clearPendingInvite, readPendingInvite } from "@/lib/pendingInvite";
import {
  describeInviteRefusal,
  inviteJoinedLine,
  isFinalInviteRefusal,
  NOT_A_CODE,
  redeemInviteCode,
} from "@/lib/invites";

export default function InviteCodeEntry({ disabled }: { disabled: boolean }) {
  const { user, profile, refreshProfile } = useAuth();
  const [now] = useState(() => Date.now());
  const [value, setValue] = useState(() => {
    const pending = readPendingInvite();
    return pending ? formatInviteCode(pending) : "";
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [joined, setJoined] = useState<string | null>(null);
  const inputId = useId();
  const messageId = useId();

  if (joined) {
    return (
      <div
        role="status"
        className="flex items-center gap-3 p-3 rounded-xl bg-card"
      >
        <UserCheck
          className="size-5 shrink-0 text-success-strong"
          aria-hidden="true"
        />
        <p className="text-sm font-medium text-foreground">{joined}</p>
      </div>
    );
  }

  const createdAt = Date.parse(user?.metadata?.creationTime ?? "");
  if (
    disabled ||
    !user ||
    !profile ||
    profile.invitedAt != null ||
    !isWithinInviteWindow(createdAt, now)
  ) {
    return null;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const code = normaliseInviteCode(value);
    if (!code) {
      setMessage(NOT_A_CODE);
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const result = await redeemInviteCode(code);
      clearPendingInvite();
      setJoined(inviteJoinedLine(result.inviterName));
      // So the field stays away when People opens again.
      void refreshProfile({ until: (d) => d.invitedAt != null }).catch(
        () => {}
      );
    } catch (err) {
      if (isFinalInviteRefusal(err)) clearPendingInvite();
      setMessage(describeInviteRefusal(err, "people"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-3" aria-labelledby={`${inputId}-heading`}>
      <SectionHeading id={`${inputId}-heading`}>
        Invited by a friend?
      </SectionHeading>
      <form onSubmit={submit} className="space-y-2" noValidate>
        <label
          htmlFor={inputId}
          className="block text-sm text-muted-foreground"
        >
          Enter their invite code and you'll follow each other.
        </label>
        {/* The button drops under the field when the two no longer fit
            (larger text), rather than squeezing the code. Wide-first. */}
        <div className="flex flex-wrap gap-2">
          <input
            id={inputId}
            className="ds-input flex-1 min-w-[min(100%,10em)] min-h-11 font-mono"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (message) setMessage(null);
            }}
            placeholder="K7P4-9M2H"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={12}
            aria-invalid={message !== null}
            aria-describedby={message ? messageId : undefined}
          />
          <Button type="submit" loading={saving} className="shrink-0">
            Use code
          </Button>
        </div>
        {message && (
          <p
            id={messageId}
            role="alert"
            className="text-sm text-destructive-strong"
          >
            {message}
          </p>
        )}
      </form>
    </section>
  );
}
