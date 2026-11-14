import { usePostCompletionKudos } from "@/hooks/usePostCompletionKudos";
import PostCompletionKudos from "./PostCompletionKudos";

/** The props prompt on both finish screens, the lift's and the run's (App1
 *  Q30). Loaded only once the session is saved, keeping social detail out
 *  of the save path. Draws nothing, and so takes no room, unless someone
 *  the person follows also trained today: `className` places it only
 *  when it shows. */
export default function SavedSessionKudos({
  uid,
  fromName,
  className,
}: {
  uid?: string;
  fromName?: string;
  className?: string;
}) {
  const kudos = usePostCompletionKudos({ uid, fromName });
  if (!kudos.candidate) return null;
  return (
    <div className={className}>
      <PostCompletionKudos
        candidate={kudos.candidate}
        sending={kudos.sending}
        sent={kudos.sent}
        onSend={kudos.sendKudos}
        onDismiss={kudos.dismiss}
      />
    </div>
  );
}
