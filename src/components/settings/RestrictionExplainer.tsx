import { ShieldAlert } from "lucide-react";
import { Banner } from "@/components/ui/Banner";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { useRestrictedStatus } from "@/hooks/useRestrictedStatus";
import {
  RESTRICTED_LINE,
  restrictedSupportHref,
} from "@/lib/accountRestriction";

/**
 * Why a restricted account can't do what it can't (S4e D6, STATUS
 * 2026-10-06): at the top of Social & privacy, where Set1 put the
 * account's social settings. The gates elsewhere say only "Your account
 * is restricted"; this says what is stopped, what still works, and how to
 * reach support. It names no end date and no strike count: neither exists
 * while the strike counter and the automatic lift (D2, D3) are unbuilt,
 * and a moderator lifts a restriction by hand.
 */
export default function RestrictionExplainer({
  uid,
}: {
  uid: string | undefined;
}) {
  const { isRestricted } = useRestrictedStatus(uid);
  if (!isRestricted) return null;
  return (
    <Banner
      variant="neutral"
      icon={<ShieldAlert className="size-4" />}
      title={RESTRICTED_LINE}
      description={
        <div className="space-y-1.5">
          <p>
            A moderator restricted your account after a report. Until it is
            lifted, you can't post, comment, give props or likes, follow people,
            or join Spaces, challenges or Circles.
          </p>
          <p>
            Everything else works as normal: logging your training, food and
            runs, your profile, unfollowing and leaving.
          </p>
        </div>
      }
      action={
        <a
          href={restrictedSupportHref()}
          className={buttonClasses({ variant: "outline", size: "sm" })}
        >
          Contact support
        </a>
      }
    />
  );
}
