import { usePostCompletionKudos } from "@/hooks/usePostCompletionKudos";
import PostCompletionKudos from "./PostCompletionKudos";

/** Loaded only once a run is saved, keeping social detail out of the save path. */
export default function SavedRunKudos({
  uid,
  fromName,
}: {
  uid?: string;
  fromName?: string;
}) {
  const kudos = usePostCompletionKudos({ uid, fromName });
  if (!kudos.candidate) return null;
  return (
    <div className="mx-4 mb-4">
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
