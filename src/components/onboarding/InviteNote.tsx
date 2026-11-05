/**
 * InviteNote — the signed-out screen's line for someone who arrived from a
 * friend's invite link (Soc15 call 5: invites carry who sent them).
 *
 * Shown only when the link left its code on this device
 * (`pendingInvite.ts`). It says who invited them when the server will say
 * (`lookupInvite`: the first word of the inviter's public name, nothing
 * else, and nothing at all for a code it does not know), and "A friend"
 * until then or otherwise, so the line never waits on the network and
 * never claims more than it knows. The second line says what the link
 * will do.
 */
import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { readPendingInvite } from "@/lib/pendingInvite";
import { lookupInviterName } from "@/lib/invites";

export default function InviteNote() {
  const [code] = useState(() => readPendingInvite());
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    let live = true;
    void lookupInviterName(code).then((found) => {
      if (live) setName(found);
    });
    return () => {
      live = false;
    };
  }, [code]);

  if (!code) return null;
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 p-3 rounded-xl bg-primary/8 border border-primary/15 text-sm"
    >
      <UserPlus
        className="size-4 shrink-0 mt-0.5 text-primary"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="font-semibold text-foreground">
          {name
            ? `${name} invited you to Tropos`
            : "A friend invited you to Tropos"}
        </p>
        <p className="text-muted-foreground">
          They'll follow you once you've set up your plan.
        </p>
      </div>
    </div>
  );
}
