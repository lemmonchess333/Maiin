/**
 * InviteFriendCard — People's "Bring a friend": the person's own invite
 * link and code (Soc15 calls 4 and 5).
 *
 * The link carries the code (`https://troposfit.com/?invite=K7P49M2H`), and
 * the code is shown too, to read out or paste after installing the app.
 * Once the friend's plan is made, this person
 * follows them, and they follow this person at once or, while this person
 * approves followers (the default), ask to (Soc15 call 4 as narrowed by
 * its STATUS line): a code posted publicly reaches no followers-only post.
 *
 * The code is made the first time it is asked for (getInviteCode) and kept
 * on the account (`profile.inviteCode`), so after that it shows at once. A
 * restricted account gets none: the card's actions are off, as People's
 * other ways of reaching people are.
 *
 * New code renews it (renewInviteCode): the old link and code stop working
 * at once, as a Circle owner's New code does. A block renews it too, when
 * the person blocked joined from it (Soc15), and the
 * profile here is read once, so the card asks the server for the code each
 * time People opens rather than share one that no longer works.
 */
import { useEffect, useState } from "react";
import { Copy, RefreshCw, Share } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { THEME } from "@/lib/theme";
import { toast } from "@/lib/toast";
import { appInviteUrl } from "@/lib/publicLinks";
import { formatInviteCode, normaliseInviteCode } from "@/lib/inviteCode";
import {
  fetchMyInviteCode,
  INVITE_CODE_UNAVAILABLE,
  renewMyInviteCode,
} from "@/lib/invites";

export default function InviteFriendCard({
  active,
  disabled,
}: {
  /** People is open: the code is fetched only then, and once. */
  active: boolean;
  /** A restricted account: no code is made and the actions are off. */
  disabled: boolean;
}) {
  const { profile } = useAuth();
  const [code, setCode] = useState<string | null>(() =>
    normaliseInviteCode(profile?.inviteCode)
  );
  const [fetching, setFetching] = useState(false);
  const [renewing, setRenewing] = useState(false);

  /* The code shows as soon as People opens, from the profile, and the
     server's answer replaces it: a block may have renewed it since the
     profile was read. Made on the first open after setup. A failure keeps
     the profile's; Share asks again when there is none. */
  useEffect(() => {
    if (!active || disabled) return;
    let live = true;
    fetchMyInviteCode()
      .then((next) => {
        if (live) setCode(next);
      })
      .catch(() => {
        /* Share asks again and says so if it fails. */
      });
    return () => {
      live = false;
    };
  }, [active, disabled]);

  const ensureCode = async (): Promise<string | null> => {
    if (code) return code;
    setFetching(true);
    try {
      const next = await fetchMyInviteCode();
      setCode(next);
      return next;
    } catch {
      toast.error(INVITE_CODE_UNAVAILABLE);
      return null;
    } finally {
      setFetching(false);
    }
  };

  const share = async () => {
    const mine = await ensureCode();
    if (!mine) return;
    const text = `I'm tracking my lifts and runs on Tropos. Join me with my invite code ${formatInviteCode(mine)}.`;
    const url = appInviteUrl(mine);
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join me on Tropos", text, url });
      } catch {
        /* cancelled */
      }
      return;
    }
    // The clipboard can refuse (no permission, an insecure context), and
    // a promise that rejected here said nothing at all.
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast.success("Invite link copied");
    } catch {
      toast.error("Couldn't copy the invite link. Try again.");
    }
  };

  const renew = async () => {
    setRenewing(true);
    try {
      setCode(await renewMyInviteCode());
      toast.success("New invite code. The old one no longer works.");
    } catch {
      toast.error("Couldn't make a new code. Try again.");
    } finally {
      setRenewing(false);
    }
  };

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(formatInviteCode(code));
      toast.success("Code copied");
    } catch {
      toast.error("Couldn't copy. Long-press the code to select it.");
    }
  };

  return (
    <div
      className="p-3 rounded-2xl border space-y-3"
      style={{
        background: `linear-gradient(135deg, ${THEME.brand}18, ${THEME.brand}08)`,
        borderColor: `${THEME.brand}33`,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="size-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${THEME.brand}25` }}
        >
          <Share
            className="size-4"
            style={{ color: THEME.brand }}
            aria-hidden="true"
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            Invite a training partner
          </p>
          <p className="text-small text-muted-foreground leading-relaxed mt-0.5">
            {profile?.approveFollowers === false
              ? "When they join with your link or code, you follow each other."
              : "When they join with your link or code, you'll follow them and they'll ask to follow you."}
          </p>
        </div>
      </div>
      {code && !disabled && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <div className="flex-1 min-w-[min(100%,10em)]">
            <p className="text-xs font-semibold text-muted-foreground">
              Your code
            </p>
            <p className="text-lg font-semibold font-mono tabular-nums text-foreground select-all">
              {formatInviteCode(code)}
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={() => void copyCode()}
            leftIcon={<Copy className="size-4" aria-hidden="true" />}
          >
            Copy code
          </Button>
          <Button
            variant="ghost"
            onClick={() => void renew()}
            loading={renewing}
            leftIcon={<RefreshCw className="size-4" aria-hidden="true" />}
          >
            New code
          </Button>
        </div>
      )}
      <p className="text-small text-muted-foreground">
        If your friend needs to install Tropos, ask them to copy the code first
        and paste it into “Invited by a friend?” during setup.
      </p>
      <Button
        fullWidth
        onClick={() => void share()}
        loading={fetching}
        disabled={disabled}
        aria-label={
          disabled
            ? "Inviting is unavailable while your account is restricted"
            : undefined
        }
      >
        Share invite link
      </Button>
    </div>
  );
}
