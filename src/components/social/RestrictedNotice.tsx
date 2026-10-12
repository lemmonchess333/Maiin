import { ShieldAlert } from "lucide-react";
import { Banner } from "@/components/ui/Banner";
import { buttonClasses } from "@/components/ui/buttonClasses";
import {
  RESTRICTED_LINE,
  restrictedSupportHref,
} from "@/lib/accountRestriction";

/**
 * "Your account is restricted · Contact support" (Soc5a pin 2), where an
 * action a restricted account cannot take would be (S4e D5): the
 * composers, in the verified-email notice's place, and the joins. The
 * parent decides when to show it and holds its own action alongside, so
 * the reason a button is off is always on screen with it. The server
 * refuses regardless; this explains the refusal before it happens.
 */
export default function RestrictedNotice({
  className,
}: {
  className?: string;
}) {
  return (
    <Banner
      variant="neutral"
      className={className}
      icon={<ShieldAlert className="size-4" />}
      description={RESTRICTED_LINE}
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
