import { useEffect, useState } from "react";
import { Copy, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatInviteCode } from "@/lib/inviteCode";
import { lookupInviterName } from "@/website/inviterName";

/**
 * A friend's invite on the website (Soc15): who sent it, once the server
 * says, and the code to copy before installing, because an iPhone does
 * not carry it from the browser into the app (docs/ios-invite-links.md).
 * The words are the signed-out welcome's (`InviteNote`), less its sign-up.
 */
export default function WebsiteInvite({ code }: { code: string }) {
  const [inviter, setInviter] = useState<{
    code: string;
    name: string | null;
  } | null>(null);
  const [copyResult, setCopyResult] = useState<{
    code: string;
    message: string;
  } | null>(null);
  const name = inviter?.code === code ? inviter.name : null;

  useEffect(() => {
    let live = true;
    void lookupInviterName(code).then((found) => {
      if (live) setInviter({ code, name: found });
    });
    return () => {
      live = false;
    };
  }, [code]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(formatInviteCode(code));
      setCopyResult({
        code,
        message: "Code copied. Keep it for setup after installing Tropos.",
      });
    } catch {
      setCopyResult({
        code,
        message:
          "Couldn’t copy. Touch and hold the code to select and copy it.",
      });
    }
  };

  return (
    <div className="p-[12px] rounded-xl bg-primary/8 border border-primary/15 text-sm">
      <div className="flex items-start gap-2.5">
        <UserPlus
          className="size-4 shrink-0 mt-0.5 text-lifting-strong"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p role="status" className="font-semibold text-foreground">
            {name
              ? `${name} invited you to Tropos`
              : "A friend invited you to Tropos"}
          </p>
          <p className="text-muted-foreground">
            They’ll follow you once you’ve set up your plan.
          </p>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <p className="text-sm text-foreground">
          Installing Tropos on your iPhone? Copy this code first.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-mono tabular-nums font-semibold select-all">
            {formatInviteCode(code)}
          </p>
          <Button
            variant="outline"
            className="max-w-full"
            onClick={() => void copyCode()}
            leftIcon={<Copy className="size-4" aria-hidden="true" />}
          >
            Copy invite code
          </Button>
        </div>
        <p className="text-muted-foreground">
          After installing, paste it into “Invited by a friend?” during setup.
          Already finished setup? Open Social, then Find people to use it within
          your account’s first 14 days.
        </p>
        <p className="text-muted-foreground">
          Or, once Tropos is installed, tap the invite link in the message
          again.
        </p>
        {copyResult?.code === code && <p role="status">{copyResult.message}</p>}
      </div>
    </div>
  );
}
