import { Button } from "@/components/ui/Button";
import { isAppleRelayEmail } from "@/lib/appleRelay";
import { signInMethodLabel, type SignInMethod } from "@/lib/signInMethod";

interface Props {
  method: SignInMethod | null;
  email: string | null;
  onSignInAnotherWay: () => void;
}

/**
 * Setup's first screen names how the account was made (Polish2 call 3).
 * Hide My Email gives an Apple account a relay address, so a later Google
 * or password sign-in makes a second, empty account; a returning person
 * who lands here on a new phone, where Login has no "Last used", can see
 * it and sign out before setting anything up. A relay address is left out,
 * since nobody recognises one.
 */
export default function NewAccountMethodNote({
  method,
  email,
  onSignInAnotherWay,
}: Props) {
  if (!method) return null;
  const shownEmail = email && !isAppleRelayEmail(email) ? email : null;
  return (
    <div className="rounded-xl bg-muted/50 px-3.5 py-3 text-sm text-muted-foreground">
      <p>
        Setting up a new account with {signInMethodLabel(method)}
        {shownEmail ? (
          <>
            {" "}
            (<span className="break-all">{shownEmail}</span>)
          </>
        ) : null}
        .
      </p>
      <Button
        variant="ghost"
        size="md"
        onClick={onSignInAnotherWay}
        className="-mx-4 -mb-2 text-lifting-strong font-semibold"
      >
        Used Tropos before? Sign in another way
      </Button>
    </div>
  );
}
